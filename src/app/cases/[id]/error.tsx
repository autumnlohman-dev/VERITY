'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'

// Route-level error boundary for /cases/[id]. Without this, any render error on
// a case page bubbles all the way to app/global-error.tsx, which blanks the
// whole app with a generic "Something went wrong" and an unstyled shell. Scoping
// the boundary here keeps the chrome intact, reports the failure to Sentry with
// the case route in context, and lets the user retry or step back to their
// dashboard — where the case (and its findings) are still safe in the database.
export default function CaseError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { route: 'cases/[id]' } })
  }, [error])

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', fontFamily: 'var(--font-public-sans), system-ui, sans-serif', color: 'var(--ink)' }}>
      <div style={{ fontFamily: 'var(--font-lora), Georgia, serif',
  
  letterSpacing: '-0.015em', fontSize: '40px', lineHeight: 1.1, maxWidth: '460px' }}>
        We couldn&apos;t display this case.
      </div>
      <p style={{ fontSize: '14px', color: 'var(--ink-soft)', marginTop: '16px', maxWidth: '420px', lineHeight: 1.65 }}>
        Your audit is safe, this is only a display error, and it&apos;s been
        reported. Try again, or head back to your dashboard.
      </p>
      <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
        <button
          onClick={() => reset()}
          style={{ fontSize: '11px', color: 'var(--ink)', backgroundColor: 'var(--brand-fill)', padding: '12px 24px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 500, border: 'none', cursor: 'pointer' }}
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          style={{ fontSize: '11px', color: 'var(--ink-soft)', padding: '12px 24px', letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid var(--line)', textDecoration: 'none' }}
        >
          Dashboard
        </Link>
      </div>
    </div>
  )
}
