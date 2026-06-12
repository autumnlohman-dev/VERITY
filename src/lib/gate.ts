// Shared helpers for the site-wide password gate.
//
// Kept dependency-free and Web-Crypto-only so the exact same code runs in both
// the Edge middleware (src/middleware.ts) and the Node route handler
// (src/app/api/gate/route.ts). No Node `crypto`, no imports.

export const GATE_COOKIE = 'site_access'
// 30 days, in seconds.
export const GATE_MAX_AGE = 60 * 60 * 24 * 30

// Deterministic, non-reversible token derived from the configured password.
// The cookie stores THIS hash, never the raw password. The version prefix lets
// us invalidate every existing session later by bumping `v1`.
export async function gateToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`clearclaim-gate:v1:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Length-stable comparison so a valid cookie can't be reconstructed byte-by-byte
// from response-timing differences.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Only permit redirects to internal, single-leading-slash paths so the ?next
// param can't be turned into an open redirect to another origin.
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}
