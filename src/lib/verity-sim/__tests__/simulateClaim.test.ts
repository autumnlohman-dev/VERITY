/**
 * Golden-file tests for simulateClaim().
 *
 * All expected values are hand-computed and committed as golden fixtures so
 * any future change to the accumulator logic is immediately surfaced.
 *
 * Claim 43 compliance is the acceptance criterion: all 10 scenarios must pass.
 */
import { describe, it, expect } from 'vitest';
import { simulateClaim } from '../simulateClaim';
import type { Household, Plan, Member, ProjectedClaim } from '../types';

// ─── Shared plan helpers ──────────────────────────────────────────────────────

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    individual_deductible: 1500,
    family_deductible: 3000,
    individual_oop_max: 4500,
    family_oop_max: 9000,
    coinsurance_rate: 0.20,
    deductible_embedded: true,
    ...overrides,
  };
}

function makeMember(
  id: string,
  name: string,
  indivDedMet: number,
  indivOopMet?: number,
): Member {
  return {
    id,
    display_name: name,
    individual_deductible_met: indivDedMet,
    // Per fixture instructions: individual_oop_met == individual_deductible_met
    // unless a scenario overrides.
    individual_oop_met: indivOopMet ?? indivDedMet,
  };
}

function makeHousehold(
  plan: Plan,
  members: Member[],
  familyDedMet: number,
  familyOopMet: number,
  ytdFamilySpend = 0,
  planYearStart = '2026-01-01',
  asOfDate = '2026-06-14',
): Household {
  return {
    plan,
    members,
    family_deductible_met: familyDedMet,
    family_oop_met: familyOopMet,
    ytd_family_spend: ytdFamilySpend,
    plan_year_start: planYearStart,
    as_of_date: asOfDate,
  };
}

// ─── Scenario 1: FIG. 10 canonical (aggregate) ───────────────────────────────
describe('Scenario 1 – FIG. 10 canonical (aggregate deductible)', () => {
  /**
   * Family deductible 2600/3000 met, family OOP 7400/9000 met.
   * Member C estimated_allowed = 6200, coinsurance 0.20.
   *
   * Workings:
   *   familyDedRemaining = 3000 - 2600 = 400
   *   dedPortion         = min(6200, 400) = 400      (aggregate: no per-member cap)
   *   coinsPortion       = (6200 - 400) * 0.20 = 1160
   *   memberCost         = 400 + 1160 = 1560
   *   familyOopRemaining = 9000 - 7400 = 1600
   *   indivOopRemaining  = 4500 - 2600 = 1900
   *   cappedCost         = min(1560, 1600, 1900) = 1560  (no cap)
   *   newFamilyOopMet    = 7400 + 1560 = 8960
   *   newFamilyOopRemaining = 9000 - 8960 = 40
   */
  const plan = makePlan({ deductible_embedded: false });
  const memberC = makeMember('C', 'Member C', 2600);
  const memberA = makeMember('A', 'Member A', 0);
  const memberB = makeMember('B', 'Member B', 0);
  const household = makeHousehold(plan, [memberA, memberB, memberC], 2600, 7400);
  const claim: ProjectedClaim = {
    member_id: 'C',
    cpt_codes: [],
    estimated_allowed: 6200,
  };

  const result = simulateClaim(household, claim);

  it('projected_member_cost = 1560', () => {
    expect(result.projected_member_cost).toBe(1560);
  });

  it('dedPortion = 400', () => {
    expect(result.breakdown.dedPortion).toBe(400);
  });

  it('coinsPortion = 1160', () => {
    expect(result.breakdown.coinsPortion).toBeCloseTo(1160, 5);
  });

  it('capReason = none', () => {
    expect(result.breakdown.capReason).toBe('none');
  });

  it('newFamilyOopMet = 8960', () => {
    expect(result.breakdown.newFamilyOopMet).toBe(8960);
  });

  it('newFamilyOopRemaining ≈ 40 for all members', () => {
    expect(result.breakdown.newFamilyOopRemaining).toBe(40);
    result.per_member_remaining.forEach((r) => {
      expect(r.after).toBe(40);
    });
  });
});

