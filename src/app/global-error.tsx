'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body
        style={{
          background: 'var(--surface)',
          minHeight: '100vh',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'var(--font-public-sans), system-ui, sans-serif',
          color: 'var(--ink)'
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
  fontOpticalSizing: 'auto',
  letterSpacing: '-0.015em',
            fontSize: '40px',
            lineHeight: 1.1,
            maxWidth: '460px'
          }}
        >
          Something went wrong.
        </div>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--ink-soft)',
            marginTop: '16px',
            maxWidth: '420px',
            lineHeight: 1.65
          }}
        >
          The error has been reported. You can try again or head back to your
          dashboard.
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
          <button
            onClick={() => reset()}
            style={{
              fontSize: '11px',
              color: 'var(--ink)',
              backgroundColor: '#C8A97E',
              padding: '12px 24px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Try again
          </button>
          <a
            href="/dashboard"
            style={{
              fontSize: '11px',
              color: 'var(--ink-soft)',
              padding: '12px 24px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              border: '1px solid var(--line)',
              textDecoration: 'none'
            }}
          >
            Dashboard
          </a>
        </div>
      </body>
    </html>
  )
}
