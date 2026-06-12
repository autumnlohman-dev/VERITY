import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Turns a guest's localStorage audit claim into a real, user-owned case row.
// Runs with the caller's session (anon key + cookies), so the insert is subject
// to the user-scoped RLS on `cases` — user_id is stamped to auth.uid() and the
// `with check (auth.uid() = user_id)` policy enforces ownership.
//
// Idempotent: the originating claim id is recorded in bill_data.guest_claim_id,
// and a prior import for this user short-circuits to the existing case so a
// double trigger (login redirect + dashboard fallback) never duplicates.

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface ClaimBody {
  claimId?: unknown
  createdAt?: unknown
  audit?: {
    provider?: unknown
    lineItems?: unknown
    errors?: unknown
    totalBilled?: unknown
    potentialSavings?: unknown
    normalizedCbs?: unknown
    hasEob?: unknown
    lowConfidence?: unknown
  }
  inputs?: {
    careType?: unknown
    insuranceType?: unknown
    gfe?: unknown
    tier?: unknown
    userNotes?: unknown
  }
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

// First line item carrying a date of service — mirrors what /api/extract stores.
function deriveDateOfService(lineItems: Array<Record<string, unknown>>): string {
  for (const li of lineItems) {
    const dos = li?.date_of_service
    if (typeof dos === 'string' && dos.trim()) return dos
  }
  return ''
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = (await request.json()) as ClaimBody
    const claimId = typeof body.claimId === 'string' ? body.claimId : ''
    const audit = body.audit
    if (!claimId || !audit || !Array.isArray(audit.lineItems)) {
      return NextResponse.json({ error: 'Malformed claim' }, { status: 422 })
    }

    // Freshness guard (the client also checks, but don't trust the client).
    const created = body.createdAt ? new Date(String(body.createdAt)).getTime() : NaN
    if (Number.isFinite(created) && Date.now() - created > MAX_AGE_MS) {
      return NextResponse.json({ error: 'Claim expired' }, { status: 422 })
    }

    // Dedup: if this user already imported this claim, return that case.
    const { data: existing } = await supabase
      .from('cases')
      .select('id')
      .eq('user_id', user.id)
      .eq('bill_data->>guest_claim_id', claimId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ caseId: existing.id, alreadyImported: true })
    }

    const lineItems = audit.lineItems as Array<Record<string, unknown>>
    const errors = Array.isArray(audit.errors) ? (audit.errors as Array<Record<string, unknown>>) : []
    const inputs = body.inputs ?? {}

    // Recompute server-side what /api/extract would have persisted, so the case
    // renders identically to the audit the guest saw.
    const totalExpected = errors.reduce((s, e) => s + Number(e?.expected_amount ?? 0), 0)
    const status = errors.length > 0 ? 'error_found' : 'no_errors'
    const insuranceType = asString(inputs.insuranceType)

    const billData = {
      careType: asString(inputs.careType),
      insuranceType,
      gfe: asString(inputs.gfe),
      tier: asString(inputs.tier),
      userNotes: typeof inputs.userNotes === 'string' ? inputs.userNotes : '',
      lineItems,
      normalizedCbs: audit.normalizedCbs ?? null,
      date_of_service: deriveDateOfService(lineItems),
      hasEob: !!audit.hasEob,
      lowConfidence: !!audit.lowConfidence,
      // Provenance + idempotency key for re-import dedup.
      guest_claim_id: claimId,
    }

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        user_id: user.id,
        status,
        insurance_type: insuranceType,
        provider_name: asString(audit.provider),
        amount_billed: Number(audit.totalBilled ?? 0),
        amount_expected: totalExpected,
        potential_savings: Number(audit.potentialSavings ?? 0),
        errors_found: errors,
        bill_data: billData,
      })
      .select('id')
      .single()

    if (error) {
      console.error('claim-guest-audit insert error:', error)
      return NextResponse.json({ error: 'Failed to save audit' }, { status: 500 })
    }

    return NextResponse.json({ caseId: newCase.id })
  } catch (err) {
    console.error('claim-guest-audit error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
