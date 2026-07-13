import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sweepReclassify, type DeadlineUrgency, type DeadlineStatus } from '@/lib/deadlines/outcomeWindows'

export const runtime = 'nodejs'
export const maxDuration = 60

// Nightly deadline sweep (vercel.json cron): expires past-due active
// deadlines and re-tiers urgency as due dates approach (critical ≤7 days,
// high ≤30, moderate ≤90). Deterministic — same pure rules the write paths
// use — and idempotent: rerunning changes nothing new.
export async function GET(req: NextRequest) {
  // ── CRON_SECRET gate (same pattern as recompute-storm-index) ─────────────
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date()

  const { data: rows, error } = await admin
    .from('deadlines')
    .select('id, due_date, urgency, status')
    .eq('status', 'active')
  if (error) {
    console.error('sweep-deadlines: read failed:', error)
    return NextResponse.json({ error: 'Read failed' }, { status: 500 })
  }

  let expired = 0
  let retiered = 0
  const failures: string[] = []
  for (const row of rows ?? []) {
    const change = sweepReclassify(
      {
        dueDate: row.due_date as string,
        urgency: row.urgency as DeadlineUrgency,
        status: row.status as DeadlineStatus,
      },
      today
    )
    if (!change) continue
    const { error: upErr } = await admin
      .from('deadlines')
      .update({ ...change, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (upErr) {
      failures.push(String(row.id))
      console.error(`sweep-deadlines: update failed for ${row.id}:`, upErr)
    } else if (change.status === 'expired') {
      expired++
    } else {
      retiered++
    }
  }

  console.info(
    `sweep-deadlines: scanned=${rows?.length ?? 0} expired=${expired} retiered=${retiered} failures=${failures.length}`
  )
  return NextResponse.json({ scanned: rows?.length ?? 0, expired, retiered, failures: failures.length })
}
