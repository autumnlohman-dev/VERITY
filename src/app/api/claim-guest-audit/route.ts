import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type LineItem } from '@/lib/errorDetection'
import { runFullAudit } from '@/lib/audit/runFullAudit'
import { findDuplicateCase } from '@/lib/audit/dedup'
import { normalizeInsuranceType } from '@/lib/insuranceMapping'
import type { NormalizedCBSSet } from '@/lib/cbs/schema'

// Turns a guest's localStorage audit claim into a real, user-owned case row.
// Runs with the caller's session (anon key + cookies), so the insert is subject
// to the user-scoped RLS on `cases`.
//
// The guest's pre-computed errors are NOT trusted: we re-run the same
// runFullAudit pipeline on the stored line items server-side, so the saved case
// is byte-for-byte what a signed-in /api/extract of the same bill would produce.
//
// Idempotent two ways: the originating claim id is recorded in
// bill_data.guest_claim_id (a re-import short-circuits), and a bill-level match
// (provider + date of service + amount) collapses re-uploads of the same bill.

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

// Coerce a stored line item (permissive client JSON) into the audit LineItem shape.
function toLineItem(li: Record<string, unknown>): LineItem {
  return {
    cpt_code: String(li.cpt_code ?? ''),
    description: typeof li.description === 'string' ? li.description : '',
    date_of_service: String(li.date_of_service ?? ''),
    units: Number(li.units) || 1,
    billed_amount: Number(li.billed_amount) || 0,
    modifiers: Array.isArray(li.modifiers) ? li.modifiers.map(String) : [],
  }
}

// First line item carrying a date of service — mirrors what /api/extract stores.
function deriveDateOfService(lineItems: LineItem[]): string {
  for (const li of lineItems) {
    if (li.date_of_service && li.date_of_service.trim()) return li.date_of_service
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

    // Dedup #1: this exact claim was already imported → return that case.
    const { data: existing } = await supabase
      .from('cases')
      .select('id')
      .eq('user_id', user.id)
      .eq('bill_data->>guest_claim_id', claimId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ caseId: existing.id, alreadyImported: true })
    }

    const inputs = body.inputs ?? {}
    const insuranceType = asString(inputs.insuranceType)
    const lineItems = (audit.lineItems as Array<Record<string, unknown>>).map(toLineItem)
    const provider = asString(audit.provider)
    const dateOfService = deriveDateOfService(lineItems)

    // Re-audit server-side through the shared pipeline (don't trust client errors).
    const result = await runFullAudit({
      lineItems,
      insuranceType: normalizeInsuranceType(insuranceType),
      provider,
      dateOfService,
      // Re-audit reads no per-field vision confidence; the guest's boolean flag
      // isn't meaningful here (and bill_data.lowConfidence is display-only).
      lowConfidence: [],
      docIdBase: `claim_${claimId}`,
      supabase,
    })

    // Dedup #2: a different case already holds this same physical bill.
    const duplicate = await findDuplicateCase(supabase, {
      userId: user.id,
      providerName: result.provider,
      dateOfService: result.dateOfService,
      amountBilled: result.totalBilled,
    })
    if (duplicate) {
      return NextResponse.json({ caseId: duplicate.id, alreadyImported: true })
    }

    // Preserve the guest's richer cross-document CBS (e.g. bill+EOB) when it has
    // documents; otherwise use the freshly recomputed bill-only set.
    const guestCbs = audit.normalizedCbs as NormalizedCBSSet | null | undefined
    const normalizedCbs =
      guestCbs && Array.isArray(guestCbs.documents) && guestCbs.documents.length > 0
        ? guestCbs
        : result.normalizedCbs

    const billData = {
      careType: asString(inputs.careType),
      insuranceType,
      gfe: asString(inputs.gfe),
      tier: asString(inputs.tier),
      userNotes: typeof inputs.userNotes === 'string' ? inputs.userNotes : '',
      lineItems: result.lineItems,
      normalizedCbs,
      date_of_service: result.dateOfService,
      hasEob: result.hasEob || !!audit.hasEob,
      lowConfidence: result.lowConfidence,
      // Provenance + idempotency key for re-import dedup.
      guest_claim_id: claimId,
    }

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        user_id: user.id,
        status: result.errors.length > 0 ? 'error_found' : 'no_errors',
        insurance_type: insuranceType,
        provider_name: result.provider,
        amount_billed: result.totalBilled,
        amount_expected: result.totalExpected,
        potential_savings: result.potentialSavings,
        errors_found: result.errors,
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
