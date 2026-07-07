import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractFromBase64, isSupportedExt } from '@/lib/extraction'
import { isHeicBuffer } from '@/lib/heic'
import { runFullAudit } from '@/lib/audit/runFullAudit'
import { normalizeInsuranceType } from '@/lib/insuranceMapping'
import { MAX_FILE_BYTES } from '@/lib/billExtractor'
import { isUuid } from '@/lib/storage/bills'
import { MergeError } from '@/lib/documents/mergePages'
import { resolveSlot } from '@/lib/documents/resolveUpload'
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
    const {
      fileBase64, billPath, fileName, insuranceType,
      eobFileBase64, eobPath, eobFileName, guestSessionId,
      // Multi-file contract: ordered arrays — N files are N pages of ONE
      // document, merged server-side before extraction.
      billPaths, billFilesBase64, billFileNames,
      eobPaths, eobFilesBase64, eobFileNames,
    } = await request.json()

    // Any storage path must sit under this guest's own session folder so one
    // guest can't read another's upload via a forged path (enforced inside
    // resolveSlot against the guest prefix).
    const pathArrays = [billPaths, eobPaths].filter(Array.isArray).flat()
    const usingStorage = Boolean(
      (typeof billPath === 'string' && billPath) ||
      (typeof eobPath === 'string' && eobPath) ||
      pathArrays.length > 0
    )
    if (usingStorage && !isUuid(guestSessionId)) {
      return NextResponse.json({ error: 'Missing session' }, { status: 400 })
    }

    let bill: Awaited<ReturnType<typeof resolveSlot>>
    let eobSlot: Awaited<ReturnType<typeof resolveSlot>>
    try {
      const admin = createAdminClient()
      const prefix = `guest/${guestSessionId}`
      bill = await resolveSlot(admin, prefix, {
        paths: billPaths, base64s: billFilesBase64, names: billFileNames,
        path: billPath, base64: fileBase64, name: fileName,
      })
      eobSlot = await resolveSlot(admin, prefix, {
        paths: eobPaths, base64s: eobFilesBase64, names: eobFileNames,
        path: eobPath, base64: eobFileBase64, name: eobFileName,
      })
    } catch (e) {
      if (e instanceof MergeError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      console.error('Bill download error:', e instanceof Error ? `${e.name}: ${e.message}` : 'unknown')
      return NextResponse.json(
        { error: 'We couldn’t read your uploaded file. Please try again.' },
        { status: 400 }
      )
    }

    if (!bill.doc) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }
    const billBase64 = bill.doc.base64
    const resolvedEobBase64 = eobSlot.doc?.base64

    // Resolve the true type from content: a HEIC with no/odd extension is still
    // a HEIC (the extraction boundary transcodes it to JPEG). Reject only what is
    // genuinely unsupported, now that we've seen the bytes.
    let ext = bill.doc.ext
    if (!isSupportedExt(ext) && isHeicBuffer(Buffer.from(billBase64, 'base64'))) ext = 'heic'
    if (!isSupportedExt(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, JPG, PNG, WEBP, or HEIC.' },
        { status: 400 }
      )
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
    // resolveSlot already derived the EOB extension (filename → storage path →
    // 'pdf' for a merged multi-file document).
    const eobExt = eobSlot.doc?.ext ?? ''
    console.info(
      `audit-guest: EOB inputs — pages:${eobSlot.pageRefs.length} merged:${eobSlot.merged} resolved:${!!resolvedEobBase64} ext:"${eobExt}"`
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
