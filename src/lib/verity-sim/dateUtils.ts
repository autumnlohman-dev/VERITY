/**
 * Pure date helpers for the VERITY simulation engine.
 * All functions are deterministic and accept ISO-8601 date strings.
 */

/**
 * Returns the fractional number of months elapsed between planYearStart
 * and asOfDate.  Used to derive the monthly burn rate for the OOP
 * exhaustion-date projection (claim 43(iii)).
 *
 * Returns 0 if asOfDate <= planYearStart (prevents divide-by-zero upstream).
 */
export function monthsElapsed(planYearStart: string, asOfDate: string): number {
  const start = new Date(planYearStart);
  const as = new Date(asOfDate);
  const diff =
    (as.getFullYear() - start.getFullYear()) * 12 +
    (as.getMonth() - start.getMonth()) +
    (as.getDate() - start.getDate()) / 30;
  return Math.max(0, diff);
}

/**
 * Adds a fractional number of months to an ISO-8601 date string and
 * returns the result as an ISO-8601 date string (YYYY-MM-DD).
 *
 * Used to project the family-OOP exhaustion date (claim 43(iii)).
 */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  // Work in total days: 1 month ≈ 30.4375 days (mean Gregorian month).
  const DAYS_PER_MONTH = 30.4375;
  d.setDate(d.getDate() + Math.round(months * DAYS_PER_MONTH));
  return d.toISOString().slice(0, 10);
}
