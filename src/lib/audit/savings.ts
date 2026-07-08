import type { BillingError } from '@/lib/errorDetection'
import { MANUAL_REVIEW_ERROR_TYPES } from './manualReview'

// ─── Savings math (pure, dependency-light) ────────────────────────────────────
// Lives apart from runFullAudit so tests and client code can import the math
// without pulling in that module's server-only graph (HEIC WASM transcoder,
// Anthropic SDK). runFullAudit re-exports both, so server imports are unchanged.

// The single canonical recoverable-dollars formula. Counts ONLY priced findings
// (never justification-only ones), clamps each line at 0 (an underbill never
// offsets an overbill), and never claims more than the bill itself.
export function computeRecoverable(errors: BillingError[], totalBilled: number): number {
  const recoverable = errors
    .filter((e) => !MANUAL_REVIEW_ERROR_TYPES.has(e.error_type) && !e.justification_only)
    .reduce(
      (sum, e) => sum + Math.max(0, Number(e.billed_amount || 0) - Number(e.expected_amount || 0)),
      0
    )
  return Math.min(totalBilled, Math.max(0, recoverable))
}

// Once the payer has adjudicated the claim in full (the EOB states a "You Owe"
// total), CMS-benchmark comparisons and MUE unit caps on lines the EOB didn't
// match cannot add dollars to the patient's recoverable amount: the enforceable
// obligation is the EOB total, and the honest headline is the cross-document
// delta. Those findings stay visible as justification requests — any resulting
// reduction would lower the balance further — but they contribute $0.
export const JUSTIFICATION_ONLY_WHEN_ADJUDICATED = new Set(['overcharge', 'mue'])

export function markJustificationOnly(
  errors: BillingError[],
  eobPatientResponsibility: number | null | undefined
): BillingError[] {
  const adjudicated =
    typeof eobPatientResponsibility === 'number' &&
    Number.isFinite(eobPatientResponsibility) &&
    eobPatientResponsibility >= 0
  if (!adjudicated) return errors
  return errors.map((e) =>
    JUSTIFICATION_ONLY_WHEN_ADJUDICATED.has(e.error_type) ? { ...e, justification_only: true } : e
  )
}

// HARD INVARIANT: "potential savings" can never exceed the amount the patient
// is actually being asked to pay. A $12k "savings" claim on a bill whose
// bottom line is $3,641.01 dies on first read — and is dishonest. When the
// bill doesn't state a patient-responsibility total, the raw figure stands
// (already clamped to totalBilled upstream).
export function capPotentialSavings(
  raw: number,
  billPatientResponsibility: number | null | undefined
): number {
  const capped = Math.max(0, raw)
  if (
    typeof billPatientResponsibility === 'number' &&
    Number.isFinite(billPatientResponsibility) &&
    billPatientResponsibility >= 0
  ) {
    return Math.min(capped, billPatientResponsibility)
  }
  return capped
}