// ─── Scenario 2: Embedded, member ded not met, claim < individual ded ─────────
describe('Scenario 2 – Embedded: claim fully under individual deductible', () => {
  /**
   * Member has met $0 of $1500 individual ded.  Claim allowed = 800.
   * Family ded met = 0.
   *
   * Embedded: dedRemainingApplicable = min(1500, 3000) = 1500
   * dedPortion = min(800, 1500) = 800
   * coinsPortion = 0
   * memberCost = 800
   * No OOP cap applies (member OOP remaining = 4500).
   */
  const plan = makePlan({ deductible_embedded: true });
  const member = makeMember('A', 'Alice', 0);
  const household = makeHousehold(plan, [member], 0, 0);
  const claim: ProjectedClaim = {
    member_id: 'A',
    cpt_codes: [],
    estimated_allowed: 800,
  };
  const result = simulateClaim(household, claim);

  it('all cost is deductible, zero coinsurance', () => {
    expect(result.breakdown.dedPortion).toBe(800);
    expect(result.breakdown.coinsPortion).toBe(0);
    expect(result.projected_member_cost).toBe(800);
  });
});

// ─── Scenario 3: Embedded vs Aggregate DIVERGENCE ────────────────────────────
describe('Scenario 3 – Embedded vs aggregate divergence', () => {
  /**
   * Member has $1400 of $1500 individual ded met.
   * Family ded met = 200 of 3000 (nowhere near done).
   * Claim allowed = 2000.
   *
   * EMBEDDED:
   *   indivDedRemaining = 1500 - 1400 = 100
   *   familyDedRemaining = 3000 - 200 = 2800
   *   dedRemainingApplicable = min(100, 2800) = 100
   *   dedPortion = 100; coinsPortion = (2000-100)*0.20 = 380; cost = 480
   *
   * AGGREGATE:
   *   dedRemainingApplicable = 2800
   *   dedPortion = min(2000, 2800) = 2000; coinsPortion = 0; cost = 2000
   *
   * The two must differ.
   */
  const member = makeMember('A', 'Alice', 1400);
  const claimSpec: ProjectedClaim = {
    member_id: 'A',
    cpt_codes: [],
    estimated_allowed: 2000,
  };

  const embedded = simulateClaim(
    makeHousehold(makePlan({ deductible_embedded: true }), [member], 200, 0),
    claimSpec,
  );
  const aggregate = simulateClaim(
    makeHousehold(makePlan({ deductible_embedded: false }), [member], 200, 0),
    claimSpec,
  );

  it('embedded cost != aggregate cost', () => {
    expect(embedded.projected_member_cost).not.toBe(
      aggregate.projected_member_cost,
    );
  });

  it('embedded cost = 480', () => {
    expect(embedded.projected_member_cost).toBeCloseTo(480, 5);
  });

  it('aggregate cost = 2000 (all deductible)', () => {
    expect(aggregate.projected_member_cost).toBe(2000);
  });
});

// ─── Scenario 4: Claim fully under remaining deductible, no coinsurance ───────
describe('Scenario 4 – Claim fully absorbed by deductible, zero coinsurance', () => {
  const plan = makePlan({ deductible_embedded: true });
  const member = makeMember('A', 'Alice', 0);
  const household = makeHousehold(plan, [member], 0, 0);
  const claim: ProjectedClaim = {
    member_id: 'A',
    cpt_codes: [],
    estimated_allowed: 300,
  };
  const result = simulateClaim(household, claim);

  it('coinsPortion is 0', () => {
    expect(result.breakdown.coinsPortion).toBe(0);
  });

  it('cappedCost == dedPortion', () => {
    expect(result.breakdown.cappedCost).toBe(result.breakdown.dedPortion);
  });
});

