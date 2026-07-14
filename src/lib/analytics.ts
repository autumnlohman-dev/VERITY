/**
 * Client-side product analytics (PostHog).
 *
 * Every capture goes through track() so event names stay in one place and
 * misspellings fail the type-checker. Absent NEXT_PUBLIC_POSTHOG_KEY every
 * call is a no-op, mirroring the Sentry env-gate.
 *
 * Privacy contract (same discipline as sentryScrub.ts): properties are
 * limited to counts, dollar totals, statuses, and internal ids. Never send
 * bill line items, CPT codes, provider or patient names, or free-text notes.
 */
import posthog from 'posthog-js';

export type AnalyticsEvent =
  | 'audit_completed'
  | 'findings_viewed'
  | 'report_emailed'
  | 'account_created'
  | 'signed_in'
  | 'guest_audit_claimed'
  | 'letter_paywall_viewed'
  | 'letter_unlocked'
  | 'letter_sent'
  | 'outcome_logged';

export function analyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

export function track(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean | null>,
) {
  if (!analyticsEnabled()) return;
  posthog.capture(event, properties);
}

export function identifyUser(userId: string) {
  if (!analyticsEnabled()) return;
  posthog.identify(userId);
}
