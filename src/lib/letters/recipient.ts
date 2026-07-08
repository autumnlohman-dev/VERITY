// ─── Letter recipient selection ───────────────────────────────────────────────
// The recipient must match the letter's content: a provider-billing dispute
// (the bill asks for more than the adjudicated patient responsibility, coding
// errors on the provider's bill) goes to the provider's billing office; an
// adverse-benefit dispute (denied services, coverage failures) is an insurer
// appeal. A letter addressed to the hospital with "submit via your insurer's
// portal" instructions dies on arrival — pick ONE side per case, by where the
// dollars point. Pure and client-safe: the letter page uses it for submission
// instructions and the generate-letter route for the address block.

export type LetterRecipient = 'provider' | 'insurer'

export interface RecipientSignal {
  /** CBSDiscrepancy `type` or BillingError `error_type`. */
  type: string
  /** Dollars this finding puts in dispute (0 when informational). */
  dollarImpact: number
}

// Disputes OF the provider's bill — the provider must correct its statement.
const PROVIDER_DISPUTE_TYPES = new Set([
  'patient_responsibility_mismatch',
  'balance_billing_violation',
  'amount_mismatch',
  'code_mismatch',
  'duplicate_charge',
  'overcharge',
  'unbundling',
  'duplicate',
  'mue',
  'patient_disputed',
])

// Disputes OF the payer's adjudication — appeal to the insurer.
const INSURER_APPEAL_TYPES = new Set([
  'denied_service_billed',
  'denial_without_authorization',
  'unauthorized_service',
  'coverage',
])

export function letterRecipient(opts: {
  selfPay: boolean
  findings: RecipientSignal[]
}): LetterRecipient {
  // Self-pay patients have no insurer to appeal to.
  if (opts.selfPay) return 'provider'

  let providerDollars = 0
  let providerCount = 0
  let insurerDollars = 0
  let insurerCount = 0
  for (const f of opts.findings) {
    const impact = Math.max(0, Number(f.dollarImpact) || 0)
    if (PROVIDER_DISPUTE_TYPES.has(f.type)) {
      providerDollars += impact
      providerCount += 1
    } else if (INSURER_APPEAL_TYPES.has(f.type)) {
      insurerDollars += impact
      insurerCount += 1
    }
  }

  // Dollars decide; finding count breaks a dollar tie; the provider-billing
  // dispute is the default (most findings dispute the bill, not the plan).
  if (insurerDollars > providerDollars) return 'insurer'
  if (insurerDollars === providerDollars && insurerCount > providerCount) return 'insurer'
  return 'provider'
}
