import type { SupabaseClient } from '@supabase/supabase-js'
import { downloadBillBase64, pathHasPrefix } from '../storage/bills'
import { isHeicBuffer } from '../heic'
import { resolveDocument, MergeError, type DocumentPage } from './mergePages'

// Shared by /api/extract and /api/audit-guest: turns one slot's upload input —
// legacy single path/base64 OR the ordered multi-file arrays — into the single
// document the extraction pipeline consumes, merging multi-file uploads into
// one PDF. Order of `paths`/`base64s` is the user's chosen page order.

export type SlotInput = {
  // Multi-file contract (ordered; a 1-element array degrades to single-file).
  paths?: unknown
  base64s?: unknown
  names?: unknown
  // Legacy single-file contract.
  path?: unknown
  base64?: unknown
  name?: unknown
}

export type ResolvedSlot = {
  doc: DocumentPage | null
  // Storage paths of the original page files, in merge order (empty when the
  // upload arrived inline as base64).
  pageRefs: string[]
  merged: boolean
}

function extOf(nameOrPath: unknown): string {
  return String(nameOrPath ?? '').split('.').pop()?.toLowerCase() ?? ''
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  if (!v.every((x) => typeof x === 'string' && x)) return null
  return v as string[]
}

// Throws MergeError (carries an HTTP status) on any invalid reference so the
// routes can surface a clean 4xx instead of a generic 500.
export async function resolveSlot(
  admin: SupabaseClient,
  ownerPrefix: string,
  input: SlotInput
): Promise<ResolvedSlot> {
  const paths = asStringArray(input.paths)
  const base64s = asStringArray(input.base64s)
  const names = asStringArray(input.names) ?? []

  // ── Multi-file: storage paths (primary) or inline base64 (small-file fallback)
  if ((paths && paths.length > 0) || (base64s && base64s.length > 0)) {
    const pages: DocumentPage[] = []
    const pageRefs: string[] = []
    if (paths && paths.length > 0) {
      for (const p of paths) {
        if (!pathHasPrefix(p, ownerPrefix)) throw new MergeError('Invalid upload reference')
        pages.push({ base64: await downloadBillBase64(admin, p), ext: extOf(p) })
        pageRefs.push(p)
      }
    } else {
      base64s!.forEach((b64, i) => pages.push({ base64: b64, ext: extOf(names[i]) }))
    }
    // Resolve HEIC-by-content for extensionless pages (iPhone uploads).
    for (const page of pages) {
      if (!page.ext && isHeicBuffer(Buffer.from(page.base64, 'base64'))) page.ext = 'heic'
    }
    const doc = await resolveDocument(pages)
    return { doc, pageRefs, merged: pages.length > 1 }
  }

  // ── Legacy single-file
  if (typeof input.path === 'string' && input.path) {
    if (!pathHasPrefix(input.path, ownerPrefix)) throw new MergeError('Invalid upload reference')
    const base64 = await downloadBillBase64(admin, input.path)
    return {
      doc: { base64, ext: extOf(input.name) || extOf(input.path) },
      pageRefs: [input.path],
      merged: false,
    }
  }
  if (typeof input.base64 === 'string' && input.base64) {
    return { doc: { base64: input.base64, ext: extOf(input.name) }, pageRefs: [], merged: false }
  }
  return { doc: null, pageRefs: [], merged: false }
}
