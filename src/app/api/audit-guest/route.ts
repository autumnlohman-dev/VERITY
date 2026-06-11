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

// Public, anonymous bill audit — no account, no stored case.
// Reads the (public-readable) rules tables only; writes nothing.
export async function POST(request: Request) {
  try {
    const { fileBase64, fileName, insuranceType, eobFileBase64, eobFileName } = await request.json()

    if (typeof fileBase64 !== 'string' || !fileBase64) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }
    const ext = String(fileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    if (!isSupportedExt(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type. Upload a PDF, PNG, JPG, or WEBP (HEIC isn't supported yet).` },
        { status: 400 }
      )
    }

    // Vision extraction (proprietary Component I).
    const { lineItems, provider, dateOfService, lowConfidence } = await extractFromBase64(fileBase64, ext)
    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: 'No billable line items could be read from this document. Try a clearer photo or the itemized bill.' },
        { status: 422 }
      )
    }

    // Audit against the rules engine (anon client can read the public rules tables).
    const supabase = await createClient()
    const errors = await runAudit(lineItems, mapInsuranceType(insuranceType), { supabase })

    const totalBilled = lineItems.reduce((s, li) => s + li.billed_amount, 0)
    const totalBilledInErrors = errors.reduce((s, e) => s + Number(e.billed_amount || 0), 0)
    const totalExpected = errors.reduce((s, e) => s + Number(e.expected_amount || 0), 0)
    const potentialSavings = Math.max(0, totalBilledInErrors - totalExpected)

    // ── CBS cross-document layer ────────────────────────────────────────────
    // Normalize the bill into the Canonical Billing Schema, and — when an EOB was
    // uploaded — extract it via the multimodal API and run the cross-document
    // comparison. With no EOB this still yields a single-document timeline.
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
          account_number: '',
        },
      },
      'bill_guest'
    )

    let eobCbs: CanonicalBillingSchema | null = null
    const eobExt = String(eobFileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    if (typeof eobFileBase64 === 'string' && eobFileBase64 && isExtractableExt(eobExt)) {
      try {
        eobCbs = await extractEOBToCBS(eobFileBase64, eobExt, 'eob_guest')
        // Pin the bill and EOB to a shared episode so the normalizer compares
        // them, even when neither carries a matching claim number / service date.
        const sharedEpisode =
          billCbs.serviceEpisodeId || eobCbs.serviceEpisodeId || billCbs.claimNumber || 'episode_guest'
        billCbs.serviceEpisodeId = sharedEpisode
        eobCbs.serviceEpisodeId = sharedEpisode
        if (!eobCbs.dateOfService) eobCbs.dateOfService = billCbs.dateOfService
      } catch (eobErr) {
        // EOB unreadable — degrade gracefully to a bill-only audit.
        console.error('Guest EOB extraction error:', eobErr)
        eobCbs = null
      }
    }

    const normalizedCbs = normalizeCBSSet(eobCbs ? [billCbs, eobCbs] : [billCbs])

    return NextResponse.json({
      success: true,
      provider,
      lineItems,
      errors,
      errorCount: errors.length,
      totalBilled,
      potentialSavings,
      lowConfidence,
      hasEob: !!eobCbs,
      crossDocumentDiscrepancies: normalizedCbs.crossDocumentDiscrepancies,
      timeline: normalizedCbs.timeline,
      normalizedCbs,
    })
  } catch (error) {
    console.error('Guest audit error:', error)
    return NextResponse.json({ error: 'Audit failed. Please try again.' }, { status: 500 })
  }
}
