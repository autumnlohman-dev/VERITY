import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Dispute-outcome submission. Mirrors the cases route's beta posture: the
// auth gate is removed, user_id is attached only when a session is present,
// and the client treats failure as non-fatal (localStorage stays the
// offline fallback). Upserts on the client-generated outcome id so the same
// record can be created pending and later resolved.

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
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = (await request.json()) as OutcomeBody
    if (!isUuid(body.outcomeId)) {
      return NextResponse.json({ error: 'Invalid outcomeId' }, { status: 400 })
    }

    const row = {
      id: body.outcomeId,
      ...(isUuid(body.caseId) ? { case_id: body.caseId } : {}),
      ...(user ? { user_id: user.id } : {}),
      ...(body.createdAt ? { created_at: body.createdAt } : {}),
      resolved_at: body.resolvedAt ?? null,
      discrepancy_type: body.discrepancyType ?? null,
      discrepancy_severity: body.discrepancySeverity ?? null,
      dollar_amount_disputed: body.dollarAmountDisputed ?? 0,
      payer_name: body.payerName ?? null,
      payer_type: body.payerType ?? null,
      provider_name: body.providerName ?? null,
      state_of_service: body.stateOfService ?? null,
      regulations_cited: body.regulationsCited ?? [],
      documentation_completeness: body.documentationCompleteness ?? null,
      resolution_pathway_used: body.resolutionPathwayUsed ?? null,
      status: body.status ?? 'pending',
      amount_recovered: body.amountRecovered ?? null,
      days_to_resolution: body.daysToResolution ?? null,
      notes: body.notes ?? null,
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
