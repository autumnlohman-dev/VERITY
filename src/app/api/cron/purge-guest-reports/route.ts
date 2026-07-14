/**
 * GET /api/cron/purge-guest-reports
 *
 * Nightly retention purge: hard-deletes guest_audit_reports rows past their
 * expires_at. Once a report can carry a captured email address, expiry is a
 * privacy commitment, not just a dead link — expired rows must actually
 * leave the database, matching what /report/[token] tells the user
 * ("This link works until {date}").
 *
 * Security: locked behind Authorization: Bearer <CRON_SECRET>, same gate as
 * the other cron routes. Service-role client because the table is RLS-locked
 * with no policies (service-role only by design).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/cronAuth'

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await createAdminClient()
    .from('guest_audit_reports')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id')

  if (error) {
    console.error('purge-guest-reports:', error.message)
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 })
  }

  const purged = data?.length ?? 0
  console.info(`purge-guest-reports: deleted ${purged} expired report(s)`)
  return NextResponse.json({ success: true, purged })
}
