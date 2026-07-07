import * as Sentry from '@sentry/nextjs'
import { scrubSentryEvent } from './lib/sentryScrub'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    // PHI scrub: same hook as the server configs (lib/sentryScrub).
    beforeSend: (event) => scrubSentryEvent(event)
  })
}
