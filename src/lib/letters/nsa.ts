// No Surprises Act framing gate: NSA language appears in a letter ONLY when a
// finding actually carries an NSA basis (balance billing / emergency
// protections). A routine adjudication dispute is not an NSA matter, and
// citing it anyway is the kind of overreach a claims reviewer discounts.
// Pure so the gate is unit-testable apart from the generation route.
//
// Framing pending sister/counsel review: which findings legitimately invoke
// the NSA (vs merely reference it) is a legal characterization.

interface NsaErrorLike {
  rule_violated: string
}
interface NsaFindingLike {
  applicable_regulations: string[]
}

export function hasNsaBasis(errors: NsaErrorLike[], findings: NsaFindingLike[]): boolean {
  return (
    findings.some((d) => d.applicable_regulations.some((r) => /no surprises/i.test(r))) ||
    errors.some((e) => /no surprises/i.test(e.rule_violated))
  )
}

// The prompt's citation instruction, one of three mutually exclusive framings.
// Self-pay letters cite the NSA's good-faith-estimate protections by design.
export function nsaFramingInstruction(isSelfPay: boolean, nsaBasis: boolean): string {
  if (isSelfPay) return 'the No Surprises Act good-faith-estimate protections and the Hospital Price Transparency Rule'
  if (nsaBasis) return 'the No Surprises Act and applicable patient rights'
  return "the patient's plan-adjudication and appeal rights (do NOT cite the No Surprises Act, no finding in this case supports it)"
}
