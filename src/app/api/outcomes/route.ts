import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Dispute-outcome submission. Requires a session and stamps the row with the
// owner's user_id so outcomes are isolated per user. Guests accumulate records
// in localStorage; syncOutcomes() replays them here once the user logs in. The
// client treats a non-2xx (incl. 401 while a guest) as non-fatal — localStorage
// stays the offline fallback. Upserts on the client-generated outcome id so the
// same record can be created pending and later resolved.

interface OutcomeBody {
  outcomeId: string
  caseId?: string
  createdAt?: string
  resolvedAt?: string
  discrepancyType?: string
  discrepancySeverity?: string
  dollarAmountDisputed?: number
  payerName?: string
  payerType?: string
  providerName?: string
  stateOfService?: string
  regulationsCited?: string[]
  documentationCompleteness?: string
  resolutionPathwayUsed?: string
  status?: string
  amountRecovered?: number
  daysToResolution?: number
  notes?: string
  // Dispatch + response fields: guests record these locally with the same
  // shape, and the login sync replays them here so nothing is lost.
  sentAt?: string
  recipientType?: string
  recipientName?: string
  letterVersion?: string
  lobLetterId?: string
  responseReceivedAt?: string
  responseSummary?: string
  responseDocumentPath?: string
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = (await request.json()) as OutcomeBody
    if (!isUuid(body.outcomeId)) {
      return NextResponse.json({ error: 'Invalid outcomeId' }, { status: 400 })
    }

    // M3: ownership check. The upsert keys on the client-supplied outcomeId, so
    // verify it isn't already owned by a different user before writing. RLS would
    // reject the cross-user UPDATE, but it does so opaquely (and a SELECT under
    // RLS can't even see another user's row to check) — so we look it up with the
    // service role and return a clean 403. Defense in depth on top of RLS.
    const admin = createAdminClient()
    const { data: existingOwner } = await admin
      .from('dispute_outcomes')
      .select('user_id')
      .eq('id', body.outcomeId)
      .maybeSingle()
    if (existingOwner && existingOwner.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized for this outcome' }, { status: 403 })
    }

    // L5: don't trust client-supplied timestamps or numbers. created_at is left
    // to the DB default (now()) so a user can't backdate their own record;
    // numeric fields are coerced and clamped to a sane range; resolved_at and
    // status are validated; free-text fields are length-capped.
    const clampNum = (v: unknown, min: number, max: number): number | null => {
      const n = Number(v)
      if (!Number.isFinite(n)) return null
      return Math.min(max, Math.max(min, n))
    }
    const capStr = (v: unknown, max: number): string | null =>
      typeof v === 'string' && v.trim() ? v.slice(0, max) : null
    // User-label vocabulary plus the dispatch lifecycle (rows created server-
    // side at Lob dispatch); matches the dispute_outcomes status CHECK.
    const VALID_STATUSES = new Set([
      'pending', 'in_progress', 'won', 'partial', 'lost', 'abandoned',
      'draft', 'sent', 'response_received', 'resolved', 'denied', 'no_response', 'escalated',
    ])
    const status =
      typeof body.status === 'string' && VALID_STATUSES.has(body.status) ? body.status : 'pending'
    const resolvedAt =
      typeof body.resolvedAt === 'string' && !Number.isNaN(Date.parse(body.resolvedAt))
        ? body.resolvedAt
        : null

    const row = {
      id: body.outcomeId,
      ...(isUuid(body.caseId) ? { case_id: body.caseId } : {}),
      user_id: user.id,
      resolved_at: resolvedAt,
      discrepancy_type: capStr(body.discrepancyType, 80),
      discrepancy_severity: capStr(body.discrepancySeverity, 40),
      dollar_amount_disputed: clampNum(body.dollarAmountDisputed, 0, 100_000_000) ?? 0,
      payer_name: capStr(body.payerName, 200),
      payer_type: capStr(body.payerType, 40),
      provider_name: capStr(body.providerName, 200),
      state_of_service: capStr(body.stateOfService, 40),
      regulations_cited: Array.isArray(body.regulationsCited)
        ? body.regulationsCited.slice(0, 50).map((r) => String(r).slice(0, 300))
        : [],
      documentation_completeness: capStr(body.documentationCompleteness, 40),
      resolution_pathway_used: capStr(body.resolutionPathwayUsed, 120),
      status,
      amount_recovered: body.amountRecovered != null ? clampNum(body.amountRecovered, 0, 100_000_000) : null,
      days_to_resolution: body.daysToResolution != null ? clampNum(body.daysToResolution, 0, 100_000) : null,
      notes: capStr(body.notes, 4000),
      updated_at: new Date().toISOString(),
      // Dispatch/response parity for guest-recorded rows. Guests cannot mail
      // through Lob, so these normally arrive only via the login sync of a
      // guest's self-tracked outcomes. Dates validated, strings capped;
      // recipient_type must satisfy the DB CHECK or is dropped.
      ...(typeof body.sentAt === 'string' && !Number.isNaN(Date.parse(body.sentAt))
        ? { sent_at: body.sentAt }
        : {}),
      ...(typeof body.recipientType === 'string' &&
      ['provider', 'payer', 'regulator', 'credit_bureau', 'collector'].includes(body.recipientType)
        ? { recipient_type: body.recipientType }
        : {}),
      ...(capStr(body.recipientName, 200) ? { recipient_name: capStr(body.recipientName, 200) } : {}),
      ...(capStr(body.letterVersion, 40) ? { letter_version: capStr(body.letterVersion, 40) } : {}),
      ...(capStr(body.lobLetterId, 80) ? { lob_letter_id: capStr(body.lobLetterId, 80) } : {}),
      ...(typeof body.responseReceivedAt === 'string' && !Number.isNaN(Date.parse(body.responseReceivedAt))
        ? { response_received_at: body.responseReceivedAt }
        : {}),
      ...(capStr(body.responseSummary, 2000) ? { response_summary: capStr(body.responseSummary, 2000) } : {}),
      ...(capStr(body.responseDocumentPath, 300) ? { response_document_path: capStr(body.responseDocumentPath, 300) } : {}),
    }

    const { error } = await supabase
      .from('dispute_outcomes')
      .upsert(row, { onConflict: 'id' })

    if (error) {
      console.error('Outcome upsert error:', error)
      return NextResponse.json({ error: 'Failed to save outcome' }, { status: 500 })
    }

    return NextResponse.json({ success: true, outcomeId: body.outcomeId })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
