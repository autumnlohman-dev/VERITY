import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractFromBase64, isSupportedExt } from '@/lib/extraction'
import { isHeicBuffer } from '@/lib/heic'
import { runFullAudit } from '@/lib/audit/runFullAudit'
import { findDuplicateCase, absorbDuplicateUpload } from '@/lib/audit/dedup'
import { normalizeInsuranceType } from '@/lib/insuranceMapping'
import { MAX_FILE_BYTES } from '@/lib/billExtractor'
import { BILLS_BUCKET } from '@/lib/storage/bills'
import { MergeError } from '@/lib/documents/mergePages'
import { resolveSlot } from '@/lib/documents/resolveUpload'
import { checkRateLimit, decodedBase64Bytes } from '@/lib/rateLimit'
import { AUDIT_LOGIC_VERSION } from '@/lib/audit/version'
import { auditSnapshotFingerprint, markLettersStaleIfChanged } from '@/lib/letters/staleness'
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

    const {
      caseId,
      billPath, billFileBase64, billFileName,
      eobPath, eobFileBase64, eobFileName,
      // Multi-file contract: ordered arrays — N files are N pages of ONE
      // document, merged server-side before extraction.
      billPaths, billFilesBase64, billFileNames,
      eobPaths, eobFilesBase64, eobFileNames,
      // True when re-running an EXISTING case (stale-version refresh or the
      // stranded-audit retry). A re-run must never trip bill-level dedup: the
      // dedup branch deletes the "new" case, and here the "new" case is the
      // original — deleting it would destroy the case's outcome history.
      rerun,
    } = await request.json()

    if (typeof caseId !== 'string' || !caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }

    // Resolve each slot (multi-file arrays or legacy single fields) into the
    // ONE document the pipeline sees. Storage paths must sit under this user's
    // own folder — enforced inside resolveSlot — so one user can't read
    // another's upload via a forged path. Multi-file uploads merge to one PDF.
    const admin = createAdminClient()
    let bill: Awaited<ReturnType<typeof resolveSlot>>
    let eobSlot: Awaited<ReturnType<typeof resolveSlot>>
    try {
      bill = await resolveSlot(admin, user.id, {
        paths: billPaths, base64s: billFilesBase64, names: billFileNames,
        path: billPath, base64: billFileBase64, name: billFileName,
      })
      eobSlot = await resolveSlot(admin, user.id, {
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

    // Persist the merged artifact alongside the originals: the case record
    // keeps one bill/EOB document plus references to its page files.
    let billMergedPath: string | null = null
    let eobMergedPath: string | null = null
    for (const [slot, resolved] of [['bill', bill], ['eob', eobSlot]] as const) {
      if (!resolved.merged || !resolved.doc) continue
      const path = `${user.id}/${Date.now()}-${slot}-merged.pdf`
      const { error: upErr } = await admin.storage
        .from(BILLS_BUCKET)
        .upload(path, Buffer.from(resolved.doc.base64, 'base64'), { contentType: 'application/pdf' })
      if (upErr) {
        // Non-fatal: the audit still runs from memory; only the stored artifact is missing.
        console.error(`extract[${caseId}]: merged ${slot} artifact upload failed: ${upErr.message}`)
      } else if (slot === 'bill') billMergedPath = path
      else eobMergedPath = path
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
    const { lineItems, provider, dateOfService, lowConfidence, sawContent, statedTotalBilled, patientResponsibility } =
      await extractFromBase64(billBase64, ext)
    if (lineItems.length === 0) {
      // Distinguish a readable document with no charge lines from a file we
      // couldn't read at all.
      const error = sawContent
        ? "We could read this document, but couldn't find any itemized charge lines on it. Make sure you upload the itemized bill, the one that lists each service with its charge, not the billing summary, statement balance, or payment receipt."
        : "We couldn't read any billing details from this file. Try a clearer, well-lit photo (or a PDF) of your itemized bill."
      return NextResponse.json({ error }, { status: 422 })
    }

    const existingBillData =
      caseRow.bill_data && typeof caseRow.bill_data === 'object' && !Array.isArray(caseRow.bill_data)
        ? (caseRow.bill_data as Record<string, unknown>)
        : {}

    const insuranceType = normalizeInsuranceType(caseRow.insurance_type ?? existingBillData.insuranceType)
    // resolveSlot already derived the EOB extension (filename → storage path →
    // 'pdf' for a merged multi-file document).
    const eobExt = eobSlot.doc?.ext ?? ''
    console.info(
      `extract[${caseId}]: EOB inputs, pages:${eobSlot.pageRefs.length} merged:${eobSlot.merged} resolved:${!!resolvedEobBase64} ext:"${eobExt}"`
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
      billTotals: { statedTotalBilled, patientResponsibility },
      // The patient's note (collected at case creation) drives patient-dispute
      // flagging — ported here from the now-removed /api/audit route.
      userNotes: typeof existingBillData.userNotes === 'string' ? existingBillData.userNotes : undefined,
      supabase,
    })

    // ── Bill-level dedup ─────────────────────────────────────────────────────
    // The same physical bill (same provider + date of service + amount billed)
    // should live in the dashboard exactly once. If a populated case already
    // matches, discard this freshly-created shell and point the user at it.
    // SKIPPED on re-runs: the case being refreshed is not a fresh shell, and
    // the delete branch below would destroy it (documents, outcome history).
    const duplicate = rerun === true ? null : await findDuplicateCase(supabase, {
      userId: user.id,
      excludeCaseId: caseId,
      providerName: result.provider ?? caseRow.provider_name ?? null,
      dateOfService: result.dateOfService,
      amountBilled: result.totalBilled,
    })
    // Tracks a failed dedup migration: the shell is then KEPT and persisted below
    // with the full fresh audit (EOB references included) so the EOB is never
    // silently dropped, and the failure is surfaced after persisting.
    let dedupMigrationFailed = false
    if (duplicate) {
      // MIGRATE BEFORE DELETE — absorbDuplicateUpload migrates the fresh audit
      // (results + EOB document references) onto the surviving case when the
      // fresh upload carries EOB signal the survivor lacks, and deletes the
      // shell ONLY on success. Never downgrades a surviving EOB-validated audit.
      const absorb = await absorbDuplicateUpload(supabase, {
        userId: user.id,
        shellCaseId: caseId,
        survivorCaseId: duplicate.id,
        result,
        eobPageRefs: eobSlot.pageRefs,
        eobMergedPath,
      })
      if (absorb.outcome === 'absorbed') {
        return NextResponse.json({ duplicate: true, caseId: duplicate.id })
      }
      dedupMigrationFailed = true
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
      // The bill's stated bottom line, the EOB's adjudicated obligation, and
      // the partial-read flag — the case page's honest-numbers inputs.
      billPatientResponsibility: result.billPatientResponsibility,
      eobPatientResponsibility: result.eobPatientResponsibility,
      suspectedPartialRead: result.suspectedPartialRead,
      // Version stamp: readers compare against AUDIT_LOGIC_VERSION and
      // recompute/re-run when the logic has moved since this was computed.
      auditLogicVersion: AUDIT_LOGIC_VERSION,
      // One bill/EOB record with page references: the original page files (in
      // merge order) plus the merged artifact when the upload was multi-file.
      ...(bill.pageRefs.length > 0 ? { billPages: bill.pageRefs } : {}),
      ...(billMergedPath ? { billMergedPath } : {}),
      ...(eobSlot.pageRefs.length > 0 ? { eobPages: eobSlot.pageRefs } : {}),
      ...(eobMergedPath ? { eobMergedPath } : {}),
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

    // A re-run (or any persist that changed the findings) invalidates letters
    // written from the previous snapshot — mark them stale, never delete.
    await markLettersStaleIfChanged(
      supabase,
      caseId,
      auditSnapshotFingerprint({
        amount_billed: result.totalBilled,
        amount_expected: result.totalExpected,
        potential_savings: result.potentialSavings,
        errors_found: result.errors,
        bill_data: updatedBillData,
      })
    )

    if (dedupMigrationFailed) {
      // The fresh audit (EOB included) is safely persisted on this case; the
      // failure to merge it into the pre-existing duplicate is surfaced, not
      // swallowed. The user keeps both cases until they resolve it.
      return NextResponse.json(
        {
          error:
            'This bill matches a case already in your dashboard, but we couldn’t merge the new upload into it. Your upload was saved as a separate case with your EOB attached.',
          caseId,
        },
        { status: 500 }
      )
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
      suspectedPartialRead: result.suspectedPartialRead,
    })
  } catch (error) {
    console.error('Extract/audit error:', error)
    return NextResponse.json({ error: 'Audit failed. Please try again.' }, { status: 500 })
  }
}
