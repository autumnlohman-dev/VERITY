/**
 * VERITY Storm Index — claim 45 / §X of the v12 provisional patent.
 *
 * "A transparent weighted formula that scores the household's financial
 * risk exposure on a 0-100 scale without relying on a trained ML model."
 * (claim 45, §X)
 *
 * v1 is intentionally a formula, NOT ML.  Weights are documented inline
 * so the calculation is reproducible and auditable.  A future v2 may
 * learn weights from outcomes data; that will require a separate claim.
 */

import type {
  Household,
  ProjectedClaim,
  StormIndexOptions,
  StormIndexResult,
  StormFeatures,
} from './types';

/**
 * Default payer-profile denial likelihood.
 * Production: replace with a payer-specific lookup table.
 */
const DEFAULT_DENIAL_LIKELIHOOD = 0.1;

/**
 * Dollar threshold above which a single claim is considered "large" for
 * the projected_large_bills feature.  Normalized against this value.
 */
const LARGE_BILL_THRESHOLD = 5_000;

/**
 * Weights for the Storm Index formula (claim 45 §X).
 * Must sum to 1.00.
 *
 *  accumulator_burn_rate  0.45  — how much of the family OOP cap has been
 *                                 consumed signals imminent exhaustion risk
 *  projected_large_bills  0.25  — pending large bills that haven't settled
 *                                 amplify exposure regardless of accumulators
 *  denial_likelihood      0.15  — payer-profile signal; denied claims create
 *                                 unexpected member liability
 *  deadline_cluster       0.15  — overlapping filing/appeal deadlines compress
 *                                 the household's response window
 */
const WEIGHTS = {
  accumulator_burn_rate: 0.45,
  projected_large_bills: 0.25,
  denial_likelihood: 0.15,
  deadline_cluster: 0.15,
} as const;

/**
 * Computes the Storm Index score for the household.
 *
 * @param household  - Current accumulator snapshot (provides burn rate)
 * @param openClaims - Claims still in ADJUDICATED/BILLED state (not settled)
 * @param opts       - Optional overrides for denial_likelihood and deadline_cluster
 */
export function computeStormIndex(
  household: Household,
  openClaims: ProjectedClaim[],
  opts: StormIndexOptions = {},
): StormIndexResult {
  const { plan, family_oop_met } = household;

  // Feature 1: accumulator burn rate ∈ [0, 1]
  // How much of the family OOP cap has been consumed YTD.
  const accumulator_burn_rate =
    plan.family_oop_max > 0
      ? Math.min(1, family_oop_met / plan.family_oop_max)
      : 0;

  // Feature 2: projected large bills ∈ [0, 1]
  // Sum of estimated_allowed across open claims, normalized.
  const totalOpenBills = openClaims.reduce((sum, c) => {
    return sum + (c.estimated_allowed ?? c.estimated_billed ?? 0);
  }, 0);
  const projected_large_bills = Math.min(
    1,
    totalOpenBills / Math.max(LARGE_BILL_THRESHOLD, 1),
  );

  // Feature 3: denial likelihood ∈ [0, 1]
  // Caller-supplied or payer-profile stub default.
  const denial_likelihood =
    opts.denial_likelihood ?? DEFAULT_DENIAL_LIKELIHOOD;

  // Feature 4: deadline cluster ∈ [0, 1]
  // Passed in by caller (derived from appeal/filing deadlines).
  const deadline_cluster = opts.deadline_cluster ?? 0;

  const features: StormFeatures = {
    accumulator_burn_rate,
    projected_large_bills,
    denial_likelihood,
    deadline_cluster,
  };

  // Weighted sum → scale to 0-100 and round to integer.
  const rawScore =
    WEIGHTS.accumulator_burn_rate * accumulator_burn_rate +
    WEIGHTS.projected_large_bills * projected_large_bills +
    WEIGHTS.denial_likelihood * denial_likelihood +
    WEIGHTS.deadline_cluster * deadline_cluster;

  const score = Math.round(Math.min(100, Math.max(0, rawScore * 100)));

  return { score, features };
}
