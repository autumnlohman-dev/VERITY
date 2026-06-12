import type { SupabaseClient } from '@supabase/supabase-js'
import { runAudit, type BillingError, type InsuranceType, type LineItem } from '@/lib/errorDetection'
import { billExtractionToCBS, extractEOBToCBS, isExtractableExt } from '@/lib/cbs/extractor'
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
  /** Count of priced findings only (manual-review items excluded). */
  errorCount: number
  needsReviewCount: number
  hasEob: boolean
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
    supabase,
  } = input

  // Rules engine (NCCI PTP/MUE, PFS/CLFS pricing, coverage). Same call, same
  // graceful degradation when the reference tables are empty, for all callers.
  const errors = await runAudit(lineItems, insuranceType, supabase ? { supabase } : {})

  const totalBilled = lineItems.reduce((s, li) => s + Number(li.billed_amount || 0), 0)
  const potentialSavings = computeRecoverable(errors, totalBilled)
  const totalExpected = Math.max(0, totalBilled - potentialSavings)
  const errorCount = errors.filter((e) => !MANUAL_REVIEW_ERROR_TYPES.has(e.error_type)).length
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

  let eobCbs: CanonicalBillingSchema | null = null
  if (eob && eob.base64 && isExtractableExt(eob.ext)) {
    try {
      eobCbs = await extractEOBToCBS(eob.base64, eob.ext, `eob_${docIdBase}`)
      // Pin bill + EOB to a shared episode so the normalizer compares them even
      // without a matching claim number / service date.
      const sharedEpisode =
        billCbs.serviceEpisodeId || eobCbs.serviceEpisodeId || billCbs.claimNumber || `episode_${docIdBase}`
      billCbs.serviceEpisodeId = sharedEpisode
      eobCbs.serviceEpisodeId = sharedEpisode
      if (!eobCbs.dateOfService) eobCbs.dateOfService = billCbs.dateOfService
    } catch (eobErr) {
      // EOB unreadable — degrade gracefully to a bill-only audit.
      console.error('EOB extraction error:', eobErr)
      eobCbs = null
    }
  }

  const normalizedCbs = normalizeCBSSet(eobCbs ? [billCbs, eobCbs] : [billCbs])

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
    lowConfidence,
  }
}