// ─── Scenario 5: Claim hits family OOP cap ───────────────────────────────────
describe('Scenario 5 – Claim hits family OOP cap', () => {
  /**
   * Family OOP nearly maxed: met 8800 of 9000 → remaining = 200.
   * Member fully past deductible: ded met = 1500.
   * Claim allowed = 2000 → memberCost = 2000 * 0.20 = 400.
   * familyOopRemaining = 200 → cappedCost = 200, capReason = family_oop.
   */
  const plan = makePlan({ deductible_embedded: true });
  const member = makeMember('A', 'Alice', 1500);
  const household = makeHousehold(plan, [member], 3000, 8800);
  const claim: ProjectedClaim = {
    member_id: 'A',
    cpt_codes: [],
    estimated_allowed: 2000,
  };
  const result = simulateClaim(household, claim);

  it('cappedCost = 200 (family OOP cap)', () => {
    expect(result.projected_member_cost).toBe(200);
  });

  it('capReason = family_oop', () => {
    expect(result.breakdown.capReason).toBe('family_oop');
  });
});

// ─── Scenario 6: Member already at individual OOP max → pays 0 ───────────────
describe('Scenario 6 – Member at individual OOP max, pays 0', () => {
  const plan = makePlan({ deductible_embedded: true });
  const member = makeMember('A', 'Alice', 1500, 4500); // indivOopMet = 4500
  const household = makeHousehold(plan, [member], 1500, 4500);
  const claim: ProjectedClaim = {
    member_id: 'A',
    cpt_codes: [],
    estimated_allowed: 5000,
  };
  const result = simulateClaim(household, claim);

  it('member pays 0', () => {
    expect(result.projected_member_cost).toBe(0);
  });

  it('capReason = individual_oop', () => {
    expect(result.breakdown.capReason).toBe('individual_oop');
  });
});

// ─── Scenario 7: Family at family OOP max → every member pays 0 ──────────────
describe('Scenario 7 – Family at family OOP max, all members pay 0', () => {
  const plan = makePlan({ deductible_embedded: true });
  const memberA = makeMember('A', 'Alice', 1500, 3000);
  const memberB = makeMember('B', 'Bob', 1500, 3000);
  const household = makeHousehold(plan, [memberA, memberB], 3000, 9000);
  const claim: ProjectedClaim = {
    member_id: 'A',
    cpt_codes: [],
    estimated_allowed: 3000,
  };
  const result = simulateClaim(household, claim);

  it('member pays 0', () => {
    expect(result.projected_member_cost).toBe(0);
  });

  it('all per_member_remaining.after == 0', () => {
    result.per_member_remaining.forEach((r) => {
      expect(r.after).toBe(0);
    });
  });
});

// ─── Scenario 8: Cross-member ripple ─────────────────────────────────────────
describe('Scenario 8 – Cross-member ripple (claim 43(ii))', () => {
  /**
   * Family OOP before: 7400/9000 → remaining = 1600.
   * Claim member pays 1000 (capped) → newFamilyOopRemaining = 600.
   * Every other member's `after` should equal 600.
   */
  const plan = makePlan({ deductible_embedded: false });
  const memberA = makeMember('A', 'Alice', 0, 0);
  const memberB = makeMember('B', 'Bob', 0, 0);
  const memberC = makeMember('C', 'Carol', 3000, 3000); // fully through ded
  const household = makeHousehold(plan, [memberA, memberB, memberC], 3000, 7400);
  // claim allowed = 5000, all post-deductible, coinsurance = 0.20 → 1000; family OOP cap = 1600
  const claim: ProjectedClaim = {
    member_id: 'C',
    cpt_codes: [],
    estimated_allowed: 5000,
  };
  const result = simulateClaim(household, claim);

  it('cappedCost = 1000', () => {
    expect(result.projected_member_cost).toBe(1000);
  });

  it('newFamilyOopRemaining = 600', () => {
    expect(result.breakdown.newFamilyOopRemaining).toBe(600);
  });

  it('every member after == newFamilyOopRemaining (ripple)', () => {
    result.per_member_remaining.forEach((r) => {
      expect(r.after).toBe(result.breakdown.newFamilyOopRemaining);
    });
  });

  it('memberA and memberB before == 1600', () => {
    const a = result.per_member_remaining.find((r) => r.member_id === 'A')!;
    const b = result.per_member_remaining.find((r) => r.member_id === 'B')!;
    expect(a.before).toBe(1600);
    expect(b.before).toBe(1600);
  });
});

