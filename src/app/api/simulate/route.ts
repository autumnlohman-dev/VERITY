/**
 * POST /api/simulate
 *
 * Interactive claim simulation — user-scoped, RLS-enforced.
 *
 * Auth: uses the caller's session cookie via @supabase/ssr createServerClient
 * so every Supabase query runs under the authenticated role with the user's
 * JWT claims set.  The service role key is NEVER used here; household
 * isolation is enforced purely by RLS policies (has_household_access).
 *
 * On success: inserts a simulations row via the same user client so the
 * write-audit trigger fires with the correct actor uid.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { loadHousehold } from '@/lib/household-loader';
import { simulateClaim } from '@/lib/verity-sim/simulateClaim';

const ProjectedClaimSchema = z.object({
  member_id:         z.string().uuid(),
  cpt_codes:         z.array(z.string()),
  estimated_allowed: z.number().positive().optional(),
  estimated_billed:  z.number().positive().optional(),
  provider_npi:      z.string().optional(),
});

const BodySchema = z.object({
  household_id:    z.string().uuid(),
  projected_claim: ProjectedClaimSchema,
});

export async function POST(req: NextRequest) {
  // ── Auth first — reject unauthenticated requests before parsing body ────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch { /* read path, ignore */ }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { household_id, projected_claim } = parsed.data;

  // ── Load household (RLS means loadHousehold returns null if user lacks
  //    access to this household_id, giving a clean 404 with no data leak) ───
  const household = await loadHousehold(supabase, household_id);
  if (!household) {
    // Either the household doesn't exist, the user can't see it (RLS), or
    // the profile is incomplete (missing plan / family accumulator).
    const { data: hhCheck } = await supabase
      .from('households')
      .select('id')
      .eq('id', household_id)
      .maybeSingle();

    if (!hhCheck) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }
    // Household exists but profile is incomplete — graceful degradation §8
    return NextResponse.json(
      {
        error: 'Household profile incomplete',
        hint: 'Add a plan and family accumulator row before simulating.',
      },
      { status: 422 },
    );
  }

  // ── Run pure simulation (no DB I/O inside verity-sim) ────────────────────
  let result;
  try {
    result = simulateClaim(household, projected_claim);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // ── Persist result (user client — RLS with-check + audit trigger) ─────────
  await supabase.from('simulations').insert({
    household_id,
    member_id:                 projected_claim.member_id,
    scenario:                  projected_claim,
    projected_member_cost:     result.projected_member_cost,
    family_oop_exhaustion_date: result.family_oop_exhaustion_date ?? null,
    breakdown:                 result.breakdown,
  });

  return NextResponse.json(result);
}
