import type { SupabaseClient } from '@supabase/supabase-js'
import { runAudit, dedupeErrorsByLine, type BillingError, type InsuranceType, type LineItem } from '@/lib/errorDetection'
import { analyzeDisputedProcedures } from '@/lib/patientDisputes'
import { billExtractionToCBS, isExtractableExt } from '@/lib/cbs/extractor'
import { extractEOBToCBS } from '@/lib/cbs/eobExtractor'
import { isHeicBuffer } from '@/lib/heic'
import { normalizeCBSSet } from '@/lib/cbs/normalizer'
import type { CanonicalBillingSchema, NormalizedCBSSet } from '@/lib/cbs/schema'
import { logAnthropicError } from '../ai/phiBoundary'

// ─── The one audit pipeline ──────────────────────────────────────────────────
// Every audit — the guest preview (/api/audit-guest), the signed-in audit
// (/api/extract), and the carry-through-signup import (/api/claim-guest-audit)
// — funnels through runFullAudit so an identical bill produces an IDENTICAL
// result everywhere: same errors, same CBS, and the same headline math. Before
// this, the guest and extract routes each computed `potentialSavings` their own
// way (one honest/priced-only, one netting every line), so the same bill read
// as $924 to a guest and $851 once signed in. There is now exactly one formula.

// Findings the audit could not price are NOT overcharges — see the definition
// (moved to a dependency-free module so the client-bundled letterPdf can share
// it without pulling this file's server-only graph). Re-exported here so
// existing server-side imports are unchanged.
import { MANUAL_REVIEW_ERROR_TYPES } from './manualReview'
export { MANUAL_REVIEW_ERROR_TYPES }

export interface FullAuditInput {
  lineItems: LineItem[]
  insuranceType: InsuranceType
  /** Provider/date/confidence from vision extraction (absent on the re-audit path). */
  provider?: string | null
  dateOfService?: string | null
  /** Field names the vision extractor flagged as low-confidence (string[], not a flag). */
  lowConfidence?: string[]
  /** Namespaces the CBS document ids: `bill_${docIdBase}` / `eob_${docIdBase}`. */
  docIdBase: string
  /** Patient's free-text note. When present, an LLM flags line items the patient
   *  reports as not-rendered / disputed (error_type 'patient_disputed'). */
  userNotes?: string
  /** Stamped onto the bill CBS metadata (the case id when persisting, else ''). */
  accountNumber?: string
  /** Optional EOB to drive the cross-document (bill vs EOB) comparison. */
  eob?: { base64: string; ext: string } | null
  /** The bill's own stated summary figures from vision extraction:
   *  patientResponsibility = the bottom-line the patient is asked to pay (the
   *  honest ceiling on potential savings); statedTotalBilled powers the
   *  partial-read guard. */
  billTotals?: {
    statedTotalBilled?: number | null
    patientResponsibility?: number | null
  }
  supabase?: SupabaseClient
}

