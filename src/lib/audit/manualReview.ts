// Findings the audit could not price (proprietary facility/revenue codes, OCR
// misreads, or the systemic reference-data notice) are NOT overcharges — they
// surface for manual review and are never summed into recoverable dollars.
//
// Lives in its own dependency-free module (rather than runFullAudit, its
// original home) because client-bundled code needs it too: letterPdf renders
// the Evidentiary Package in the browser, and runFullAudit's module graph is
// server-only (HEIC WASM transcoder, Anthropic SDK). runFullAudit re-exports
// it, so server imports are unchanged.
// 'coding_observation' rides the same exclusions: an NCCI/MUE pattern the
// payer's own adjudication already accepted is informational (shown in the
// audit UI, pending expert policy review) — never a letter finding and never
// a recoverable dollar.
export const MANUAL_REVIEW_ERROR_TYPES = new Set<string>([
  'rate_unavailable',
  'reference_data_missing',
  'coding_observation',
])
