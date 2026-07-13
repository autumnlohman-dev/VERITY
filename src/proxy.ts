import { NextResponse, type NextRequest } from 'next/server'
import { GATE_COOKIE, gateToken, safeEqual } from '@/lib/gate'

// ─── Site-wide password gate ──────────────────────────────────────────────────
// A free replacement for Vercel's paid Password Protection. When
// SITE_ACCESS_PASSWORD is set, every request needs a valid access cookie or it
// is rewritten to /gate. When the env var is unset, the gate is fully disabled
// and everyone passes through — so launch day is "delete one env var".
//
// (This file is Next.js 16's `proxy` convention — the renamed successor to
// `middleware`. Same request-interception behavior.)

// Paths that must stay reachable WITHOUT a gate cookie:
//  - /gate + /api/gate     → the gate UI and its submit endpoint
//  - /api/webhooks/stripe  → Stripe calls this server-to-server, with no cookie
//  - /api/cron             → Vercel's cron scheduler calls these server-to-server
//                            with no cookie; the routes enforce their own
//                            CRON_SECRET bearer auth. Without this exemption the
//                            gate rewrote cron requests to the gate page — a
//                            "successful" 200 that never ran the job.
const PUBLIC_PREFIXES = ['/gate', '/api/gate', '/api/webhooks/stripe', '/api/cron']
const PUBLIC_FILES = ['/robots.txt', '/favicon.ico', '/sitemap.xml']

function isPublic(pathname: string): boolean {
  if (PUBLIC_FILES.includes(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  const password = process.env.SITE_ACCESS_PASSWORD

  // Gate disabled — no password configured. Let everyone through.
  if (!password) return NextResponse.next()

  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  // Valid cookie → through. The cookie holds a hash of the password, so we
  // recompute the expected hash and compare in length-stable fashion.
  const cookie = request.cookies.get(GATE_COOKIE)?.value
  if (cookie && safeEqual(cookie, await gateToken(password))) {
    return NextResponse.next()
  }

  // No valid cookie → render the gate in place (the browser URL is unchanged),
  // carrying the originally-requested path so a correct password returns there.
  const url = request.nextUrl.clone()
  url.pathname = '/gate'
  url.search = ''
  url.searchParams.set('next', pathname + request.nextUrl.search)
  return NextResponse.rewrite(url)
}

export const config = {
  // Run on everything except Next's build output and the static image optimizer.
  // Finer-grained public allowances (gate, stripe webhook, robots) are handled
  // by isPublic() above so they can stay precise.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
