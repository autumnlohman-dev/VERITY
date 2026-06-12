import { createAdminClient } from '@/lib/supabase/admin'

// ─── Server-side rate limiting (C2 / H6) ──────────────────────────────────────
// A Postgres-backed fixed-window limiter. The audit routes call Anthropic, which
// is slow and costs money per request, so both the public guest audit and the
// signed-in extract are throttled. State lives in the DB (not in-memory) so the
// limit holds across serverless instances.
//
// Fail-OPEN by design: if the limiter itself errors (DB hiccup, missing service
// key), we allow the request. A broken limiter must never take down the product.

export interface RateLimitArgs {
  /** Stable identity for the caller, e.g. `audit-guest:1.2.3.4` or `extract:<uid>`. */
  bucket: string
  /** Max requests allowed within the window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  count: number
  limit: number
}

export async function checkRateLimit({
  bucket,
  limit,
  windowSeconds,
}: RateLimitArgs): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_bucket: bucket,
      p_window_seconds: windowSeconds,
    })
    if (error || typeof data !== 'number') {
      return { allowed: true, count: 0, limit }
    }
    return { allowed: data <= limit, count: data, limit }
  } catch {
    return { allowed: true, count: 0, limit }
  }
}

// Best-effort client IP from common proxy headers. Vercel sets x-forwarded-for;
// the left-most entry is the original client.
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

// Exact decoded byte size of a base64 string without allocating the buffer.
export function decodedBase64Bytes(b64: string): number {
  if (!b64) return 0
  return Buffer.byteLength(b64, 'base64')
}
