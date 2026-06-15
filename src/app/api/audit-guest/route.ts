import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractFromBase64, isSupportedExt } from '@/lib/extraction'
import { runFullAudit } from '@/lib/audit/runFullAudit'
import { normalizeInsuranceType } from '@/lib/insuranceMapping'
import { MAX_FILE_BYTES } from '@/lib/billExtractor'
import { downloadBillBase64, isUuid, pathHasPrefix } from '@/lib/storage/bills'
import { checkRateLimit, clientIp, decodedBase64Bytes } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Insured cases run two sequential vision extractions (bill + EOB) plus
// cross-document normalization, which can exceed Vercel's 60s default.
export const maxDuration = 300

// Public route → throttle per source IP: 15 audits / 10 minutes.
const GUEST_RATE_LIMIT = 15
const GUEST_RATE_WINDOW_SECONDS = 600

// Public, anonymous bill audit — no account, no stored case.
// Reads the (public-readable) rules tables only; writes nothing. Shares the
// single runFullAudit pipeline with the signed-in + claim paths, so the numbers
// a guest sees are exactly the numbers they get once the case is saved.
export async function POST(request: Request) {
  try {
    const { fileBase64, billPath, fileName, insuranceType, eobFileBase64, eobPath, eobFileName, guestSessionId } =
      await request.json()

    const ext = String(fileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    if (!isSupportedExt(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, JPG, PNG, WEBP, or HEIC.' },
        { status: 400 }
      )
    }

    // The bill (and EOB) arrive either as a scoped storage path — the primary
    // path, so large files never touch this request body — or as inline base64
    // for small/legacy callers. Any storage path must sit under this guest's own
    // session folder so one guest can't read another's upload via a forged path.
    const usingStorage = Boolean((typeof billPath === 'string' && billPath) || (typeof eobPath === 'string' && eobPath))
    if (usingStorage && !isUuid(guestSessionId)) {
      return NextResponse.json({ error: 'Missing session' }, { status: 400 })
    }
    for (const p of [billPath, eobPath]) {
      if (typeof p === 'string' && p && !pathHasPrefix(p, `guest/${guestSessionId}`)) {
        return NextResponse.json({ error: 'Invalid upload reference' }, { status: 400 })
      }
    }

    let billBase64: string
    let resolvedEobBase64: string | undefined
    try {
      const admin = createAdminClient()
      billBase64 =
        typeof billPath === 'string' && billPath
          ? await downloadBillBase64(admin, billPath)
          : typeof fileBase64 === 'string'
          ? fileBase64
          : ''
      resolvedEobBase64 =
        typeof eobPath === 'string' && eobPath
          ? await downloadBillBase64(admin, eobPath)
          : typeof eobFileBase64 === 'string' && eobFileBase64
          ? eobFileBase64
          : undefined
    } catch (e) {
      console.error('Bill download error:', e)
      return NextResponse.json(
        { error: 'We couldn’t read your uploaded file. Please try again.' },
        { status: 400 }
      )
    }

    if (!billBase64) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    // Reject oversized payloads BEFORE spending an Anthropic vision call on them.
    if (
      decodedBase64Bytes(billBase64) > MAX_FILE_BYTES ||
      (typeof resolvedEobBase64 === 'string' && decodedBase64Bytes(resolvedEobBase64) > MAX_FILE_BYTES)
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
    const { lineItems, provider, dateOfService, lowConfidence, sawContent } =
      await extractFromBase64(billBase64, ext)
    if (lineItems.length === 0) {
      // Distinguish a readable document with no charge lines from a file we
      // couldn't read at all.
      const error = sawContent
        ? "We could read this document, but couldn't find any itemized charge lines on it. Make sure you upload the itemized bill — the one that lists each service with its charge — not the billing summary, statement balance, or payment receipt."
        : "We couldn't read any billing details from this file. Try a clearer, well-lit photo (or a PDF) of your itemized bill."
      return NextResponse.json({ error }, { status: 422 })
    }

    // Anon client can read the public rules tables.
    const supabase = await createClient()
    // Derive the EOB extension from the filename, falling back to the storage
    // path (which embeds the original filename) so a missing eobFileName doesn't
    // silently drop a perfectly readable EOB.
    const eobExt =
      (String(eobFileName ?? '').split('.').pop()?.toLowerCase() ?? '') ||
      (typeof eobPath === 'string' ? eobPath.split('.').pop()?.toLowerCase() ?? '' : '')
    console.info(
      `audit-guest: EOB inputs — eobPath:${!!eobPath} eobBase64:${!!eobFileBase64} resolved:${!!resolvedEobBase64} ext:"${eobExt}"`
    )
    const result = await runFullAudit({
      lineItems,
      insuranceType: normalizeInsuranceType(insuranceType),
      provider,
      dateOfService,
      lowConfidence,
      docIdBase: 'guest',
      eob: resolvedEobBase64 ? { base64: resolvedEobBase64, ext: eobExt } : null,
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
      eobError: result.eobError,
      crossDocumentDiscrepancies: result.normalizedCbs.crossDocumentDiscrepancies,
      timeline: result.normalizedCbs.timeline,
      normalizedCbs: result.normalizedCbs,
    })
  } catch (error) {
    console.error('Guest audit error:', error)
    return NextResponse.json({ error: 'Audit failed. Please try again.' }, { status: 500 })
  }
}
