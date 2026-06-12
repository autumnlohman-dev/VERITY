import { createClient } from '@/lib/supabase/server'
import { extractFromBase64, isSupportedExt } from '@/lib/extraction'
import { type InsuranceType } from '@/lib/errorDetection'
import { runFullAudit } from '@/lib/audit/runFullAudit'
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
// Reads the (public-readable) rules tables only; writes nothing. Shares the
// single runFullAudit pipeline with the signed-in + claim paths, so the numbers
// a guest sees are exactly the numbers they get once the case is saved.
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

    // Anon client can read the public rules tables.
    const supabase = await createClient()
    const eobExt = String(eobFileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    const result = await runFullAudit({
      lineItems,
      insuranceType: mapInsuranceType(insuranceType),
      provider,
      dateOfService,
      lowConfidence,
      docIdBase: 'guest',
      eob: typeof eobFileBase64 === 'string' && eobFileBase64 ? { base64: eobFileBase64, ext: eobExt } : null,
      supabase,
    })

    return NextResponse.json({
      success: true,
      provider: result.provider,
      lineItems: result.lineItems,
      errors: result.errors,
      errorCount: result.errorCount,
      needsReviewCount: result.needsReviewCount,
      totalBilled: result.totalBilled,
      potentialSavings: result.potentialSavings,
      lowConfidence: result.lowConfidence,
      hasEob: result.hasEob,
      crossDocumentDiscrepancies: result.normalizedCbs.crossDocumentDiscrepancies,
      timeline: result.normalizedCbs.timeline,
      normalizedCbs: result.normalizedCbs,
    })
  } catch (error) {
    console.error('Guest audit error:', error)
    return NextResponse.json({ error: 'Audit failed. Please try again.' }, { status: 500 })
  }
}
