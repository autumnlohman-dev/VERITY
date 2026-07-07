// ─── Sentry PHI scrub ───────────────────────────────────────────────────────────
// Sentry is a third party with no BAA. Error events can carry PHI three ways:
// request bodies attached to the event, identifier-shaped strings inside
// exception messages (an Anthropic APIError can echo request content), and
// console breadcrumbs. This beforeSend hook strips bodies outright and scrubs
// identifier shapes from every message it forwards. Shared by the node, edge,
// and browser Sentry.init configs — keep it dependency-free so the client
// bundle can import it.
//
// Same patterns as lib/ai/phiBoundary's deidentifyFreeText; duplicated here
// (three regexes) rather than imported so this module stays importable from
// the browser bundle without pulling in the Anthropic SDK.

const SCRUB_PATTERNS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],
  [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[PHONE]'],
]

function scrubString(s: string): string {
  let out = s
  for (const [pattern, token] of SCRUB_PATTERNS) out = out.replace(pattern, token)
  return out
}

type ScrubbableEvent = {
  request?: { data?: unknown; cookies?: unknown; headers?: unknown }
  exception?: { values?: Array<{ value?: string }> }
  breadcrumbs?: Array<{ message?: string; data?: unknown }>
  extra?: Record<string, unknown>
  message?: string
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  // Request bodies are the highest-risk payload (they can contain the full
  // case findings / patient note) — drop them entirely, along with cookies.
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
  }
  if (typeof event.message === 'string') event.message = scrubString(event.message)
  for (const v of event.exception?.values ?? []) {
    if (typeof v.value === 'string') v.value = scrubString(v.value)
  }
  for (const b of event.breadcrumbs ?? []) {
    if (typeof b.message === 'string') b.message = scrubString(b.message)
    // Breadcrumb data blobs (fetch bodies, console args) are unbounded — drop.
    delete b.data
  }
  for (const k of Object.keys(event.extra ?? {})) {
    const v = event.extra![k]
    if (typeof v === 'string') event.extra![k] = scrubString(v)
  }
  return event
}
