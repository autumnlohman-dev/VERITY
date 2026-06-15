/**
 * household-loader unit test — no live DB required.
 *
 * Mocks the Supabase client so loadHousehold runs purely against fixture
 * data.  Then feeds the assembled Household into simulateClaim and asserts
 * the FIG. 10 canonical result (member pays $1,560).
 */
import { describe, it, expect } from 'vitest';
import { loadHousehold } from '../household-loader';
import { simulateClaim } from '../verity-sim/simulateClaim';
import type { ProjectedClaim } from '../verity-sim/types';

// ── FIG. 10 fixture data ─────────────────────────────────────────────────────
const HOUSEHOLD_ID = 'hh-fig10';
const MEMBER_C_ID  = 'member-c';

const FIXTURE = {
  households: { id: HOUSEHOLD_ID, owner_user_id: 'user-1', plan_year: 2026 },
  plans: [
    {
      id: 'plan-1',
      individual_deductible: 1500,
      family_deductible:     3000,
      individual_oop_max:    4500,
      family_oop_max:        9000,
      coinsurance_rate:      0.20,
      deductible_embedded:   false, // aggregate — FIG. 10 scenario
    },
  ],
  members: [
    { id: MEMBER_C_ID, display_name: 'Member C' },
    { id: 'member-a',  display_name: 'Member A' },
  ],
  accumulator_state: [
    // Family accumulator: ded 2600/3000, OOP 7400/9000 — FIG. 10 state
    {
      scope: 'family', member_id: null,
      deductible_met: 2600, oop_met: 7400,
      as_of_date: '2026-06-14',
    },
    // Individual for member C (ded met = 2600)
    {
      scope: 'individual', member_id: MEMBER_C_ID,
      deductible_met: 2600, oop_met: 2600,
      as_of_date: '2026-06-14',
    },
    // Individual for member A
    {
      scope: 'individual', member_id: 'member-a',
      deductible_met: 0, oop_met: 0,
      as_of_date: '2026-06-14',
    },
  ],
};

// ── Thenable query builder ───────────────────────────────────────────────────
// Every method returns a new builder wrapping the same data so chains work.
// The builder is also thenable so `await builder` resolves to {data, error}
// (matching the Supabase PostgREST client contract).
// `.maybeSingle()` unwraps an array to its first element.
function makeBuilder(data: unknown) {
  const resolved = { data, error: null };
  const b = {
    then(
      onFulfilled: (v: { data: unknown; error: null }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) {
      return Promise.resolve(resolved).then(onFulfilled, onRejected);
    },
    select:      (_?: unknown) => makeBuilder(data),
    eq:          (_?: unknown, __?: unknown) => makeBuilder(data),
    order:       (_?: unknown, __?: unknown) => makeBuilder(data),
    limit:       (_?: unknown) => makeBuilder(data),
    maybeSingle: () =>
      Promise.resolve({
        data: Array.isArray(data) ? ((data as unknown[])[0] ?? null) : data,
        error: null,
      }),
  };
  return b;
}

function makeMockSupabase(overrides: Record<string, unknown> = {}) {
  return {
    from: (table: string) => {
      if (table in overrides) return makeBuilder(overrides[table]);
      if (table === 'households')        return makeBuilder(FIXTURE.households);
      if (table === 'plans')             return makeBuilder(FIXTURE.plans);
      if (table === 'members')           return makeBuilder(FIXTURE.members);
      if (table === 'accumulator_state') return makeBuilder(FIXTURE.accumulator_state);
      return makeBuilder(null);
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('loadHousehold — FIG. 10 fixture assembly', () => {
  it('assembles a valid Household from mocked DB rows', async () => {
    const supabase = makeMockSupabase() as Parameters<typeof loadHousehold>[0];
    const hh = await loadHousehold(supabase, HOUSEHOLD_ID);

    expect(hh).not.toBeNull();
    expect(hh!.plan.family_deductible).toBe(3000);
    expect(hh!.plan.family_oop_max).toBe(9000);
    expect(hh!.plan.coinsurance_rate).toBe(0.20);
    expect(hh!.plan.deductible_embedded).toBe(false);
    expect(hh!.family_deductible_met).toBe(2600);
    expect(hh!.family_oop_met).toBe(7400);
    expect(hh!.plan_year_start).toBe('2026-01-01');
    expect(hh!.as_of_date).toBe('2026-06-14');
    expect(hh!.members).toHaveLength(2);

    const memberC = hh!.members.find((m) => m.id === MEMBER_C_ID)!;
    expect(memberC.individual_deductible_met).toBe(2600);
    expect(memberC.individual_oop_met).toBe(2600);
  });

  it('FIG. 10: simulateClaim on loaded household → member pays $1,560', async () => {
    const supabase = makeMockSupabase() as Parameters<typeof loadHousehold>[0];
    const hh = await loadHousehold(supabase, HOUSEHOLD_ID);

    const claim: ProjectedClaim = {
      member_id:         MEMBER_C_ID,
      cpt_codes:         [],
      estimated_allowed: 6200,
    };

    const result = simulateClaim(hh!, claim);

    expect(result.projected_member_cost).toBe(1560);
    expect(result.breakdown.dedPortion).toBe(400);
    expect(result.breakdown.coinsPortion).toBeCloseTo(1160, 5);
    expect(result.breakdown.newFamilyOopMet).toBe(8960);
    expect(result.breakdown.newFamilyOopRemaining).toBe(40);
    result.per_member_remaining.forEach((r) => expect(r.after).toBe(40));
  });

  it('returns null when no plan row exists (incomplete profile)', async () => {
    const supabase = makeMockSupabase({ plans: [] }) as Parameters<typeof loadHousehold>[0];
    const result = await loadHousehold(supabase, HOUSEHOLD_ID);
    expect(result).toBeNull();
  });

  it('returns null when no family accumulator row exists', async () => {
    const supabase = makeMockSupabase({
      accumulator_state: FIXTURE.accumulator_state.filter(
        (r) => r.scope !== 'family',
      ),
    }) as Parameters<typeof loadHousehold>[0];
    const result = await loadHousehold(supabase, HOUSEHOLD_ID);
    expect(result).toBeNull();
  });
});
