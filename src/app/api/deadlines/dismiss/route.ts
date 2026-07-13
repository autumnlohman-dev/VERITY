import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// User says "not relevant": sets a deadline's status to 'dismissed'. Deadline
// rows are server-written (clients are read-only by RLS), so ownership is
// proven by reading the row through the caller's RLS-scoped client first,
// then the service role applies the one allowed client-initiated transition.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as { deadlineId?: unknown }
    const deadlineId = typeof body.deadlineId === 'string' ? body.deadlineId : ''
    if (!deadlineId) {
      return NextResponse.json({ error: 'Missing deadlineId' }, { status: 400 })
    }

    // RLS-scoped read: only resolves when the deadline belongs to one of the
    // caller's own cases.
    const { data: row, error: readErr } = await supabase
      .from('deadlines')
      .select('id, status')
      .eq('id', deadlineId)
      .maybeSingle()
    if (readErr) {
      console.error('deadlines/dismiss read error:', readErr)
      return NextResponse.json({ error: 'Failed to load deadline' }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: 'Deadline not found' }, { status: 404 })
    }
    if (row.status !== 'active') {
      return NextResponse.json({ error: 'Only active deadlines can be dismissed' }, { status: 409 })
    }

    const { error: updateErr } = await createAdminClient()
      .from('deadlines')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', deadlineId)
      .eq('status', 'active')
    if (updateErr) {
      console.error('deadlines/dismiss update error:', updateErr)
      return NextResponse.json({ error: 'Failed to dismiss the deadline' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('deadlines/dismiss error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
