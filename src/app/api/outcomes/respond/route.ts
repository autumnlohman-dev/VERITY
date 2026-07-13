import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pathHasPrefix } from '@/lib/storage/bills'
import { validateResponseUpdate } from '@/lib/outcomes/respond'
import { applyOutcomeDeadlines } from '@/lib/deadlines/applyOutcomeWindows'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Records what happened after a dispatched letter: the response intake for a
// dispute_outcomes row. Status rules live server-side in validateResponseUpdate
// (the UI mirrors them for feedback only). Runs with the caller's RLS-scoped
// client, so a user can only ever load and update their own rows; the explicit
// user_id filters are defense in depth on top of RLS.
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
      outcomeId?: unknown
      result?: unknown
      responseAt?: unknown
      responseSummary?: unknown
      amountRecovered?: unknown
      responseDocumentPath?: unknown
      // Intake gates (step 4): collected on denied/no_response, skippable.
      patientState?: unknown
      inCollections?: unknown
      onCreditReport?: unknown
    }
    const outcomeId = typeof body.outcomeId === 'string' ? body.outcomeId : ''
    if (!outcomeId) {
      return NextResponse.json({ error: 'Missing outcomeId' }, { status: 400 })
    }

    const { data: row, error: rowErr } = await supabase
      .from('dispute_outcomes')
      .select('id, case_id, sent_at, dollar_amount_disputed')
      .eq('id', outcomeId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (rowErr) {
      console.error('outcomes/respond row lookup error:', rowErr)
      return NextResponse.json({ error: 'Failed to load outcome' }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: 'Outcome not found' }, { status: 404 })
    }

    // Partial-recovery bound: the row's disputed amount when it carries one,
    // else the case's potential savings when available.
    let disputedAmount = Number(row.dollar_amount_disputed) > 0 ? Number(row.dollar_amount_disputed) : null
    if (disputedAmount == null && row.case_id) {
      const { data: caseRow } = await supabase
        .from('cases')
        .select('potential_savings')
        .eq('id', row.case_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (caseRow && Number(caseRow.potential_savings) > 0) {
        disputedAmount = Number(caseRow.potential_savings)
      }
    }

    const validation = validateResponseUpdate(
      {
        result: body.result,
        responseAt: body.responseAt,
        responseSummary: body.responseSummary,
        amountRecovered: body.amountRecovered,
      },
      { sentAt: (row.sent_at as string) ?? null, disputedAmount }
    )
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 422 })
    }

    // The uploaded response/denial letter is evidence only this step (no
    // parsing, no audit). Its path must sit under the caller's own folder.
    let responseDocumentPath: string | null = null
    if (body.responseDocumentPath != null) {
      if (!pathHasPrefix(body.responseDocumentPath, user.id)) {
        return NextResponse.json({ error: 'Invalid response document reference' }, { status: 400 })
      }
      responseDocumentPath = body.responseDocumentPath
    }

    const { data: updated, error: updateErr } = await supabase
      .from('dispute_outcomes')
      .update({
        ...validation.update,
        ...(responseDocumentPath ? { response_document_path: responseDocumentPath } : {}),
        // Response recorded ⇒ the dispute label resolved-at tracks the response
        // event for terminal results; corrections overwrite it.
        resolved_at: validation.update.status === 'no_response' ? null : validation.update.response_received_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', outcomeId)
      .eq('user_id', user.id)
      .select('*')
      .single()
    if (updateErr) {
      console.error('outcomes/respond update error:', updateErr)
      return NextResponse.json({ error: 'Failed to save the response' }, { status: 500 })
    }

    // Intake gates: persist the escalation-pathway facts onto the case. These
    // columns are client-locked (C1 pattern), so the service role writes them;
    // skipped answers stay null and can be filled on a later response.
    const intake: Record<string, unknown> = {}
    if (typeof body.patientState === 'string' && /^[A-Za-z]{2}$/.test(body.patientState.trim())) {
      intake.patient_state = body.patientState.trim().toUpperCase()
    }
    if (typeof body.inCollections === 'boolean') intake.in_collections = body.inCollections
    if (typeof body.onCreditReport === 'boolean') intake.on_credit_report = body.onCreditReport
    if (Object.keys(intake).length > 0 && row.case_id) {
      const { error: intakeErr } = await createAdminClient()
        .from('cases')
        .update(intake)
        .eq('id', row.case_id)
        .eq('user_id', user.id)
      if (intakeErr) {
        console.error(`outcomes/respond: intake-gate persist failed for case ${row.case_id}:`, intakeErr)
      }
    }

    // Deadline transitions for the new state (denied opens the escalation
    // window, resolved/partial satisfy everything, an overdue no_response
    // opens escalation). Server-computed rows: service-role client. Failures
    // are logged loudly; the recorded response never rolls back over them.
    const { error: dlErr } = await applyOutcomeDeadlines(createAdminClient(), {
      outcomeId,
      caseId: (row.case_id as string) ?? '',
      status: validation.update.status,
      sentAt: (row.sent_at as string) ?? null,
      responseReceivedAt: validation.update.response_received_at,
    })
    if (dlErr) {
      console.error(`outcomes/respond: deadline transition failed for outcome ${outcomeId}:`, dlErr)
    }

    return NextResponse.json({ success: true, outcome: updated })
  } catch (err) {
    console.error('outcomes/respond error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
