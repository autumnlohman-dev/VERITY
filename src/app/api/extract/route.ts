import { createClient } from '@/lib/supabase/server'
import { extractFromBase64, isSupportedExt } from '@/lib/extraction'
import { type InsuranceType } from '@/lib/errorDetection'
import { runFullAudit } from '@/lib/audit/runFullAudit'
import { findDuplicateCase } from '@/lib/audit/dedup'
import { MAX_FILE_BYTES } from '@/lib/billExtractor'
import { checkRateLimit, decodedBase64Bytes } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Signed-in route → throttle per user: 30 audits / 10 minutes.
const EXTRACT_RATE_LIMIT = 30
const EXTRACT_RATE_WINDOW_SECONDS = 600

const VALID: InsuranceType[] = ['commercial', 'medicare', 'medicaid', 'self-pay', 'tricare', 'other']

function mapInsuranceType(raw: unknown): InsuranceType {
  const v = String(raw ?? '').toLowerCase()
  if (v.includes('medicare')) return 'medicare'
  if (v.includes('medicaid')) return 'medicaid'
  if (v.includes('self')) return 'self-pay'
  if (v.includes('tricare')) return 'tricare'
  if (v.includes('commercial') || v.includes('ppo') || v.includes('hmo') || v.includes('epo')) return 'commercial'
  return VALID.includes(v as InsuranceType) ? (v as InsuranceType) : 'commercial'
}

// Signed-in bill audit. Runs the shared runFullAudit pipeline (identical to the
// guest + claim paths) and persists the result onto the case so it renders on
// /cases/[id]. The guest route stores nothing; this one does.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { caseId, billFileBase64, billFileName, eobFileBase64, eobFileName } = await request.json()

    if (typeof caseId !== 'string' || !caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }
    if (typeof billFileBase64 !== 'string' || !billFileBase64) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }
    const ext = String(billFileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    if (!isSupportedExt(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type. Upload a PDF, PNG, JPG, or WEBP (HEIC isn't supported yet).` },
        { status: 400 }
      )
    }

    // Reject oversized payloads BEFORE spending an Anthropic vision call on them.
    if (
      decodedBase64Bytes(billFileBase64) > MAX_FILE_BYTES ||
      (typeof eobFileBase64 === 'string' && decodedBase64Bytes(eobFileBase64) > MAX_FILE_BYTES)
    ) {
      return NextResponse.json(
        { error: 'That file is too large (20 MB max). Upload a smaller PDF or photo.' },
        { status: 413 }
      )
    }

    // Per-user throttle on the signed-in audit.
    const rl = await checkRateLimit({
      bucket: `extract:${user.id}`,
      limit: EXTRACT_RATE_LIMIT,
      windowSeconds: EXTRACT_RATE_WINDOW_SECONDS,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many audits in a short period. Please wait a few minutes and try again.' },
        { status: 429 }
      )
    }

    // Load + authorize the case. Ownership is enforced by user_id so one user
    // can't run an audit against another user's case.
    const { data: caseRow, error: caseErr } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (caseErr) {
      console.error('Case lookup error:', caseErr)
      return NextResponse.json({ error: 'Failed to load case' }, { status: 500 })
    }
    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // Vision extraction (proprietary Component I).
    const { lineItems, provider, dateOfService, lowConfidence } = await extractFromBase64(billFileBase64, ext)
    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: 'No billable line items could be read from this document. Try a clearer photo or the itemized bill.' },
        { status: 422 }
      )
    }

    const existingBillData =
      caseRow.bill_data && typeof caseRow.bill_data === 'object' && !Array.isArray(caseRow.bill_data)
        ? (caseRow.bill_data as Record<string, unknown>)
        : {}

    const insuranceType = mapInsuranceType(caseRow.insurance_type ?? existingBillData.insuranceType)
    const eobExt = String(eobFileName ?? '').split('.').pop()?.toLowerCase() ?? ''

    const result = await runFullAudit({
      lineItems,
      insuranceType,
      provider,
      dateOfService,
      lowConfidence,
      docIdBase: caseId,
      accountNumber: caseId,
      eob: typeof eobFileBase64 === 'string' && eobFileBase64 ? { base64: eobFileBase64, ext: eobExt } : null,
      supabase,
    })

    // ── Bill-level dedup ─────────────────────────────────────────────────────
    // The same physical bill (same provider + date of service + amount billed)
    // should live in the dashboard exactly once. If a populated case already
    // matches, discard this freshly-created shell and point the user at it.
    const duplicate = await findDuplicateCase(supabase, {
      userId: user.id,
      excludeCaseId: caseId,
      providerName: result.provider ?? caseRow.provider_name ?? null,
      dateOfService: result.dateOfService,
      amountBilled: result.totalBilled,
    })
    if (duplicate) {
      // Remove the empty shell this upload just created so it doesn't linger.
      await supabase.from('cases').delete().eq('id', caseId).eq('user_id', user.id)
      return NextResponse.json({ duplicate: true, caseId: duplicate.id })
    }

    // ── Persist results onto the case so /cases/[id] can render them ─────────
    const updatedBillData = {
      ...existingBillData,
      lineItems: result.lineItems,
      normalizedCbs: result.normalizedCbs,
      date_of_service: result.dateOfService || existingBillData.date_of_service || '',
      hasEob: result.hasEob,
      lowConfidence: result.lowConfidence,
    }

    const { error: updateErr } = await supabase
      .from('cases')
      .update({
        status: result.errors.length > 0 ? 'error_found' : 'no_errors',
        provider_name: result.provider ?? caseRow.provider_name ?? null,
        amount_billed: result.totalBilled,
        amount_expected: result.totalExpected,
        potential_savings: result.potentialSavings,
        errors_found: result.errors,
        bill_data: updatedBillData,
      })
      .eq('id', caseId)
      .eq('user_id', user.id)

    if (updateErr) {
      console.error('Case update error:', updateErr)
      return NextResponse.json({ error: 'Failed to save audit results' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      caseId,
      provider: result.provider,
      errorCount: result.errors.length,
      totalBilled: result.totalBilled,
      potentialSavings: result.potentialSavings,
      lowConfidence: result.lowConfidence,
      hasEob: result.hasEob,
    })
  } catch (error) {
    console.error('Extract/audit error:', error)
    return NextResponse.json({ error: 'Audit failed. Please try again.' }, { status: 500 })
  }
}
