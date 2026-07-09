// ─── Audit logic versioning ───────────────────────────────────────────────────
// Persisted audit results (errors_found, normalizedCbs, savings) are a CACHE of
// logic that changes. Without a version stamp, results computed under old logic
// replay forever as if current — the cross-document overhaul made every
// pre-existing case's stored findings wrong, and they rendered as current.
//
// BUMP AUDIT_LOGIC_VERSION whenever normalizer / errorDetection / runFullAudit
// logic changes meaning. Writers stamp bill_data.auditLogicVersion; readers
// classify rows and either recompute the deterministic layers, or (when vision
// re-extraction would be needed) surface a staleness banner + re-run.
//
// Version history:
//   1 (implicit — no stamp): everything before stamping existed, including all
//     rows persisted under the pre-overhaul per-line gross-charge comparison.
//   2: cross-document honesty overhaul (patient_responsibility_mismatch,
//     adjudication-aware CMS suppression, per-line dedup, savings cap).
//   3: plain-language finding text (em/en dashes removed from all generated
//     descriptions, placeholder timeline events suppressed, thousands
//     separators in timeline amounts). Numbers unchanged; the bump exists so
//     pre-sweep persisted strings regenerate clean through recompute-on-view.
//
// Dependency-free on purpose: imported by client pages, API routes, and tests.

export const AUDIT_LOGIC_VERSION = 3

/** The version a stored bill_data was computed under (1 = pre-stamp legacy). */
export function auditVersionOf(billData: Record<string, unknown> | null | undefined): number {
  const v = Number((billData ?? {}).auditLogicVersion)
  return Number.isFinite(v) && v >= 1 ? v : 1
}

export type AuditFreshness = 'current' | 'recomputable' | 'rerun_required'

// Can a stale row be brought current WITHOUT re-running vision extraction?
// Yes when the vision outputs are persisted independently of the computed
// findings: bill line items in bill_data.lineItems, and (when an EOB was read)
// the EOB's CBS document inside bill_data.normalizedCbs.documents.
export function classifyAuditFreshness(
  billData: Record<string, unknown> | null | undefined,
  currentVersion: number = AUDIT_LOGIC_VERSION
): AuditFreshness {
  if (auditVersionOf(billData) >= currentVersion) return 'current'
  const bd = (billData ?? {}) as Record<string, unknown>
  const lineItems = bd.lineItems
  if (Array.isArray(lineItems) && lineItems.length > 0) return 'recomputable'
  return 'rerun_required'
}

export type StaleBannerKind =
  // Recompute ran, but the primary bill-vs-EOB total check needs data only a
  // vision re-read can supply (the bill's stated patient responsibility was
  // never extracted). The results shown must never imply the full current
  // analysis ran.
  | 'rerun_for_full_analysis'
  // Stored results are stale and could not be recomputed (or recompute failed)
  // — rendered as-is behind an explicit staleness banner.
  | 'stale_rerun'

export interface StaleBanner {
  kind: StaleBannerKind
  message: string
}

// The banner (if any) to show AFTER the read-path has done what it can.
// `recomputeSucceeded` is null when no recompute was attempted (row was
// already current, or classified rerun_required), false when a recompute was
// attempted and failed — stored results render either way, never a blank page.
export function staleBannerFor(
  billData: Record<string, unknown> | null | undefined,
  recomputeSucceeded: boolean | null,
  currentVersion: number = AUDIT_LOGIC_VERSION
): StaleBanner | null {
  const bd = (billData ?? {}) as Record<string, unknown>

  if (recomputeSucceeded === true) {
    // Freshly recomputed — but recompute-only results on a case with an EOB
    // and no bill patient-responsibility total (never vision-extracted on
    // legacy rows) are NOT the full current analysis; say so explicitly
    // rather than implying the newest bill-vs-EOB total check ran.
    const billPr = bd.billPatientResponsibility
    const missingPrimaryCheck =
      bd.hasEob === true && (billPr === null || billPr === undefined)
    if (missingPrimaryCheck) {
      return {
        kind: 'rerun_for_full_analysis',
        message:
          "We've updated this audit with our latest logic. One newer check, comparing your bill's total against your EOB, requires re-reading your documents. Re-run audit to include it.",
      }
    }
    return null
  }

  // No recompute happened: an originally-current row gets no banner.
  if (auditVersionOf(billData) >= currentVersion) return null

  // Stale and not brought current (recompute failed or impossible).
  return {
    kind: 'stale_rerun',
    message:
      'This audit was run under an older version of our analysis. Re-run audit to get current results.',
  }
}