export interface FullAuditResult {
  errors: BillingError[]
  lineItems: LineItem[]
  normalizedCbs: NormalizedCBSSet
  provider: string | null
  dateOfService: string
  totalBilled: number
  /** What the bill SHOULD total = totalBilled − potentialSavings (so the three
   *  case-page stats reconcile: billed − expected = savings). */
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

// Savings math lives in the dependency-light ./savings module (tests and
// client code import it without this file's server-only graph); re-exported
// here so existing server imports are unchanged.
import { computeRecoverable, capPotentialSavings } from './savings'
export { computeRecoverable, capPotentialSavings }

export async function runFullAudit(input: FullAuditInput): Promise<FullAuditResult> {
  const {
    lineItems,
    insuranceType,
    provider = null,
    dateOfService = null,
    lowConfidence = [],
    docIdBase,
    accountNumber = '',
    eob = null,
    billTotals,
    userNotes,
    supabase,
  } = input

  // ── CBS cross-document layer FIRST ──────────────────────────────────────────
  // The EOB is extracted and matched against the bill BEFORE the rules engine
  // runs, so the audit knows which lines the payer already adjudicated: those
  // lines take the plan's allowed amount as their pricing reference (no CMS
  // benchmark findings) and NCCI/MUE flags on them demote to observations.
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

  // Gate on extension OR content: an iPhone HEIC EOB often arrives with no
  // extension or an image/heic mimetype, so the .heic ext check alone would skip
  // it and (wrongly) set eobError. Detect HEIC by magic bytes too; the shared
  // boundary in extractEOBToCBS then transcodes it to JPEG before the vision call.
  let eobCbs: CanonicalBillingSchema | null = null
  if (eob && eob.base64) {
    // Extension OR magic bytes: a HEIC EOB with no/odd extension is still
    // extractable (extractEOBToCBS transcodes it to JPEG at the shared boundary).
    const eobIsExtractable =
      isExtractableExt(eob.ext) || isHeicBuffer(Buffer.from(eob.base64, 'base64'))
    if (!eobIsExtractable) {
      // An EOB was supplied but we can't process its file type — log so a silent
      // bill-only result is traceable, then fall through to eobError below.
      console.warn(
        `runFullAudit[${docIdBase}]: EOB supplied but ext "${eob.ext}" is not extractable (and not HEIC by content) — skipping; audit will be bill-only.`
      )
    } else {
      try {
        eobCbs = await extractEOBToCBS(eob.base64, eob.ext, `eob_${docIdBase}`)
        // Pin bill + EOB to a shared episode so the normalizer compares them even
        // without a matching claim number / service date.
        const sharedEpisode =
          billCbs.serviceEpisodeId || eobCbs.serviceEpisodeId || billCbs.claimNumber || `episode_${docIdBase}`
        billCbs.serviceEpisodeId = sharedEpisode
        eobCbs.serviceEpisodeId = sharedEpisode
        if (!eobCbs.dateOfService) eobCbs.dateOfService = billCbs.dateOfService
        console.info(`runFullAudit[${docIdBase}]: EOB extracted — cross-document comparison enabled.`)
      } catch (eobErr) {
        // EOB unreadable — degrade gracefully to a bill-only audit.
        // PHI-safe: an APIError can echo request content (the EOB itself) into logs.
        console.error(`runFullAudit[${docIdBase}]: EOB extraction error: ${eobErr instanceof Error ? `${eobErr.name}: ${eobErr.message}` : 'unknown'}`)
        eobCbs = null
      }
    }
  }

  const normalizedCbs = normalizeCBSSet(eobCbs ? [billCbs, eobCbs] : [billCbs])

  // An EOB was provided but we couldn't read it (unsupported type or extraction
  // failure) — the audit still completed bill-only; flag it so callers can say so.
  const eobError = !!(eob && eob.base64) && !eobCbs

  // Which bill lines did the payer adjudicate? The normalizer's bill↔EOB
  // matching stamps `eobBenchmarked` on billCbs's line objects (shared by
  // reference with the normalized clone), in the same order as `lineItems`.
  const auditItems: LineItem[] = lineItems.map((li, i) => ({
    ...li,
    eobAdjudicated: !!billCbs.lineItems[i]?.eobBenchmarked,
  }))

  // Rules engine (NCCI PTP/MUE, PFS/CLFS pricing, coverage), now adjudication-
  // aware. Same call, same graceful degradation when the reference tables are
  // empty, for all callers.
  const errors = await runAudit(auditItems, insuranceType, supabase ? { supabase } : {})

  // Patient-reported disputes (Component: patient_disputed). When the patient
  // wrote a note, an LLM flags line items they say weren't rendered / are wrong.
  // Best-effort: a failure here (e.g. Anthropic rate limit) must not sink the
  // whole audit, so we log and continue with the rules findings only.
  if (userNotes && userNotes.trim()) {
    try {
      // Pass the identifiers this pipeline knows so their literal values are
      // scrubbed from the note (accountNumber is the case/account reference —
      // the only identifier stored server-side under the de-id default).
      const disputeErrors = await analyzeDisputedProcedures(lineItems, userNotes, {
        accountNumber,
      })
      if (disputeErrors.length > 0) errors.push(...disputeErrors)
    } catch (err) {
      logAnthropicError('dispute-analysis', err) // PHI-safe: never log the raw error object
    }
  }

  // One CPT line, one finding: a line flagged as overcharge + unbundling +
  // patient-disputed is one charge counted three times. Strongest evidence wins.
  const dedupedErrors = dedupeErrorsByLine(errors)

  const totalBilled = lineItems.reduce((s, li) => s + Number(li.billed_amount || 0), 0)
  const needsReviewCount = dedupedErrors.filter((e) => e.error_type === 'rate_unavailable').length

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

  // Partial-read guard: extracted lines summing materially below the bill's own
  // printed total means pages (or rows) were missed — say so loudly instead of
  // auditing a subset with full confidence.
  const statedTotal = Number(billTotals?.statedTotalBilled)
  const suspectedPartialRead =
    Number.isFinite(statedTotal) && statedTotal > 0 && totalBilled < statedTotal * 0.9
  if (suspectedPartialRead) {
    console.warn(
      `runFullAudit[${docIdBase}]: SUSPECTED PARTIAL READ — extracted lines sum to $${totalBilled.toFixed(2)} but the bill states total charges of $${statedTotal.toFixed(2)} (${Math.round((totalBilled / statedTotal) * 100)}%). Findings may be incomplete.`
    )
  }

  // ── One headline number the whole case agrees on ────────────────────────────
  // Audit findings now exist ONLY on lines the EOB did not adjudicate (the
  // rules engine suppresses/demotes adjudicated lines), and cross-document
  // dollars sit on the adjudicated side (the patient-responsibility mismatch)
  // — disjoint by construction, so the honest headline is their SUM. (The old
  // max-not-sum guarded against double-counting when both views priced the
  // same line; that overlap is structurally gone.) Then HARD-CAPPED at the
  // amount the patient is actually being asked to pay: gross line charges are
  // list prices, and no honest savings claim can exceed the bill's bottom line.
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
