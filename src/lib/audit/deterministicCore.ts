import type { SupabaseClient } from '@supabase/supabase-js'
import { runAudit, dedupeErrorsByLine, type BillingError, type InsuranceType, type LineItem } from '@/lib/errorDetection'
import { billExtractionToCBS } from '@/lib/cbs/extractor'
import { normalizeCBSSet } from '@/lib/cbs/normalizer'
import type { CanonicalBillingSchema, NormalizedCBSSet } from '@/lib/cbs/schema'
import { MANUAL_REVIEW_ERROR_TYPES } from './manualReview'
import { computeRecoverable, capPotentialSavings, markJustificationOnly } from './savings'

// ─── The deterministic audit core ─────────────────────────────────────────────
// Everything downstream of vision extraction: bill-CBS build → cross-document
// normalization → adjudication-aware rules engine → per-line dedup → honest
// totals. Deliberately free of vision/LLM calls so it can re-run against
// PERSISTED extraction data (bill line items + the stored EOB CBS document)
// when AUDIT_LOGIC_VERSION moves — that is how stale cases are brought current
// without re-spending vision tokens. runFullAudit wraps this with the vision
// EOB extraction and the LLM patient-dispute analysis; /api/recompute-audit
// calls it directly with the persisted inputs. ONE logic path, no drift.

export interface DeterministicAuditInput {
  lineItems: LineItem[]
  insuranceType: InsuranceType
  provider?: string | null
  dateOfService?: string | null
  lowConfidence?: string[]
  docIdBase: string
  accountNumber?: string
  /** Already-extracted EOB CBS (fresh from vision, or the persisted document). */
  eobCbs: CanonicalBillingSchema | null
  /** An EOB input existed for this case (drives eobError when eobCbs is null). */
  eobSupplied: boolean
  billTotals?: {
    statedTotalBilled?: number | null
    patientResponsibility?: number | null
  }
  /** Findings computed outside the deterministic core (LLM patient-dispute
   *  analysis on a fresh run; carried-over patient_disputed rows on a
   *  recompute). Merged before dedup so precedence applies uniformly. */
  extraErrors?: BillingError[]
  supabase?: SupabaseClient
}

export interface FullAuditResult {
  errors: BillingError[]
  lineItems: LineItem[]
  normalizedCbs: NormalizedCBSSet
  provider: string | null
  dateOfService: string
  totalBilled: number
  /** What the bill SHOULD total. With a readable EOB this is the payer's
   *  adjudicated patient obligation, never a benchmark derivation. */
  totalExpected: number
  potentialSavings: number
  /** Disputable findings: priced audit errors + dollar-backed or high/critical
   *  cross-document findings. Manual-review flags and low-confidence
   *  non-matches are excluded — they are review aids, not errors. */
  errorCount: number
  needsReviewCount: number
  hasEob: boolean
  /** An EOB was supplied but couldn't be read (unreadable or unsupported), so
   *  the audit completed bill-only. Callers surface this as a notice, not an error. */
  eobError: boolean
  lowConfidence: string[]
  /** The bill's stated bottom-line patient responsibility (null when the bill
   *  doesn't print one). Hard ceiling on potentialSavings. */
  billPatientResponsibility: number | null
  /** The EOB's adjudicated total patient obligation ("You Owe"); null without
   *  a readable EOB. When present, this IS totalExpected. */
  eobPatientResponsibility: number | null
  /** Extracted line items sum materially (>10%) below the bill's printed total
   *  charges — suspected partial read (e.g. missed pages). Surfaced as a loud
   *  warning, never silent success. */
  suspectedPartialRead: boolean
}

