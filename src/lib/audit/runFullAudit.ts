import type { SupabaseClient } from '@supabase/supabase-js'
import { runAudit, type BillingError, type InsuranceType, type LineItem } from '@/lib/errorDetection'
import { analyzeDisputedProcedures } from '@/lib/patientDisputes'
import { billExtractionToCBS, isExtractableExt } from '@/lib/cbs/extractor'
import { extractEOBToCBS } from '@/lib/cbs/eobExtractor'
import { isHeicBuffer } from '@/lib/heic'
import { normalizeCBSSet } from '@/lib/cbs/normalizer'
import type { CanonicalBillingSchema, NormalizedCBSSet } from '@/lib/cbs/schema'

// ─── The one audit pipeline ──────────────────────────────────────────────────
// Every audit — the guest preview (/api/audit-guest), the signed-in audit
// (/api/extract), and the carry-through-signup import (/api/claim-guest-audit)
// — funnels through runFullAudit so an identical bill produces an IDENTICAL
// result everywhere: same errors, same CBS, and the same headline math. Before
// this, the guest and extract routes each computed `potentialSavings` their own
// way (one honest/priced-only, one netting every line), so the same bill read
// as $924 to a guest and $851 once signed in. There is now exactly one formula.

// Findings the audit could not price (proprietary facility/revenue codes, OCR
// misreads, or the systemic reference-data notice) are NOT overcharges — they
// surface for manual review and are never summed into recoverable dollars.
export const MANUAL_REVIEW_ERROR_TYPES = new Set<string>([
  'rate_unavailable',
  'reference_data_missing',
])

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
}

// The single canonical recoverable-dollars formula. Counts ONLY priced findings,
// clamps each line at 0 (an underbill never offsets an overbill), and never
// claims more than the bill itself.
export function computeRecoverable(errors: BillingError[], totalBilled: number): number {
  const recoverable = errors
    .filter((e) => !MANUAL_REVIEW_ERROR_TYPES.has(e.error_type))
    .reduce(
      (sum, e) => sum + Math.max(0, Number(e.billed_amount || 0) - Number(e.expected_amount || 0)),
      0
    )
  return Math.min(totalBilled, Math.max(0, recoverable))
}

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
    userNotes,
    supabase,
  } = input

  // Rules engine (NCCI PTP/MUE, PFS/CLFS pricing, coverage). Same call, same
  // graceful degradation when the reference tables are empty, for all callers.
  const errors = await runAudit(lineItems, insuranceType, supabase ? { supabase } : {})

  // Patient-reported disputes (Component: patient_disputed). When the patient
  // wrote a note, an LLM flags line items they say weren't rendered / are wrong.
  // Best-effort: a failure here (e.g. Anthropic rate limit) must not sink the
  // whole audit, so we log and continue with the rules findings only.
  if (userNotes && userNotes.trim()) {
    try {
      const disputeErrors = await analyzeDisputedProcedures(lineItems, userNotes)
      if (disputeErrors.length > 0) errors.push(...disputeErrors)
    } catch (err) {
      console.error('patient-dispute analysis failed (non-fatal):', err)
    }
  }

  const totalBilled = lineItems.reduce((s, li) => s + Number(li.billed_amount || 0), 0)
  const needsReviewCount = errors.filter((e) => e.error_type === 'rate_unavailable').length

  // ── CBS cross-document layer ────────────────────────────────────────────────
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
        console.error(`runFullAudit[${docIdBase}]: EOB extraction error:`, eobErr)
        eobCbs = null
      }
    }
  }

  const normalizedCbs = normalizeCBSSet(eobCbs ? [billCbs, eobCbs] : [billCbs])

  // An EOB was provided but we couldn't read it (unsupported type or extraction
  // failure) — the audit still completed bill-only; flag it so callers can say so.
  const eobError = !!(eob && eob.base64) && !eobCbs

  // ── One headline number the whole case agrees on ────────────────────────────
  // Recoverable dollars = the larger of (a) priced audit findings and (b) the
  // EOB-evidenced cross-document dollars at risk. Max, NOT sum: a balance-billed
  // dollar is frequently the same dollar an overcharge check counts, and the
  // evidentiary standard forbids claiming it twice. Before this, a case could
  // show "$0.00 potential savings" beside a $237.99 balance-billing finding.
  const auditRecoverable = computeRecoverable(errors, totalBilled)
  const crossDocAtRisk = Math.min(
    totalBilled,
    Math.max(0, Number(normalizedCbs.totalDollarAtRisk || 0))
  )
  const potentialSavings = Math.max(auditRecoverable, crossDocAtRisk)
  const totalExpected = Math.max(0, totalBilled - potentialSavings)

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
    errors.filter((e) => !MANUAL_REVIEW_ERROR_TYPES.has(e.error_type)).length +
    significantCrossDoc

  return {
    errors,
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
  }
}
