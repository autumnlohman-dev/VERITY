// Shared multi-page upload limits — imported by BOTH the browser upload UI and
// the server merge/extract routes, so keep this module dependency-free.
//
// A multi-file upload on one bill/EOB slot is N pages of ONE document. The
// per-file cap matches the single-file extraction cap; the batch caps bound the
// merged artifact so it stays under the same 20 MB ceiling the extraction
// pipeline already enforces (MAX_FILE_BYTES in billExtractor).

export const MAX_PAGES_PER_DOC = 10

// Total decoded bytes across all pages of one document. The merged PDF embeds
// images near-verbatim, so the sum of the originals is a faithful proxy for the
// merged artifact's size. Held at the pipeline's existing 20 MB single-file cap.
export const MAX_TOTAL_DOC_BYTES = 20 * 1024 * 1024

// Extensions accepted for a multi-page document. Narrower than the single-file
// path (no webp/gif): every page must be embeddable into the merged PDF —
// pdf-lib embeds JPG/PNG natively and HEIC is transcoded to JPEG first.
export const MERGEABLE_EXTS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif'])

export function isMergeableExt(ext: string): boolean {
  return MERGEABLE_EXTS.has(ext.toLowerCase())
}
