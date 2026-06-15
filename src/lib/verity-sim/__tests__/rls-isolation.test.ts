/**
 * VERITY RLS Isolation Test — §9 acceptance gate / claim 15 (HIPAA PHI layer).
 *
 * Proves that a confirmed user cannot read another household's simulations
 * through the Supabase JS client (PostgREST enforces RLS policies).
 *
 * Requirements:
 *   NEXT_PUBLIC_SUPABASE_URL       — project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  — PostgREST anon key
 *   SUPABASE_SERVICE_ROLE_KEY      — service role (bypasses RLS for setup/teardown)
 *
 * Run:
 *   npx vitest run src/lib/verity-sim/__tests__/rls-isolation.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? '';
const ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY     ?? '';

// Skip the entire suite when live credentials aren't present.
// Run with env vars set in .env.local to exercise the live DB.
const SKIP = !SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY;

/** Service client — bypasses RLS, used only for test setup and teardown. */
// Clients are only used when SKIP=false; safe to construct with empty strings otherwise.
const svc: SupabaseClient = createClient(SUPABASE_URL || 'https://x.supabase.co', SERVICE_ROLE_KEY || 'x', {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Anon client — PostgREST enforces RLS on every request. */
function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Test state (cleaned up in afterAll) ──────────────────────────────────────
const PASSWORD      = 'Verity-RLS-Test-2026!';
let userAId: string, userBId: string;
let hhAId: string, hhBId: string;
let simId: string;

describe.skipIf(SKIP)('RLS isolation — cross-household read must return 0 rows (claim 15)', () => {

  it('Setup: create users A and B, household A, simulation in household A', async () => {
    // Create user A
    const { data: a, error: eA } = await svc.auth.admin.createUser({
      email: 'rls-ts-a@verity.internal',
      password: PASSWORD,
      email_confirm: true,
    });
    expect(eA).toBeNull();
    userAId = a!.user!.id;

    // Create user B
    const { data: b, error: eB } = await svc.auth.admin.createUser({
      email: 'rls-ts-b@verity.internal',
      password: PASSWORD,
      email_confirm: true,
    });
    expect(eB).toBeNull();
    userBId = b!.user!.id;

    // Create household A (service role, bypasses RLS)
    const { data: hhA, error: eHhA } = await svc
      .from('households')
      .insert({ owner_user_id: userAId, plan_year: 2026 })
      .select('id')
      .single();
    expect(eHhA).toBeNull();
    hhAId = hhA!.id;

    // Create household B
    const { data: hhB, error: eHhB } = await svc
      .from('households')
      .insert({ owner_user_id: userBId, plan_year: 2026 })
      .select('id')
      .single();
    expect(eHhB).toBeNull();
    hhBId = hhB!.id;

    // Insert simulation into household A (service role)
    const { data: sim, error: eSim } = await svc
      .from('simulations')
      .insert({
        household_id: hhAId,
        projected_member_cost: 1560,
        breakdown: { dedPortion: 400, coinsPortion: 1160 },
      })
      .select('id')
      .single();
    expect(eSim).toBeNull();
    simId = sim!.id;
  });

  it('User A can read their own simulation (RLS allows owner)', async () => {
    const client = anonClient();

    const { error: signInErr } = await client.auth.signInWithPassword({
      email: 'rls-ts-a@verity.internal',
      password: PASSWORD,
    });
    expect(signInErr).toBeNull();

    const { data, error } = await client
      .from('simulations')
      .select('id')
      .eq('household_id', hhAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(simId);
  });

  it('User B gets 0 rows when querying household A — RLS blocks cross-household read', async () => {
    const client = anonClient();

    const { error: signInErr } = await client.auth.signInWithPassword({
      email: 'rls-ts-b@verity.internal',
      password: PASSWORD,
    });
    expect(signInErr).toBeNull();

    const { data, error } = await client
      .from('simulations')
      .select('id')
      .eq('household_id', hhAId);

    // PostgREST returns an empty array (not a 403) when RLS filters all rows.
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // ← HIPAA gate: B cannot see A's PHI
  });

});

afterAll(async () => {
  // Cascade deletes clean up households → members → simulations → storm_index etc.
  if (hhAId) await svc.from('households').delete().eq('id', hhAId);
  if (hhBId) await svc.from('households').delete().eq('id', hhBId);
  if (userAId) await svc.auth.admin.deleteUser(userAId);
  if (userBId) await svc.auth.admin.deleteUser(userBId);
});
