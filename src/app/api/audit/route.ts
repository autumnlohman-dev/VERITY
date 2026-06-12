import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { runAudit, type LineItem } from '@/lib/errorDetection'
import { analyzeDisputedProcedures } from '@/lib/patientDisputes'
import { normalizeInsuranceType } from '@/lib/insuranceMapping'
import { billExtractionToCBS, extractEOBToCBS, isExtractableExt } from '@/lib/cbs/extractor'
import { normalizeCBSSet } from '@/lib/cbs/normalizer'
import type { CanonicalBillingSchema, NormalizedCBSSet } from '@/lib/cbs/schema'
import { NextResponse } from 'next/server'

// Anthropic generation runs longer than Vercel's 10s Hobby / 15s Pro default.
export const maxDuration = 60

function isLineItem(value: unknown): value is LineItem {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.cpt_code === 'string' &&
    typeof v.date_of_service === 'string' &&
    (typeof v.units === 'number' || typeof v.units === 'string') &&
    (typeof v.billed_amount === 'number' || typeof v.billed_amount === 'string')
  )
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    // Beta: auth gate removed. `user` may be null; downstream user_id
    // filters are skipped when it is.
    const {
      data: { user }
    } = await supabase.auth.getUser()

    const body = await request.json()
    const { caseId, lineItems, insuranceType, userNotes, eobFileBase64, eobFileName } = body ?? {}

    if (!caseId || typeof caseId !== 'string') {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }

    if (!Array.isArray(lineItems) || !lineItems.every(isLineItem)) {
      return NextResponse.json(
        {
          error:
            'lineItems must be an array of line items with cpt_code, date_of_service, units, billed_amount'
        },
        { status: 400 }
      )
    }

    let caseLookup = supabase
      .from('cases')
      .select('id, user_id, insurance_type, provider_name, bill_data')
      .eq('id', caseId)
    if (user) caseLookup = caseLookup.eq('user_id', user.id)
    const { data: caseRecord, error: caseError } = await caseLookup.single()

    if (caseError || !caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const resolvedInsurance = normalizeInsuranceType(
      insuranceType ?? caseRecord.insurance_type
    )

    const caseNotes =
      caseRecord.bill_data &&
      typeof (caseRecord.bill_data as Record<string, unknown>).userNotes ===
        'string'
        ? ((caseRecord.bill_data as Record<string, unknown>).userNotes as string)
        : ''
    const resolvedNotes =
      (typeof userNotes === 'string' && userNotes.trim() && userNotes) ||
      caseNotes

    const normalizedItems: LineItem[] = lineItems.map((li) => ({
      cpt_code: String(li.cpt_code),
      description: typeof li.description === 'string' ? li.description : undefined,
      date_of_service: String(li.date_of_service),
      units: Number(li.units) || 1,
      billed_amount: Number(li.billed_amount) || 0,
      modifiers: Array.isArray(li.modifiers)
        ? li.modifiers.map((m: unknown) => String(m))
        : undefined
    }))

    const [ruleErrors, disputeErrors] = await Promise.all([
      runAudit(normalizedItems, resolvedInsurance, { supabase }),
      analyzeDisputedProcedures(normalizedItems, resolvedNotes)
    ])
    const errors = [...ruleErrors, ...disputeErrors]

    // Recoverable counts ONLY priced findings — lines we couldn't price
    // (rate_unavailable) and the systemic reference-data notice are surfaced for
    // manual review, never summed into the savings figure — and is capped at the
    // billed total so we never claim more recoverable than the bill itself.
    const MANUAL_REVIEW_TYPES = new Set(['rate_unavailable', 'reference_data_missing'])
    const totalBilled = normalizedItems.reduce(
      (sum, li) => sum + Number(li.billed_amount || 0),
      0
    )
    const pricedErrors = errors.filter((err) => !MANUAL_REVIEW_TYPES.has(err.error_type))
    const totalExpected = pricedErrors.reduce(
      (sum, err) => sum + Number(err.expected_amount || 0),
      0
    )
    const recoverable = pricedErrors.reduce(
      (sum, err) => sum + Math.max(0, Number(err.billed_amount || 0) - Number(err.expected_amount || 0)),
      0
    )
    const potentialSavings = Math.min(totalBilled, recoverable)

    const nextStatus = errors.length > 0 ? 'error_found' : 'no_errors'

    // ── CBS cross-document layer ────────────────────────────────────────────
    // Normalize the bill into the Canonical Billing Schema and, when an EOB was
    // uploaded, extract it via the multimodal API and run the cross-document
    // comparison. The result is persisted on the case so the results page can
    // render cross-document discrepancies and the financial timeline.
    const billCbs = billExtractionToCBS(
      {
        lineItems: normalizedItems.map((li) => ({
          cpt_code: li.cpt_code,
          description: li.description ?? '',
          date_of_service: li.date_of_service,
          units: li.units,
          billed_amount: li.billed_amount,
          modifiers: li.modifiers,
        })),
        billMetadata: {
          provider_name: caseRecord.provider_name ?? '',
          provider_npi: '',
          bill_date: normalizedItems[0]?.date_of_service ?? '',
          patient_name: '',
          account_number: String(caseId),
        },
      },
      `bill_${caseId}`
    )

    let eobCbs: CanonicalBillingSchema | null = null
    const eobExt = String(eobFileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    if (typeof eobFileBase64 === 'string' && eobFileBase64 && isExtractableExt(eobExt)) {
      try {
        eobCbs = await extractEOBToCBS(eobFileBase64, eobExt, `eob_${caseId}`)
        // Pin the bill and EOB to a shared episode so the normalizer compares them.
        const sharedEpisode =
          billCbs.serviceEpisodeId || eobCbs.serviceEpisodeId || billCbs.claimNumber || `episode_${caseId}`
        billCbs.serviceEpisodeId = sharedEpisode
        eobCbs.serviceEpisodeId = sharedEpisode
        if (!eobCbs.dateOfService) eobCbs.dateOfService = billCbs.dateOfService
      } catch (eobErr) {
        console.error('EOB extraction error:', eobErr)
        eobCbs = null
      }
    }

    const normalizedCbs: NormalizedCBSSet = normalizeCBSSet(eobCbs ? [billCbs, eobCbs] : [billCbs])

    const existingBillData =
      caseRecord.bill_data && typeof caseRecord.bill_data === 'object'
        ? (caseRecord.bill_data as Record<string, unknown>)
        : {}

    let caseUpdate = supabase
      .from('cases')
      .update({
        status: nextStatus,
        errors_found: errors,
        amount_expected: totalExpected,
        potential_savings: potentialSavings,
        bill_data: { ...existingBillData, lineItems: normalizedItems, normalizedCbs }
      })
      .eq('id', caseId)
    if (user) caseUpdate = caseUpdate.eq('user_id', user.id)
    const { error: updateError } = await caseUpdate

    if (updateError) {
      console.error('Case update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to save audit results' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      caseId,
      status: nextStatus,
      errors,
      errorCount: errors.length,
      potentialSavings,
      insuranceType: resolvedInsurance,
      hasEob: !!eobCbs,
      crossDocumentDiscrepancies: normalizedCbs.crossDocumentDiscrepancies,
      timeline: normalizedCbs.timeline,
      normalizedCbs
    })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error('Audit (Anthropic) error:', error.status, error.message)
      return NextResponse.json(
        { error: 'The dispute analysis is temporarily unavailable. Your bill data has been saved.' },
        { status: 503 }
      )
    }
    console.error('Audit error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
