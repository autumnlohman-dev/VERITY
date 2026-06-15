/**
 * Golden-file tests for computeStormIndex().
 * Claim 45 / §X compliance is the acceptance criterion.
 */
import { describe, it, expect } from 'vitest';
import { computeStormIndex } from '../stormIndex';
import type { Household, Plan, Member, ProjectedClaim } from '../types';

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

function baseHousehold(familyOopMet: number, ytd = 0): Household {
  const member: Member = {
    id: 'A',
    display_name: 'Alice',
    individual_deductible_met: 0,
    individual_oop_met: 0,
  };
  return {
    plan: makePlan(),
    members: [member],
    family_deductible_met: 0,
    family_oop_met: familyOopMet,
    ytd_family_spend: ytd,
    plan_year_start: '2026-01-01',
    as_of_date: '2026-06-14',
  };
}

describe('computeStormIndex – score range', () => {
  it('score is between 0 and 100', () => {
    const r = computeStormIndex(baseHousehold(0), [], {});
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('computeStormIndex – low risk baseline', () => {
  it('low accumulator burn + no open bills → low score', () => {
    const r = computeStormIndex(baseHousehold(0), [], {});
    // burn=0, bills=0, denial=0.1, deadline=0 → 0.45*0 + 0.25*0 + 0.15*0.1 + 0.15*0 = 0.015 → score=2
    expect(r.score).toBe(2);
    expect(r.features.accumulator_burn_rate).toBe(0);
  });
});

describe('computeStormIndex – high burn rate', () => {
  it('near-exhausted OOP → high score', () => {
    const r = computeStormIndex(baseHousehold(8800), [], {
      denial_likelihood: 0.1,
      deadline_cluster: 0,
    });
    // burn = 8800/9000 ≈ 0.978; 0.45*0.978 + 0.25*0 + 0.15*0.1 + 0.15*0 = 0.440+0.015 = 0.455 → 46
    expect(r.score).toBeGreaterThan(40);
    expect(r.features.accumulator_burn_rate).toBeCloseTo(8800 / 9000, 3);
  });
});

describe('computeStormIndex – large open bills', () => {
  const openClaims: ProjectedClaim[] = [
    { member_id: 'A', cpt_codes: [], estimated_allowed: 5000 },
  ];

  it('large open bill normalized correctly', () => {
    const r = computeStormIndex(baseHousehold(0), openClaims, {});
    // bills feature = min(1, 5000/5000) = 1
    expect(r.features.projected_large_bills).toBe(1);
    // score ≥ 25 from bills alone
    expect(r.score).toBeGreaterThanOrEqual(25);
  });
});

describe('computeStormIndex – features breakdown returned', () => {
  it('returns all four features', () => {
    const r = computeStormIndex(baseHousehold(4500), [], {
      denial_likelihood: 0.3,
      deadline_cluster: 0.5,
    });
    expect(r.features).toHaveProperty('accumulator_burn_rate');
    expect(r.features).toHaveProperty('projected_large_bills');
    expect(r.features.denial_likelihood).toBe(0.3);
    expect(r.features.deadline_cluster).toBe(0.5);
  });
});

describe('computeStormIndex – maximum risk scenario', () => {
  it('all features at max → score = 100', () => {
    const openClaims: ProjectedClaim[] = [
      { member_id: 'A', cpt_codes: [], estimated_allowed: 50_000 },
    ];
    const r = computeStormIndex(baseHousehold(9000), openClaims, {
      denial_likelihood: 1,
      deadline_cluster: 1,
    });
    expect(r.score).toBe(100);
  });
});
