import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractFromBase64, isSupportedExt } from '@/lib/extraction'
import { isHeicBuffer } from '@/lib/heic'
import { runFullAudit } from '@/lib/audit/runFullAudit'
import { findDuplicateCase } from '@/lib/audit/dedup'
import { normalizeInsuranceType } from '@/lib/insuranceMapping'
import { MAX_FILE_BYTES } from '@/lib/billExtractor'
import { downloadBillBase64, pathHasPrefix } from '@/lib/storage/bills'
import { checkRateLimit, decodedBase64Bytes } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Insured cases run two sequential vision extractions (bill + EOB) plus
// cross-document normalization, which can exceed Vercel's 60s default.
export const maxDuration = 300

// Signed-in route → throttle per user: 30 audits / 10 minutes.
const EXTRACT_RATE_LIMIT = 30
const EXTRACT_RATE_WINDOW_SECONDS = 600

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

    const { caseId, billPath, billFileBase64, billFileName, eobPath, eobFileBase64, eobFileName } =
      await request.json()

    if (typeof caseId !== 'string' || !caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }
    // Extension is only a hint here — an iPhone HEIC can arrive with no
    // extension or an image/heic mimetype. We resolve the real type from the
    // file's magic bytes after download (below) before rejecting anything.
    let ext = String(billFileName ?? '').split('.').pop()?.toLowerCase() ?? ''

    // The bill (and EOB) arrive either as a scoped storage path — the primary
    // path, so large files never touch this request body — or as inline base64
    // for small/legacy callers. Any storage path must sit under this user's own
    // folder so one user can't read another's upload via a forged path.
    for (const p of [billPath, eobPath]) {
      if (typeof p === 'string' && p && !pathHasPrefix(p, user.id)) {
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
          : typeof billFileBase64 === 'string'
          ? billFileBase64
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

    // Resolve the true type from content: a HEIC with no/odd extension is still
    // a HEIC (the extraction boundary transcodes it to JPEG). Reject only what is
    // genuinely unsupported, now that we've seen the bytes.
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

    const existingBillData =
      caseRow.bill_data && typeof caseRow.bill_data === 'object' && !Array.isArray(caseRow.bill_data)
        ? (caseRow.bill_data as Record<string, unknown>)
        : {}

    const insuranceType = normalizeInsuranceType(caseRow.insurance_type ?? existingBillData.insuranceType)
    // Derive the EOB extension from the filename, falling back to the storage
    // path (which embeds the original filename) so a missing eobFileName doesn't
    // silently drop a perfectly readable EOB.
    const eobExt =
      (String(eobFileName ?? '').split('.').pop()?.toLowerCase() ?? '') ||
      (typeof eobPath === 'string' ? eobPath.split('.').pop()?.toLowerCase() ?? '' : '')
    console.info(
      `extract[${caseId}]: EOB inputs — eobPath:${!!eobPath} eobBase64:${!!eobFileBase64} resolved:${!!resolvedEobBase64} ext:"${eobExt}"`
    )

    const result = await runFullAudit({
      lineItems,
      insuranceType,
      provider,
      dateOfService,
      lowConfidence,
      docIdBase: caseId,
      accountNumber: caseId,
      eob: resolvedEobBase64 ? { base64: resolvedEobBase64, ext: eobExt } : null,
      // The patient's note (collected at case creation) drives patient-dispute
      // flagging — ported here from the now-removed /api/audit route.
      userNotes: typeof existingBillData.userNotes === 'string' ? existingBillData.userNotes : undefined,
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
      // MIGRATE BEFORE DELETE — this branch used to delete the shell and return the
      // surviving case id without carrying anything over — which silently discarded
      // the EOB on every re-upload: the fresh cross-document audit (bill+EOB) died
      // with the shell, and the surviving case stayed bill-only forever. When the
      // fresh audit carries EOB signal (a successful read OR a failed attempt the
      // user should be told about) and the surviving case has none, write the fresh
      // results onto the surviving case. Never downgrade: a surviving EOB-validated
      // audit is not overwritten by a bill-only re-upload.
      const { data: survivorRow } = await supabase
        .from('cases')
        .select('bill_data, provider_name')
        .eq('id', duplicate.id)
        .eq('user_id', user.id)
        .single()
      const survivorBillData =
        survivorRow?.bill_data && typeof survivorRow.bill_data === 'object' && !Array.isArray(survivorRow.bill_data)
          ? (survivorRow.bill_data as Record<string, unknown>)
          : {}
      const survivorHasEob = survivorBillData.hasEob === true

      if ((result.hasEob || result.eobError) && !survivorHasEob) {
        const { error: migrateErr } = await supabase
          .from('cases')
          .update({
            status: result.errorCount > 0 ? 'error_found' : 'no_errors',
            provider_name: result.provider ?? survivorRow?.provider_name ?? null,
            amount_billed: result.totalBilled,
            amount_expected: result.totalExpected,
            potential_savings: result.potentialSavings,
            errors_found: result.errors,
            bill_data: {
              ...survivorBillData,
              lineItems: result.lineItems,
              normalizedCbs: result.normalizedCbs,
              date_of_service: result.dateOfService || survivorBillData.date_of_service || '',
              hasEob: result.hasEob,
              eobError: result.eobError,
              lowConfidence: result.lowConfidence,
            },
          })
          .eq('id', duplicate.id)
          .eq('user_id', user.id)
        if (migrateErr) {
          // Don't fail the request — the user still lands on the surviving case —
          // but make the dropped migration loud instead of silent.
          console.error(
            `extract[${caseId}]: dedup EOB migration onto surviving case ${duplicate.id} FAILED:`,
            migrateErr
          )
        } else {
          console.info(
            `extract[${caseId}]: dedup migrated fresh audit onto surviving case ${duplicate.id} ` +
              `(hasEob=${result.hasEob}, eobError=${result.eobError}, discrepancies now recomputed)`
          )
        }
      }

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
      eobError: result.eobError,
      lowConfidence: result.lowConfidence,
    }

    const { error: updateErr } = await supabase
      .from('cases')
      .update({
        status: result.errorCount > 0 ? 'error_found' : 'no_errors',
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
      errorCount: result.errorCount,
      totalBilled: result.totalBilled,
      potentialSavings: result.potentialSavings,
      lowConfidence: result.lowConfidence,
      hasEob: result.hasEob,
      eobError: result.eobError,
    })
  } catch (error) {
    console.error('Extract/audit error:', error)
    return NextResponse.json({ error: 'Audit failed. Please try again.' }, { status: 500 })
  }
}
