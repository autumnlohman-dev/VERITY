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
          background: '#0D0D0D',
          minHeight: '100vh',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
          color: '#F5F0E8'
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-cormorant), Georgia, serif',
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
            color: '#A89F96',
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
              color: '#0D0D0D',
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
              color: '#A89F96',
              padding: '12px 24px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              border: '1px solid #242424',
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
