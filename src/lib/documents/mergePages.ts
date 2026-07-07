import { PDFDocument } from 'pdf-lib'
import { normalizeForExtraction } from '../heic'
import { MAX_PAGES_PER_DOC, MAX_TOTAL_DOC_BYTES, isMergeableExt } from './limits'

// Merges the N uploaded files of one bill/EOB (each file = one or more pages of
// the SAME physical document) into a single PDF, in the caller-supplied order.
// The pipeline and phiBoundary then see exactly one document per bill — one
// vision call, one raw-document payload — instead of N independent fragments.
//
// SERVER-ONLY: pulls in the HEIC transcoder (WASM) via lib/heic.
//
// Page handling:
//   pdf        → every page copied verbatim
//   jpg/png    → embedded as a full-bleed page at the image's own dimensions
//   heic/heif  → transcoded to JPEG first (same boundary as single-file uploads)
// Anything else throws — the multi-page contract is narrower than the legacy
// single-file path (no webp/gif), enforced here and in the upload UI.

export type DocumentPage = { base64: string; ext: string }

export class MergeError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function decodedBytes(base64: string): number {
  // 3/4 of the encoded length minus padding — close enough for a size cap.
  return Math.floor((base64.length * 3) / 4)
}

export function validatePageSet(pages: DocumentPage[]): void {
  if (pages.length > MAX_PAGES_PER_DOC) {
    throw new MergeError(`Too many files for one document (${MAX_PAGES_PER_DOC} max).`, 413)
  }
  let total = 0
  for (const p of pages) total += decodedBytes(p.base64)
  if (total > MAX_TOTAL_DOC_BYTES) {
    throw new MergeError('Those files together are too large (20 MB max per document).', 413)
  }
}

// Returns the document the extraction pipeline should see: a single file passes
// through untouched (byte-identical to the legacy single-file path), multiple
// files merge into one PDF in the given order.
export async function resolveDocument(pages: DocumentPage[]): Promise<DocumentPage> {
  if (pages.length === 0) throw new MergeError('Missing file')
  validatePageSet(pages)
  if (pages.length === 1) return pages[0]
  return { base64: await mergePagesToPdf(pages), ext: 'pdf' }
}

export async function mergePagesToPdf(pages: DocumentPage[]): Promise<string> {
  const merged = await PDFDocument.create()

  for (const page of pages) {
    const rawExt = page.ext.toLowerCase()
    if (!isMergeableExt(rawExt)) {
      throw new MergeError(
        `Unsupported page type ".${rawExt}" in a multi-file document. Use PDF, JPG, PNG, or HEIC.`
      )
    }
    // Same HEIC boundary as single-file extraction: HEIC/HEIF (by extension or
    // by content) becomes a JPEG buffer; everything else passes through.
    const { base64, ext } = await normalizeForExtraction(page.base64, rawExt)
    const bytes = Buffer.from(base64, 'base64')

    if (ext === 'pdf') {
      let src: PDFDocument
      try {
        src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      } catch {
        throw new MergeError('One of the PDF files could not be read. Re-export or re-scan it and try again.')
      }
      const copied = await merged.copyPages(src, src.getPageIndices())
      for (const p of copied) merged.addPage(p)
    } else {
      // jpg or png (post-HEIC-normalization there are no other image types).
      let image
      try {
        image = ext === 'png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes)
      } catch {
        throw new MergeError('One of the image files could not be read. Re-take the photo and try again.')
      }
      const p = merged.addPage([image.width, image.height])
      p.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
    }
  }

  const out = await merged.save()
  if (out.byteLength > MAX_TOTAL_DOC_BYTES) {
    throw new MergeError('The combined document is too large (20 MB max). Remove a page or use smaller files.', 413)
  }
  return Buffer.from(out).toString('base64')
}
