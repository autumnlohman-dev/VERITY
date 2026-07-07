import * as Sentry from '@sentry/nextjs'
import { scrubSentryEvent } from './lib/sentryScrub'

export async function register() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
      // PHI scrub: no BAA with Sentry — strip request bodies and identifier
      // shapes before anything leaves the process (lib/sentryScrub).
      beforeSend: (event) => scrubSentryEvent(event)
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
      // PHI scrub: no BAA with Sentry — strip request bodies and identifier
      // shapes before anything leaves the process (lib/sentryScrub).
      beforeSend: (event) => scrubSentryEvent(event)
    })
  }
}

export const onRequestError = Sentry.captureRequestError
