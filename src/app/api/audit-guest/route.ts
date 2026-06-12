import { createClient } from '@/lib/supabase/server'
import { extractFromBase64, isSupportedExt } from '@/lib/extraction'
import { type InsuranceType } from '@/lib/errorDetection'
import { runFullAudit } from '@/lib/audit/runFullAudit'
import { MAX_FILE_BYTES } from '@/lib/billExtractor'
import { checkRateLimit, clientIp, decodedBase64Bytes } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Public route → throttle per source IP: 15 audits / 10 minutes.
const GUEST_RATE_LIMIT = 15
const GUEST_RATE_WINDOW_SECONDS = 600

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

    // Reject oversized payloads BEFORE spending an Anthropic vision call on them.
    if (
      decodedBase64Bytes(fileBase64) > MAX_FILE_BYTES ||
      (typeof eobFileBase64 === 'string' && decodedBase64Bytes(eobFileBase64) > MAX_FILE_BYTES)
    ) {
      return NextResponse.json(
        { error: 'That file is too large (20 MB max). Upload a smaller PDF or photo.' },
        { status: 413 }
      )
    }

    // Per-IP throttle so the free, unauthenticated audit can't be used to run up
    // an unbounded Anthropic bill.
    const rl = await checkRateLimit({
      bucket: `audit-guest:${clientIp(request)}`,
      limit: GUEST_RATE_LIMIT,
      windowSeconds: GUEST_RATE_WINDOW_SECONDS,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many audits from your network right now. Please wait a few minutes and try again.' },
        { status: 429 }
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
