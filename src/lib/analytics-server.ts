/**
 * Server-side product analytics (PostHog) for route handlers.
 *
 * Serverless gotcha: events queue in memory, so every capture must be
 * flushed before the response returns or it is silently dropped. Callers
 * therefore use `await captureServer(...)`, which flushes internally.
 *
 * Same privacy contract as src/lib/analytics.ts: counts, dollar totals,
 * statuses, and internal ids only. distinct_id is a user id or, for guests,
 * the guestSessionId. The guest-to-user funnel stitch happens client-side:
 * posthog-js keeps one anonymous browser id across the guest journey, and
 * identifyUser() at login merges it into the account.
 */
import { PostHog } from 'posthog-node';
import type { AnalyticsEvent } from './analytics';

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export async function captureServer(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean | null>,
) {
  const ph = getClient();
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties });
    await ph.flush();
  } catch {
    // Analytics must never fail a request.
  }
}
