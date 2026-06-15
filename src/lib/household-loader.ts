/**
 * Shared household loader — server-only.
 *
 * Assembles a verity-sim Household from Supabase rows.  The caller passes
 * whichever Supabase client is appropriate (user-scoped SSR client for
 * interactive routes, service-role client for cron batch).  All RLS
 * enforcement therefore comes from the client the caller supplies —
 * this function is pure mapping with no auth opinions of its own.
 *
 * v1 proxy: ytd_family_spend is taken from the family accumulator's oop_met.
 * This is intentionally conservative; a future version will sum adjudicated
 * claim allowed-amounts from the claims table once that table lands.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Household, Member, Plan } from './verity-sim/types';

export async function loadHousehold(
  supabase: SupabaseClient,
  household_id: string,
): Promise<Household | null> {
  // ── 1. households row ───────────────────────────────────────────────────
  const { data: hh, error: hhErr } = await supabase
    .from('households')
    .select('id, owner_user_id, plan_year')
    .eq('id', household_id)
    .maybeSingle();

  if (hhErr || !hh) return null;

  // ── 2. plans row (most recent for this household / plan_year) ───────────
  const { data: planRow } = await supabase
    .from('plans')
    .select(
      'id, individual_deductible, family_deductible, individual_oop_max,' +
      ' family_oop_max, coinsurance_rate, deductible_embedded',
    )
    .eq('household_id', household_id)
    .eq('plan_year', hh.plan_year)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!planRow) return null; // incomplete profile

  const plan: Plan = {
    individual_deductible: Number(planRow.individual_deductible ?? 0),
    family_deductible:     Number(planRow.family_deductible     ?? 0),
    individual_oop_max:    Number(planRow.individual_oop_max    ?? 0),
    family_oop_max:        Number(planRow.family_oop_max        ?? 0),
    coinsurance_rate:      Number(planRow.coinsurance_rate      ?? 0),
    deductible_embedded:   Boolean(planRow.deductible_embedded),
  };

  // ── 3. members rows ──────────────────────────────────────────────────────
  const { data: memberRows = [] } = await supabase
    .from('members')
    .select('id, display_name')
    .eq('household_id', household_id);

  // ── 4. accumulator_state rows ────────────────────────────────────────────
  const { data: accumRows = [] } = await supabase
    .from('accumulator_state')
    .select('scope, member_id, deductible_met, oop_met, as_of_date')
    .eq('household_id', household_id)
    .order('as_of_date', { ascending: false });

  // Family accumulators: pick latest row for scope='family'
  const familyAccum = accumRows.find((r: { scope: string }) => r.scope === 'family');
  if (!familyAccum) return null; // incomplete profile — cannot project without accumulators

  // Individual accumulators: one per member (latest per member_id)
  const seenMembers = new Set<string>();
  const indivAccumMap = new Map<string, { deductible_met: number; oop_met: number }>();
  for (const r of accumRows as Array<{
    scope: string; member_id: string | null;
    deductible_met: number; oop_met: number;
  }>) {
    if (r.scope === 'individual' && r.member_id && !seenMembers.has(r.member_id)) {
      seenMembers.add(r.member_id);
      indivAccumMap.set(r.member_id, {
        deductible_met: Number(r.deductible_met),
        oop_met:        Number(r.oop_met),
      });
    }
  }

  // ── 5. Assemble Member[] ─────────────────────────────────────────────────
  const members: Member[] = (memberRows as Array<{ id: string; display_name: string | null }>)
    .map((m) => {
      const indiv = indivAccumMap.get(m.id);
      return {
        id:                        m.id,
        display_name:              m.display_name ?? '',
        individual_deductible_met: indiv?.deductible_met ?? 0,
        individual_oop_met:        indiv?.oop_met        ?? 0,
      };
    });

  // ── 6. Assemble Household ────────────────────────────────────────────────
  const household: Household = {
    members,
    plan,
    family_deductible_met: Number(familyAccum.deductible_met),
    family_oop_met:        Number(familyAccum.oop_met),
    plan_year_start:       `${hh.plan_year}-01-01`,
    as_of_date:            familyAccum.as_of_date,
    // v1 proxy: use family OOP met as ytd_family_spend.
    // Replace with sum(adjudicated claims) once the claims table exists.
    ytd_family_spend:      Number(familyAccum.oop_met),
  };

  return household;
}