// ─── Scenario 9: Cold-start — no estimated_allowed, uses stub (claim 49) ─────
describe('Scenario 9 – Cold-start: estimateAllowed stub (claim 49)', () => {
  const plan = makePlan();
  const member = makeMember('A', 'Alice', 0);
  const household = makeHousehold(plan, [member], 0, 0);
  const claim: ProjectedClaim = {
    member_id: 'A',
    cpt_codes: ['99214', '93000'], // $167 + $54 = $221 per stub
    // No estimated_allowed — forces estimateAllowed stub
  };
  const result = simulateClaim(household, claim);

  it('returns a SimulationResult without adjudicated data', () => {
    expect(result.projected_member_cost).toBeGreaterThan(0);
    expect(result.breakdown.allowed).toBe(221); // 167 + 54
  });

  it('breakdown is fully populated', () => {
    expect(result.breakdown).toHaveProperty('dedPortion');
    expect(result.breakdown).toHaveProperty('coinsPortion');
    expect(result.breakdown).toHaveProperty('cappedCost');
    expect(result.breakdown).toHaveProperty('capReason');
  });
});

// ─── Scenario 10: Exhaustion date ────────────────────────────────────────────
describe('Scenario 10 – Exhaustion date (claim 43(iii))', () => {
  /**
   * Plan year start 2026-01-01, as-of 2026-04-01 → ~3 months elapsed.
   * ytd_family_spend = 3000 → monthly burn = 1000.
   * After claim: newFamilyOopRemaining = 9000 - 1000 - 0 = 8000.
   *              wait: let's set family OOP already at 7000; claim adds 500.
   *              newFamilyOopMet = 7500, remaining = 1500.
   *              monthsToExhaustion = 1500 / 1000 = 1.5 months ≈ 2026-05-16.
   *
   * With burn rate 0: exhaustion_date must be null.
   */
  const plan = makePlan({ deductible_embedded: false });
  const member = makeMember('A', 'Alice', 3000, 3000); // fully through both
  const household = makeHousehold(
    plan,
    [member],
    3000,
    7000,
    3000,         // ytd_family_spend
    '2026-01-01', // plan_year_start
    '2026-04-01', // as_of_date  (~3 months elapsed)
  );
  const claim: ProjectedClaim = {
    member_id: 'A',
    cpt_codes: [],
    estimated_allowed: 2500,
    // Post-ded entirely; coinsurance = 2500 * 0.20 = 500
  };
  const result = simulateClaim(household, claim);

  it('family_oop_exhaustion_date is a date string', () => {
    expect(result.family_oop_exhaustion_date).not.toBeNull();
    expect(typeof result.family_oop_exhaustion_date).toBe('string');
  });

  it('exhaustion date is after as_of_date', () => {
    expect(result.family_oop_exhaustion_date! > '2026-04-01').toBe(true);
  });

  it('burn rate 0 → exhaustion_date is null', () => {
    const householdNoBurn = makeHousehold(
      plan,
      [member],
      3000,
      7000,
      0, // ytd_family_spend = 0 → burn = 0
      '2026-01-01',
      '2026-04-01',
    );
    const r = simulateClaim(householdNoBurn, claim);
    expect(r.family_oop_exhaustion_date).toBeNull();
  });
});
