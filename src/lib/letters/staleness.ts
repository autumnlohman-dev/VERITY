import type { SupabaseClient } from '@supabase/supabase-js'
import { AUDIT_LOGIC_VERSION, auditVersionOf } from '@/lib/audit/version'

// ─── Letter staleness ─────────────────────────────────────────────────────────
// A dispute letter is written from a snapshot of the case's audit results.
// Recompute / re-run can change findings and totals afterwards — the stored
// letter then silently disagrees with the case page, and a user could mail
// outdated numbers. Every letter is stamped at generation with the audit
// logic version and a fingerprint of the snapshot it was written from; writers
// that change results mark mismatched letters stale, and readers ALSO derive
// staleness (belt and braces — a legacy letter with no fingerprint can't be
// verified and is treated as stale). Stale letters stay viewable but are
// refused for download / print / mail until regenerated.
//
// Pure and client-safe except markLettersStaleIfChanged (takes a Supabase
// client; type-only import keeps the module clean for the browser bundle).

export interface AuditSnapshotSource {
  amount_billed?: number | null
  amount_expected?: number | null
  potential_savings?: number | null
  errors_found?: unknown[] | null
  bill_data?: Record<string, unknown> | null
}

export interface LetterStampFields {
  stale?: boolean | null
  audit_fingerprint?: string | null
  audit_logic_version?: number | null
}

const cents = (v: unknown): string => {
  const n = Number(v)
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : 'null'
}

// FNV-1a 32-bit — deterministic, dependency-free, runs in browser and Node.
// Not adversarial-resistant and doesn't need to be: the comparison is between
// our own writes.
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// Fingerprint of everything about the audit that a letter states: the logic
// version, the headline totals, each finding's identity and dollars, and each
// cross-document discrepancy. Order-insensitive (rows sorted canonically) so
// an equivalent persist never reads as a change.
export function auditSnapshotFingerprint(src: AuditSnapshotSource): string {
  const bd = (src.bill_data ?? {}) as Record<string, unknown>

  const errorRows = (Array.isArray(src.errors_found) ? src.errors_found : [])
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>
      return [
        String(o.cpt_code ?? ''),
        String(o.error_type ?? ''),
        cents(o.billed_amount),
        cents(o.expected_amount),
        o.justification_only === true ? 'j' : '-',
      ].join('~')
    })
    .sort()

  const crossDocs = (bd.normalizedCbs as { crossDocumentDiscrepancies?: unknown[] } | undefined)
    ?.crossDocumentDiscrepancies
  const crossRows = (Array.isArray(crossDocs) ? crossDocs : [])
    .map((d) => {
      const o = (d ?? {}) as Record<string, unknown>
      return [String(o.type ?? ''), String(o.severity ?? ''), cents(o.estimatedDollarImpact)].join('~')
    })
    .sort()

  const canonical = [
    `v:${auditVersionOf(bd)}`,
    `billed:${cents(src.amount_billed)}`,
    `expected:${cents(src.amount_expected)}`,
    `savings:${cents(src.potential_savings)}`,
    `billPr:${cents(bd.billPatientResponsibility)}`,
    `eobPr:${cents(bd.eobPatientResponsibility)}`,
    `errors:${errorRows.join('|')}`,
    `cross:${crossRows.join('|')}`,
  ].join(';')

  return `${fnv1a(canonical)}-${canonical.length.toString(16)}`
}

// A letter is stale when it was flagged by a writer, predates stamping (no
// fingerprint to verify against), was generated under an older logic version,
// or its snapshot no longer matches the case's current results.
export function isLetterStale(
  letter: LetterStampFields | null | undefined,
  currentFingerprint: string,
  currentVersion: number = AUDIT_LOGIC_VERSION
): boolean {
  if (!letter) return false
  if (letter.stale === true) return true
  if (!letter.audit_fingerprint) return true
  if (Number(letter.audit_logic_version) !== currentVersion) return true
  return letter.audit_fingerprint !== currentFingerprint
}

// Server-side marker, called by every writer that persists changed audit
// results (recompute, extract re-run, dedup migration). Marks — never deletes
// — letters whose snapshot no longer matches; letters already matching the new
// fingerprint are left alone, so re-persisting identical results is a no-op.
export async function markLettersStaleIfChanged(
  supabase: SupabaseClient,
  caseId: string,
  currentFingerprint: string
): Promise<void> {
  const { error } = await supabase
    .from('dispute_letters')
    .update({ stale: true })
    .eq('case_id', caseId)
    .eq('stale', false)
    .or(`audit_fingerprint.is.null,audit_fingerprint.neq.${currentFingerprint}`)
  if (error) {
    // Non-fatal for the audit write, but a stale letter passing as fresh is
    // the failure this system exists to prevent — log loudly. Readers still
    // derive staleness from the fingerprint, so the banner/refusal holds.
    console.error(`markLettersStaleIfChanged[${caseId}]: FAILED:`, error)
  }
}
