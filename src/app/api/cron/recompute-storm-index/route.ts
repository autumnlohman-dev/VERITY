/**
 * GET /api/cron/recompute-storm-index
 *
 * Nightly Storm Index batch recompute — service-role, bypasses RLS.
 *
 * Security: locked behind Authorization: Bearer <CRON_SECRET>.
 * Vercel Cron Jobs automatically send this header when CRON_SECRET is set
 * as a Vercel environment variable (Settings → Environment Variables).
 * The schedule is defined in vercel.json.
 *
 * The service-role Supabase client is used intentionally here because this
 * is a trusted batch job that must iterate over all households regardless
 * of ownership.  No user session is involved.
 *
 * Open claims: querying claims in ('ADJUDICATED','BILLED') is a TODO —
 * the claims table doesn't exist yet.  Storm Index therefore runs with
 * openClaims = [] until that table lands.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCronRequest } from '@/lib/cronAuth';
import { loadHousehold } from '@/lib/household-loader';
import { computeStormIndex } from '@/lib/verity-sim/stormIndex';
import type { ProjectedClaim } from '@/lib/verity-sim/types';

export async function GET(req: NextRequest) {
  // ── CRON_SECRET gate (shared with /api/cron/deadlines) ───────────────────
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Service-role client (bypasses RLS — trusted batch only) ──────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Fetch all household ids ───────────────────────────────────────────────
  const { data: households, error: hhErr } = await supabase
    .from('households')
    .select('id');

  if (hhErr || !households) {
    return NextResponse.json(
      { error: 'Failed to fetch households', detail: hhErr?.message },
      { status: 500 },
    );
  }

  let processed = 0;
  let written = 0;
  const errors: string[] = [];

  for (const { id: household_id } of households) {
    try {
      const household = await loadHousehold(supabase, household_id);
      if (!household) {
        // Skip households with incomplete profiles (no plan or accumulators yet).
        errors.push(`${household_id}: incomplete profile, skipped`);
        continue;
      }

      // TODO: replace [] with a query for claims WHERE current_state IN
      // ('ADJUDICATED', 'BILLED') once the claims table exists.
      const openClaims: ProjectedClaim[] = [];

      const { score, features } = computeStormIndex(household, openClaims);

      const { error: insErr } = await supabase.from('storm_index').insert({
        household_id,
        score,
        horizon_days: 90,
        features,
      });

      if (insErr) {
        errors.push(`${household_id}: insert failed, ${insErr.message}`);
      } else {
        written++;
      }

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${household_id}: ${msg}`);
    }
  }

  return NextResponse.json({ processed, written, errors });
}
