import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Persist per-case panel state (questionnaire answers + computed results) onto
// the case's bill_data JSONB. Generic so every "fill something in on a case"
// panel uses ONE durable path instead of client-only state / localStorage:
// pass a `patch` of whitelisted keys and we merge it into bill_data server-side.
//
// Mirrors /api/em-review's posture: requires a session and scopes every read +
// write to the owner (auth.uid() = user_id, enforced by both the .eq filter and
// RLS). The merge is done against the DB's current bill_data — never the client's
// copy — so concurrent writers (e.g. the E&M route) can't clobber each other.

// Only these bill_data keys may be written through this route.
const ALLOWED_KEYS = new Set(['fhs_inputs', 'fhs_score', 'advocacy_workflow', 'outcome_id'])

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      caseId?: unknown
      patch?: unknown
    }
    const caseId = typeof body.caseId === 'string' ? body.caseId : ''
    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }
    if (!body.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
      return NextResponse.json({ error: 'Missing patch' }, { status: 400 })
    }

    // Keep only the whitelisted keys; ignore anything else the client sent.
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body.patch as Record<string, unknown>)) {
      if (ALLOWED_KEYS.has(k)) patch[k] = v
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No writable fields in patch' }, { status: 400 })
    }

    // Ownership + current bill_data (the authoritative base for the merge).
    const { data: caseRow, error: caseErr } = await supabase
      .from('cases')
      .select('id, bill_data')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single()
    if (caseErr || !caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const existing =
      caseRow.bill_data && typeof caseRow.bill_data === 'object' && !Array.isArray(caseRow.bill_data)
        ? (caseRow.bill_data as Record<string, unknown>)
        : {}
    const nextBillData = { ...existing, ...patch }

    const { error: updateErr } = await supabase
      .from('cases')
      .update({ bill_data: nextBillData })
      .eq('id', caseId)
      .eq('user_id', user.id)
    if (updateErr) {
      console.error('case-state save failed:', updateErr)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('case-state error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
