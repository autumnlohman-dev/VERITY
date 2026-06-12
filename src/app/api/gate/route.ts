import { NextResponse } from 'next/server'
import { GATE_COOKIE, GATE_MAX_AGE, gateToken, sanitizeNext } from '@/lib/gate'

// Validates the gate password and, on success, sets the httpOnly access cookie.
// Excluded from the gate itself (see PUBLIC_PREFIXES in src/middleware.ts) so it
// is always reachable. Uses 303 redirects so the browser issues a GET afterward.
export async function POST(req: Request) {
  const form = await req.formData()
  const password = String(form.get('password') ?? '')
  const next = sanitizeNext(String(form.get('next') ?? '/'))
  const configured = process.env.SITE_ACCESS_PASSWORD
  const origin = new URL(req.url).origin

  // Gate disabled — nothing to check, just let them in.
  if (!configured) {
    return NextResponse.redirect(new URL(next, origin), { status: 303 })
  }

  // Wrong password — back to the gate with an error flag, preserving `next`.
  if (password !== configured) {
    const back = new URL('/gate', origin)
    back.searchParams.set('error', '1')
    back.searchParams.set('next', next)
    return NextResponse.redirect(back, { status: 303 })
  }

  // Correct — set a hashed, httpOnly, 30-day cookie and send them on their way.
  const res = NextResponse.redirect(new URL(next, origin), { status: 303 })
  res.cookies.set(GATE_COOKIE, await gateToken(configured), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GATE_MAX_AGE,
  })
  return res
}
