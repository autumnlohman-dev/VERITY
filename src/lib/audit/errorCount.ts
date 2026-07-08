import { MANUAL_REVIEW_ERROR_TYPES } from './manualReview'

// ─── The one user-facing error count ──────────────────────────────────────────
// The dashboard and the case page must agree on "N errors" for the same data.
// The rules (identical to the case page's headline):
//   - audit errors count ONLY when disputable: manual-review flags
//     (rate_unavailable, reference_data_missing) and informational coding
//     observations are review aids, never errors.
//   - cross-document findings count ONLY when significant: dollar-backed or
//     high/critical severity. Low-confidence "couldn't match this line" notes
//     never count.
// Dependency-light and client-safe; both pages import from here so the counts
// cannot drift again.

interface CrossDocLike {
  estimatedDollarImpact?: unknown
  severity?: unknown
}

export function significantCrossDocCount(
  crossDocumentDiscrepancies: unknown[] | null | undefined
): number {
  return (crossDocumentDiscrepancies ?? []).filter((d) => {
    const o = (d ?? {}) as CrossDocLike
    return (
      Number(o.estimatedDollarImpact || 0) > 0 ||
      o.severity === 'critical' ||
      o.severity === 'high'
    )
  }).length
}

export function disputableErrorCount(errorsFound: unknown[] | null | undefined): number {
  return (errorsFound ?? []).filter(
    (e) => !MANUAL_REVIEW_ERROR_TYPES.has(String((e as { error_type?: unknown })?.error_type ?? ''))
  ).length
}

export function userFacingErrorCount(
  errorsFound: unknown[] | null | undefined,
  crossDocumentDiscrepancies: unknown[] | null | undefined
): number {
  return disputableErrorCount(errorsFound) + significantCrossDocCount(crossDocumentDiscrepancies)
}
