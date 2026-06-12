import { createClient } from '@/lib/supabase/server'
import { extractFromBase64, isSupportedExt } from '@/lib/extraction'
import { runAudit, type InsuranceType } from '@/lib/errorDetection'
import { billExtractionToCBS, extractEOBToCBS, isExtractableExt } from '@/lib/cbs/extractor'
import { normalizeCBSSet } from '@/lib/cbs/normalizer'
import type { CanonicalBillingSchema } from '@/lib/cbs/schema'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

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

// Signed-in bill audit. Mirrors /api/audit-guest's extract → audit → CBS
// pipeline (same graceful degradation when the reference tables are empty,
// since it calls the same runAudit), but with an authenticated user, an
// existing case, and persistence of the results back onto that case so they
// render on /cases/[id]. The guest route stores nothing; this one does.
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

    // Audit against the rules engine. Same call as the guest route, so the
    // empty-reference-table degradation (a reference_data_missing preamble
    // rather than a throw) applies identically here.
    const insuranceType = mapInsuranceType(
      caseRow.insurance_type ?? existingBillData.insuranceType
    )
    const errors = await runAudit(lineItems, insuranceType, { supabase })

    const totalBilled = lineItems.reduce((s, li) => s + li.billed_amount, 0)
    const totalBilledInErrors = errors.reduce((s, e) => s + Number(e.billed_amount || 0), 0)
    const totalExpected = errors.reduce((s, e) => s + Number(e.expected_amount || 0), 0)
    const potentialSavings = Math.max(0, totalBilledInErrors - totalExpected)

    // ── CBS cross-document layer (identical to the guest pipeline) ───────────
    const billCbs = billExtractionToCBS(
      {
        lineItems: lineItems.map((li) => ({
          cpt_code: li.cpt_code,
          description: li.description ?? '',
          date_of_service: li.date_of_service,
          units: li.units,
          billed_amount: li.billed_amount,
          modifiers: li.modifiers,
        })),
        billMetadata: {
          provider_name: provider ?? '',
          provider_npi: '',
          bill_date: dateOfService ?? '',
          patient_name: '',
          account_number: caseId,
        },
      },
      `bill_${caseId}`
    )

    let eobCbs: CanonicalBillingSchema | null = null
    const eobExt = String(eobFileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    if (typeof eobFileBase64 === 'string' && eobFileBase64 && isExtractableExt(eobExt)) {
      try {
        eobCbs = await extractEOBToCBS(eobFileBase64, eobExt, `eob_${caseId}`)
        // Pin bill + EOB to a shared episode so the normalizer compares them
        // even without a matching claim number / service date.
        const sharedEpisode =
          billCbs.serviceEpisodeId || eobCbs.serviceEpisodeId || billCbs.claimNumber || `episode_${caseId}`
        billCbs.serviceEpisodeId = sharedEpisode
        eobCbs.serviceEpisodeId = sharedEpisode
        if (!eobCbs.dateOfService) eobCbs.dateOfService = billCbs.dateOfService
      } catch (eobErr) {
        // EOB unreadable — degrade gracefully to a bill-only audit.
        console.error('EOB extraction error:', eobErr)
        eobCbs = null
      }
    }

    const normalizedCbs = normalizeCBSSet(eobCbs ? [billCbs, eobCbs] : [billCbs])

    // ── Persist results onto the case so /cases/[id] can render them ─────────
    // normalizedCbs + lineItems live inside bill_data (jsonb); the case page
    // prefers the persisted cross-document set and falls back to line items.
    const updatedBillData = {
      ...existingBillData,
      lineItems,
      normalizedCbs,
      date_of_service: dateOfService ?? existingBillData.date_of_service ?? '',
      hasEob: !!eobCbs,
      lowConfidence,
    }

    const { error: updateErr } = await supabase
      .from('cases')
      .update({
        status: errors.length > 0 ? 'error_found' : 'no_errors',
        provider_name: provider ?? caseRow.provider_name ?? null,
        amount_billed: totalBilled,
        amount_expected: totalExpected,
        potential_savings: potentialSavings,
        errors_found: errors,
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
      provider,
      errorCount: errors.length,
      totalBilled,
      potentialSavings,
      lowConfidence,
      hasEob: !!eobCbs,
    })
  } catch (error) {
    console.error('Extract/audit error:', error)
    return NextResponse.json({ error: 'Audit failed. Please try again.' }, { status: 500 })
  }
}
