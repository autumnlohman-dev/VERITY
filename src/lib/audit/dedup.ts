import type { SupabaseClient } from '@supabase/supabase-js'
import type { FullAuditResult } from './deterministicCore'
import { AUDIT_LOGIC_VERSION } from './version'
import { auditSnapshotFingerprint, markLettersStaleIfChanged } from '../letters/staleness'

// ─── Bill-level deduplication ─────────────────────────────────────────────────
// A single physical bill is identified by (provider + date of service + amount
// billed). Re-auditing the same bill — whether by re-uploading signed in or by
// importing a guest claim — must not spawn a second case row (which would double
// the dashboard's "potential savings"). Callers look up an existing match and
// point the user at it instead of inserting a duplicate.

export interface DedupKey {
  userId: string
  providerName: string | null
  dateOfService: string
  amountBilled: number
  /** Exclude this case id from the match (e.g. the shell row just created). */
  excludeCaseId?: string
}

function normProvider(p: string | null | undefined): string {
  return String(p ?? '').trim().toLowerCase()
}

function sameAmount(a: number, b: number): boolean {
  // Compare to the cent; OCR/rounding noise below a cent shouldn't split a bill.
  return Math.round(Number(a || 0) * 100) === Math.round(Number(b || 0) * 100)
}

// Returns the existing matching case ({ id }) or null. Only matches rows that
// have actually been audited (a real provider + date of service), so an empty
// "auditing" shell never counts as a duplicate of itself or anything else.
export async function findDuplicateCase(
  supabase: SupabaseClient,
  key: DedupKey
): Promise<{ id: string } | null> {
  const provider = normProvider(key.providerName)
  const dos = String(key.dateOfService ?? '').trim()
  // Without a provider AND a date of service we can't confidently call it the
  // same bill — skip dedup rather than risk collapsing distinct cases.
  if (!provider || !dos) return null

  const { data, error } = await supabase
    .from('cases')
    .select('id, provider_name, amount_billed, bill_data, created_at')
    .eq('user_id', key.userId)
    .order('created_at', { ascending: true })

  if (error || !Array.isArray(data)) return null

  for (const row of data) {
    if (key.excludeCaseId && row.id === key.excludeCaseId) continue
    if (normProvider(row.provider_name) !== provider) continue
    const rowDos = String(
      (row.bill_data as Record<string, unknown> | null)?.date_of_service ?? ''
    ).trim()
    if (rowDos !== dos) continue
    if (!sameAmount(Number(row.amount_billed ?? 0), key.amountBilled)) continue
    return { id: row.id as string }
  }
  return null
}

// ─── Absorbing a duplicate upload into the surviving case ────────────────────
// When a fresh upload dedups against an existing case, the shell case created
// for the upload is deleted and the user is pointed at the survivor. Before
// ac3506a-era fixes, that delete silently discarded a newly uploaded EOB: the
// fresh cross-document audit died with the shell and the survivor stayed
// bill-only forever. This helper owns the order of operations:
//
//   1. If the fresh audit carries EOB signal (a successful read OR a failed
//      attempt the user should be told about) and the survivor has none,
//      migrate the fresh results AND the EOB document references onto the
//      survivor, then mark the survivor's letters stale.
//   2. Delete the shell ONLY after a successful (or unnecessary) migration.
//      A failed migration returns 'migration_failed' with the shell intact so
//      the caller can persist the fresh audit onto it and surface the error —
//      the EOB is never silently dropped.
//
// Never downgrades: a surviving EOB-validated audit is not overwritten by a
// bill-only re-upload.

export interface AbsorbDuplicateParams {
  userId: string
  /** The freshly created shell case this upload made (deleted on success). */
  shellCaseId: string
  /** The pre-existing case that already holds this physical bill. */
  survivorCaseId: string
  /** The fresh audit result (bill + any EOB, already cross-compared). */
  result: FullAuditResult
  /** Storage references for the freshly uploaded EOB document, so the
   *  survivor can re-extract it on future recomputes. */
  eobPageRefs: string[]
  eobMergedPath: string | null
}

