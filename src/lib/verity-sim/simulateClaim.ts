/**
 * VERITY accumulator-aware claim simulation.
 *
 * Implements claim 43 of the v12 provisional patent in full:
 *   (i)  embedded vs aggregate deductible branching
 *   (ii) cross-member OOP-remaining ripple
 *   (iii) family-OOP-max exhaustion-date projection
 *
 * This module is PURE and DETERMINISTIC — no network calls, no LLM,
 * no randomness.  The only external input that varies is the household
 * accumulator state and the projected claim.
 */

import type {
  Household,
  ProjectedClaim,
  SimulationResult,
  ClaimBreakdown,
  MemberRipple,
  CapReason,
} from './types';
import { estimateAllowed } from './estimateAllowed';
import { monthsElapsed, addMonths } from './dateUtils';

/**
 * Projects member cost for a single claim against the household's shared
 * accumulators and returns the full SimulationResult.
 *
 * ORDER OF OPERATIONS (this ordering is the correctness contract):
 *   a. Resolve allowed amount
 *   b. Member deductible portion (embedded vs aggregate)
 *   c. Coinsurance on the post-deductible remainder
 *   d. Raw member cost = dedPortion + coinsPortion
 *   e. Cap at OOP maxes (family and individual)
 *   f. Advance shared family accumulators
 *   g. Cross-member ripple (claim 43(ii))
 *   h. Family-OOP exhaustion date (claim 43(iii))
 *
 * @param household - Snapshot of shared accumulator state
 * @param claim     - Projected claim per claim 49 (no adjudicated data)
 */
export function simulateClaim(
  household: Household,
  claim: ProjectedClaim,
): SimulationResult {
  const { plan, members, family_deductible_met, family_oop_met } = household;

  const member = members.find((m) => m.id === claim.member_id);
  if (!member) {
    throw new Error(
      `simulateClaim: member_id "${claim.member_id}" not found in household`,
    );
  }

  // ─── (a) Resolve allowed amount ──────────────────────────────────────────
  // Per claim 49: caller may supply estimated_allowed (good-faith-estimate
  // path).  Absent that, fall through to the baseline stub — which never
  // accesses adjudicated payer data.
  const allowed: number =
    claim.estimated_allowed !== undefined
      ? claim.estimated_allowed
      : estimateAllowed(claim.cpt_codes, claim.provider_npi);

  // ─── (b) Deductible portion ───────────────────────────────────────────────
  // EMBEDDED vs AGGREGATE is the #1 source of wrong numbers in family-plan
  // simulation.  Both branches are exercised by the golden-file tests.
  const familyDedRemaining = Math.max(
    0,
    plan.family_deductible - family_deductible_met,
  );
  const indivDedRemaining = Math.max(
    0,
    plan.individual_deductible - member.individual_deductible_met,
  );

  let dedRemainingApplicable: number;
  if (plan.deductible_embedded) {
    // Embedded: the member is capped at their own individual deductible even
    // if the family deductible has not yet been met (claim 43(i)).
    dedRemainingApplicable = Math.min(indivDedRemaining, familyDedRemaining);
  } else {
    // Aggregate: the family deductible governs; no per-member sub-cap.
    dedRemainingApplicable = familyDedRemaining;
  }

  const dedPortion = Math.min(allowed, dedRemainingApplicable);

  // ─── (c) Coinsurance ─────────────────────────────────────────────────────
  const coinsPortion = (allowed - dedPortion) * plan.coinsurance_rate;

  // ─── (d) Raw member cost ──────────────────────────────────────────────────
  const memberCost = dedPortion + coinsPortion;

  // ─── (e) Cap at OOP maxes ─────────────────────────────────────────────────
  const familyOopRemaining = Math.max(
    0,
    plan.family_oop_max - family_oop_met,
  );
  const indivOopRemaining = Math.max(
    0,
    plan.individual_oop_max - member.individual_oop_met,
  );

  const cappedCost = Math.min(memberCost, familyOopRemaining, indivOopRemaining);

  let capReason: CapReason = 'none';
  if (cappedCost < memberCost) {
    // Identify which cap bound us first (family takes precedence when equal).
    capReason =
      familyOopRemaining <= indivOopRemaining ? 'family_oop' : 'individual_oop';
  }

  // ─── (f) Advance shared family accumulators ───────────────────────────────
  const newFamilyDedMet = Math.min(
    plan.family_deductible,
    family_deductible_met + dedPortion,
  );
  const newFamilyOopMet = Math.min(
    plan.family_oop_max,
    family_oop_met + cappedCost,
  );
  const newFamilyOopRemaining = plan.family_oop_max - newFamilyOopMet;

  const breakdown: ClaimBreakdown = {
    allowed,
    dedPortion,
    coinsPortion,
    cappedCost,
    capReason,
    newFamilyDedMet,
    newFamilyOopMet,
    newFamilyOopRemaining,
  };

  // ─── (g) Cross-member ripple (claim 43(ii)) ───────────────────────────────
  // For EVERY member in the household (including the claimant), the effective
  // remaining exposure is min(individual OOP remaining, family OOP remaining).
  // Return before/after so the UI can display the drop.
  const per_member_remaining: MemberRipple[] = members.map((m) => {
    const mIndivOopRemaining = Math.max(
      0,
      plan.individual_oop_max - m.individual_oop_met,
    );
    return {
      member_id: m.id,
      before: Math.min(mIndivOopRemaining, familyOopRemaining),
      after: Math.min(mIndivOopRemaining, newFamilyOopRemaining),
    };
  });

  // ─── (h) Family-OOP exhaustion date (claim 43(iii)) ──────────────────────
  // Burn-rate assumption: constant monthly spend = ytd_family_spend / months
  // elapsed since plan year start.  This is a conservative linear projection;
  // actual spend is seasonal and volatile.  The caller should surface this
  // assumption in the UI per claim 43(iii).
  let family_oop_exhaustion_date: string | null = null;
  const elapsed = monthsElapsed(household.plan_year_start, household.as_of_date);
  if (elapsed > 0) {
    const monthlyBurn = household.ytd_family_spend / elapsed;
    if (monthlyBurn > 0 && newFamilyOopRemaining > 0) {
      const monthsToExhaustion = newFamilyOopRemaining / monthlyBurn;
      family_oop_exhaustion_date = addMonths(
        household.as_of_date,
        monthsToExhaustion,
      );
    } else if (monthlyBurn > 0 && newFamilyOopRemaining <= 0) {
      // Already exhausted.
      family_oop_exhaustion_date = household.as_of_date;
    }
    // monthlyBurn === 0 → null (no data to project from)
  }

  return {
    projected_member_cost: cappedCost,
    breakdown,
    per_member_remaining,
    family_oop_exhaustion_date,
  };
}
