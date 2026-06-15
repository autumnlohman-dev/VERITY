/**
 * Baseline allowed-amount stub for the no-estimate path.
 *
 * Claim 49: "the simulation engine MUST return a projected cost result
 * without access to adjudicated allowed-amount data."  This stub fulfils
 * that requirement by using a static fee-schedule baseline — never
 * real-time payer adjudication data.
 *
 * The stub returns a conservative median national rate per CPT code.
 * Production callers should replace this with a licensed fee-schedule
 * lookup (e.g. CMS Medicare Physician Fee Schedule) while keeping the
 * same interface so claim 49 compliance is preserved.
 */

/** Rough median national allowed amounts by CPT code (2025 baseline). */
const BASELINE_FEE_SCHEDULE: Record<string, number> = {
  '99213': 115,
  '99214': 167,
  '99215': 232,
  '99203': 148,
  '99204': 216,
  '99205': 296,
  '99232': 113,
  '99233': 164,
  '99291': 545,
  '93000': 54,
  '93306': 850,
  '71046': 185,
  '80053': 41,
  '85025': 28,
  '36415': 13,
  '99395': 198,
  '99396': 214,
  '90834': 115,
  '90837': 162,
  '27447': 1820,
  '29827': 1140,
  '43239': 890,
  '47562': 1540,
};

/** Fallback per-code estimate when the CPT is not in the schedule above. */
const DEFAULT_PER_CPT = 250;

/**
 * Returns a deterministic baseline allowed amount for a set of CPT codes.
 *
 * Per claim 49 this is intentionally a stub — it does NOT call any payer
 * adjudication system.  The result should be treated as an estimate only.
 *
 * @param cptCodes - Array of CPT code strings (e.g. ['99214', '93000'])
 * @param _providerNpi - Reserved for future fee-schedule locality lookup; ignored now.
 */
export function estimateAllowed(
  cptCodes: string[],
  _providerNpi?: string,
): number {
  if (cptCodes.length === 0) return DEFAULT_PER_CPT;

  return cptCodes.reduce((sum, code) => {
    return sum + (BASELINE_FEE_SCHEDULE[code] ?? DEFAULT_PER_CPT);
  }, 0);
}
