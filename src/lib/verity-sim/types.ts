/**
 * VERITY Family Profile accumulator-aware simulation types.
 * Referenced in provisional patent v12, claims 43, 45, 49 and §Y / §X.
 *
 * These types mirror the Supabase household/plan schema so the simulation
 * layer can operate directly on database-hydrated objects without a
 * transformation step.
 */

/** Insurance plan parameters for a single plan year. */
export interface Plan {
  individual_deductible: number;
  family_deductible: number;
  individual_oop_max: number;
  family_oop_max: number;
  /** Coinsurance rate borne by the MEMBER (e.g. 0.20 = member pays 20%). */
  coinsurance_rate: number;
  /**
   * true  → embedded deductible: each member is capped at individual_deductible
   *         before the family deductible is credited. (claim 43(i))
   * false → aggregate deductible: the family bucket governs; no per-member cap
   *         until the family deductible is exhausted.
   */
  deductible_embedded: boolean;
}

/** One covered individual within the household. */
export interface Member {
  id: string;
  display_name: string;
  /** Dollars the member has already applied toward their individual deductible YTD. */
  individual_deductible_met: number;
  /** Dollars the member has already applied toward their individual OOP max YTD. */
  individual_oop_met: number;
}

/**
 * Shared accumulator state for the household as of a snapshot date.
 * Reflects claim 43 §Y: "maintaining a shared family accumulator object
 * updated by each adjudicated claim."
 */
export interface Household {
  members: Member[];
  family_deductible_met: number;
  family_oop_met: number;
  plan: Plan;
  /** ISO-8601 date string: first day of the benefit year (e.g. "2026-01-01"). */
  plan_year_start: string;
  /** ISO-8601 date string: the "as-of" snapshot date for burn-rate calculations. */
  as_of_date: string;
  /** Total household allowed spend YTD, used to derive monthly burn rate. */
  ytd_family_spend: number;
}

/**
 * A claim to be projected against the household's accumulators.
 * Per claim 49, the simulation MUST NOT use adjudicated allowed-amount data;
 * it relies on the member-supplied estimated_allowed or the baseline stub.
 */
export interface ProjectedClaim {
  member_id: string;
  cpt_codes: string[];
  /** Good-faith-estimate path: caller supplies the allowed amount directly. */
  estimated_allowed?: number;
  estimated_billed?: number;
  provider_npi?: string;
}

/** What drove the OOP cap on this claim. */
export type CapReason = 'none' | 'family_oop' | 'individual_oop';

/** Full cost breakdown for a single simulated claim. */
export interface ClaimBreakdown {
  allowed: number;
  dedPortion: number;
  coinsPortion: number;
  cappedCost: number;
  capReason: CapReason;
  newFamilyDedMet: number;
  newFamilyOopMet: number;
  newFamilyOopRemaining: number;
}

/** Per-member before/after OOP-remaining snapshot (claim 43(ii) ripple). */
export interface MemberRipple {
  member_id: string;
  /** Effective OOP remaining before this claim settled. */
  before: number;
  /** Effective OOP remaining after this claim settled. */
  after: number;
}

/**
 * Full result returned by simulateClaim().
 * claim 43: "projecting member cost and updating shared accumulators for
 * every covered member in the household."
 */
export interface SimulationResult {
  projected_member_cost: number;
  breakdown: ClaimBreakdown;
  /** Cross-member ripple per claim 43(ii). */
  per_member_remaining: MemberRipple[];
  /**
   * ISO-8601 date on which the family OOP max is projected to exhaust, or
   * null if burn rate is zero. (claim 43(iii))
   */
  family_oop_exhaustion_date: string | null;
}

/** Feature vector emitted alongside the Storm Index score. */
export interface StormFeatures {
  /** newFamilyOopMet / family_oop_max ∈ [0, 1]. */
  accumulator_burn_rate: number;
  /** Normalized magnitude of open large bills still in adjudication/billed state. */
  projected_large_bills: number;
  /** Estimated denial likelihood from payer-profile stub ∈ [0, 1]. */
  denial_likelihood: number;
  /** Deadline cluster coefficient passed in by caller ∈ [0, 1]. */
  deadline_cluster: number;
}

/** Options for computeStormIndex(). */
export interface StormIndexOptions {
  denial_likelihood?: number;
  deadline_cluster?: number;
}

/** Result of computeStormIndex(). */
export interface StormIndexResult {
  /** 0-100 integer score. Higher = higher financial risk. */
  score: number;
  features: StormFeatures;
}
