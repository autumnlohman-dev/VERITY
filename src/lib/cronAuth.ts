// Shared auth check for Vercel cron routes (storm-index recompute, deadline
// sweep, and whatever joins them later): one gate, separate handlers.
// Pure so the 401/200 decision is unit-testable without a request cycle.
export function isAuthorizedCronRequest(
  authHeader: string | null,
  cronSecret: string | undefined
): boolean {
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`
}
