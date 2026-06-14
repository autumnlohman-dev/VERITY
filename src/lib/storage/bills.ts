import type { SupabaseClient } from '@supabase/supabase-js'

// Shared storage helpers for the `bills` bucket. Large scanned PDFs and phone
// photos can't ride inside the JSON POST body (base64 inflation blows past
// Vercel's ~4.5 MB request limit), so the browser uploads them straight to
// Supabase Storage via a server-minted signed URL and the audit routes download
// them back server-side with the service-role client. These helpers centralize
// the path scoping (so one owner can't read another's file) and the download.

export const BILLS_BUCKET = 'bills'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

// Strip directory separators and anything risky from a client-supplied filename
// so it can't escape its scoped folder; keep a short, recognizable suffix.
export function sanitizeFileName(name: string): string {
  const base = String(name).split(/[/\\]/).pop() ?? 'file'
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_')
  return cleaned.slice(-100) || 'file'
}

// Server-chosen storage path. The prefix isolates each owner:
//   signed-in →  <userId>/<nonce>-<slot>-<file>
//   guest     →  guest/<sessionId>/<nonce>-<slot>-<file>
// `nonce` (a timestamp) keeps repeated uploads of the same filename distinct.
export function buildBillPath(prefix: string, slot: string, fileName: string, nonce: number): string {
  return `${prefix}/${nonce}-${slot}-${sanitizeFileName(fileName)}`
}

// Guard: the client echoes the storage path back to the audit routes, so verify
// it still sits under the caller's own prefix before we download it with the
// service role. Blocks reading another owner's file via a forged path.
export function pathHasPrefix(path: unknown, prefix: string): path is string {
  return typeof path === 'string' && path.startsWith(prefix + '/') && !path.includes('..')
}

// Download a stored bill/EOB with the service-role client and return it base64-
// encoded — the shape the extractor + audit pipeline already consume.
export async function downloadBillBase64(admin: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await admin.storage.from(BILLS_BUCKET).download(path)
  if (error || !data) {
    throw new Error(`Failed to download ${path}: ${error?.message ?? 'no data'}`)
  }
  const buf = Buffer.from(await data.arrayBuffer())
  return buf.toString('base64')
}