export async function runDeterministicAudit(
  input: DeterministicAuditInput
): Promise<FullAuditResult> {
  const {
    lineItems,
    insuranceType,
    provider = null,
    dateOfService = null,
    lowConfidence = [],
    docIdBase,
    accountNumber = '',
    eobCbs,
    eobSupplied,
    billTotals,
    extraErrors = [],
    supabase,
  } = input

  const billCbs = billExtractionToCBS(
    {
      lineItems: lineItems.map((li) => ({
        cpt_code: li.cpt_code,
        description: li.description ?? '',
        date_of_service: li.date_of_service,
        units: li.units,
        billed_amount: li.billed_amount,
        modifiers: li.modifiers,
      })),
      billMetadata: {
        provider_name: provider ?? '',
        provider_npi: '',
        bill_date: dateOfService ?? '',
        patient_name: '',
        account_number: accountNumber,
      },
      totals: {
        billed: billTotals?.statedTotalBilled ?? null,
        patientResponsibility: billTotals?.patientResponsibility ?? null,
      },
    },
    `bill_${docIdBase}`
  )

  if (eobCbs) {
    // Pin bill + EOB to a shared episode so the normalizer compares them even
    // without a matching claim number / service date.
    const sharedEpisode =
      billCbs.serviceEpisodeId || eobCbs.serviceEpisodeId || billCbs.claimNumber || `episode_${docIdBase}`
    billCbs.serviceEpisodeId = sharedEpisode
    eobCbs.serviceEpisodeId = sharedEpisode
    if (!eobCbs.dateOfService) eobCbs.dateOfService = billCbs.dateOfService
  }

  const normalizedCbs = normalizeCBSSet(eobCbs ? [billCbs, eobCbs] : [billCbs])

  // An EOB was provided but we couldn't read it (unsupported type or extraction
  // failure) — the audit still completed bill-only; flag it so callers can say so.
  const eobError = eobSupplied && !eobCbs

  // Which bill lines did the payer adjudicate? The normalizer's bill↔EOB
  // matching stamps `eobBenchmarked` on billCbs's line objects (shared by
  // reference with the normalized clone), in the same order as `lineItems`.
  const auditItems: LineItem[] = lineItems.map((li, i) => ({
    ...li,
    eobAdjudicated: !!billCbs.lineItems[i]?.eobBenchmarked,
  }))

  // Rules engine (NCCI PTP/MUE, PFS/CLFS pricing, coverage), adjudication-
  // aware. Same call, same graceful degradation when the reference tables are
  // empty, for all callers.
  const errors = await runAudit(auditItems, insuranceType, supabase ? { supabase } : {})
  if (extraErrors.length > 0) errors.push(...extraErrors)

  // One CPT line, one finding: a line flagged as overcharge + unbundling +
  // patient-disputed is one charge counted three times. Strongest evidence wins.
  const dedupedRaw = dedupeErrorsByLine(errors)

  const totalBilled = lineItems.reduce((s, li) => s + Number(li.billed_amount || 0), 0)

  // ── Honest totals ────────────────────────────────────────────────────────────
  const billPatientResponsibility =
    typeof billTotals?.patientResponsibility === 'number' &&
    Number.isFinite(billTotals.patientResponsibility) &&
    billTotals.patientResponsibility >= 0
      ? billTotals.patientResponsibility
      : null
  const eobPatientResponsibility =
    eobCbs && typeof eobCbs.totalPatientResponsibility === 'number'
      ? eobCbs.totalPatientResponsibility
      : null

  // Fully adjudicated claim (the EOB states a "You Owe" total): benchmark
  // overcharges and MUE findings on lines the EOB didn't match stay visible as
  // justification requests but contribute $0 — the enforceable obligation is
  // the EOB total, so the honest headline is the cross-document delta.
  const dedupedErrors = markJustificationOnly(dedupedRaw, eobPatientResponsibility)
  const needsReviewCount = dedupedErrors.filter((e) => e.error_type === 'rate_unavailable').length

  // Partial-read guard: extracted lines summing materially below the bill's own
  // printed total means pages (or rows) were missed — say so loudly instead of
  // auditing a subset with full confidence.
  const statedTotal = Number(billTotals?.statedTotalBilled)
  const suspectedPartialRead =
    Number.isFinite(statedTotal) && statedTotal > 0 && totalBilled < statedTotal * 0.9
  if (suspectedPartialRead) {
    console.warn(
      `runDeterministicAudit[${docIdBase}]: SUSPECTED PARTIAL READ — extracted lines sum to $${totalBilled.toFixed(2)} but the bill states total charges of $${statedTotal.toFixed(2)} (${Math.round((totalBilled / statedTotal) * 100)}%). Findings may be incomplete.`
    )
  }

  // ── One headline number the whole case agrees on ────────────────────────────
  // Audit findings exist ONLY on lines the EOB did not adjudicate (the rules
  // engine suppresses/demotes adjudicated lines), and cross-document dollars
  // sit on the adjudicated side (the patient-responsibility mismatch) —
  // disjoint by construction, so the honest headline is their SUM, HARD-CAPPED
  // at the amount the patient is actually being asked to pay: gross line
  // charges are list prices, and no honest savings claim can exceed the bill's
  // bottom line.
  const auditRecoverable = computeRecoverable(dedupedErrors, totalBilled)
  const crossDocAtRisk = Math.min(
    totalBilled,
    Math.max(0, Number(normalizedCbs.totalDollarAtRisk || 0))
  )
  const potentialSavings = capPotentialSavings(
    Math.min(totalBilled, auditRecoverable + crossDocAtRisk),
    billPatientResponsibility
  )
  // "Amount expected" = what the patient should actually pay. With a readable
  // EOB that is the payer's adjudicated obligation — never a CMS-benchmark
  // derivation. Bill-only audits keep the benchmark-derived estimate.
  const totalExpected =
    eobPatientResponsibility !== null
      ? eobPatientResponsibility
      : Math.max(0, totalBilled - potentialSavings)

  // Disputable findings = priced audit errors + cross-document findings that
  // carry real dollars or high/critical severity. Low-confidence "couldn't
  // match this line" notes are review aids, not errors, and never count.
  const significantCrossDoc = normalizedCbs.crossDocumentDiscrepancies.filter(
    (d) =>
      Number(d.estimatedDollarImpact || 0) > 0 ||
      d.severity === 'critical' ||
      d.severity === 'high'
  ).length
  const errorCount =
    dedupedErrors.filter((e) => !MANUAL_REVIEW_ERROR_TYPES.has(e.error_type)).length +
    significantCrossDoc

  return {
    errors: dedupedErrors,
    lineItems,
    normalizedCbs,
    provider,
    dateOfService: dateOfService ?? '',
    totalBilled,
    totalExpected,
    potentialSavings,
    errorCount,
    needsReviewCount,
    hasEob: !!eobCbs,
    eobError,
    lowConfidence,
    billPatientResponsibility,
    eobPatientResponsibility,
    suspectedPartialRead,
  }
}