export type AbsorbDuplicateOutcome =
  | { outcome: 'absorbed'; migratedEob: boolean }
  | { outcome: 'migration_failed'; message: string }

export async function absorbDuplicateUpload(
  supabase: SupabaseClient,
  params: AbsorbDuplicateParams
): Promise<AbsorbDuplicateOutcome> {
  const { userId, shellCaseId, survivorCaseId, result, eobPageRefs, eobMergedPath } = params

  const { data: survivorRow } = await supabase
    .from('cases')
    .select('bill_data, provider_name')
    .eq('id', survivorCaseId)
    .eq('user_id', userId)
    .single()
  const survivorBillData =
    survivorRow?.bill_data && typeof survivorRow.bill_data === 'object' && !Array.isArray(survivorRow.bill_data)
      ? (survivorRow.bill_data as Record<string, unknown>)
      : {}
  const survivorHasEob = survivorBillData.hasEob === true

  let migratedEob = false
  if ((result.hasEob || result.eobError) && !survivorHasEob) {
    const migratedBillData = {
      ...survivorBillData,
      lineItems: result.lineItems,
      normalizedCbs: result.normalizedCbs,
      date_of_service: result.dateOfService || survivorBillData.date_of_service || '',
      hasEob: result.hasEob,
      eobError: result.eobError,
      lowConfidence: result.lowConfidence,
      billPatientResponsibility: result.billPatientResponsibility,
      eobPatientResponsibility: result.eobPatientResponsibility,
      suspectedPartialRead: result.suspectedPartialRead,
      auditLogicVersion: AUDIT_LOGIC_VERSION,
      // The EOB document itself moves with its data: without these storage
      // references the survivor could never re-extract the EOB on a future
      // recompute, only replay this parse.
      ...(eobPageRefs.length > 0 ? { eobPages: eobPageRefs } : {}),
      ...(eobMergedPath ? { eobMergedPath } : {}),
    }
    const { error: migrateErr } = await supabase
      .from('cases')
      .update({
        status: result.errorCount > 0 ? 'error_found' : 'no_errors',
        provider_name: result.provider ?? survivorRow?.provider_name ?? null,
        amount_billed: result.totalBilled,
        amount_expected: result.totalExpected,
        potential_savings: result.potentialSavings,
        errors_found: result.errors,
        bill_data: migratedBillData,
      })
      .eq('id', survivorCaseId)
      .eq('user_id', userId)
    if (migrateErr) {
      console.error(
        `absorbDuplicateUpload[${shellCaseId}]: dedup EOB migration onto surviving case ${survivorCaseId} FAILED (shell case KEPT):`,
        migrateErr
      )
      return {
        outcome: 'migration_failed',
        message: `EOB migration onto surviving case ${survivorCaseId} failed: ${migrateErr.message}`,
      }
    }
    migratedEob = true
    console.info(
      `absorbDuplicateUpload[${shellCaseId}]: dedup migrated fresh audit onto surviving case ${survivorCaseId} ` +
        `(hasEob=${result.hasEob}, eobError=${result.eobError}, eobPages=${eobPageRefs.length}, discrepancies now recomputed)`
    )
    // The survivor's findings just changed — any letter written from its
    // previous results is now out of sync. Mark, never delete.
    await markLettersStaleIfChanged(
      supabase,
      survivorCaseId,
      auditSnapshotFingerprint({
        amount_billed: result.totalBilled,
        amount_expected: result.totalExpected,
        potential_savings: result.potentialSavings,
        errors_found: result.errors,
        bill_data: migratedBillData,
      })
    )
  }

  // Remove the empty shell this upload just created so it doesn't linger.
  // Reached only when migration succeeded or wasn't needed.
  const { error: deleteErr } = await supabase
    .from('cases')
    .delete()
    .eq('id', shellCaseId)
    .eq('user_id', userId)
  if (deleteErr) {
    // The survivor is authoritative either way; a lingering shell is visible
    // in the dashboard, not silent data loss — log and continue.
    console.error(
      `absorbDuplicateUpload[${shellCaseId}]: shell delete failed after successful dedup:`,
      deleteErr
    )
  }
  return { outcome: 'absorbed', migratedEob }
}
