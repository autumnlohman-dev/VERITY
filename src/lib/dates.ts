// ─── Calendar-date helpers ─────────────────────────────────────────────────────
// Document dates ("2026-06-28", "06/28/2026") are timezone-less CALENDAR dates.
// `new Date("2026-06-28")` parses as UTC midnight, so any viewer west of
// Greenwich renders it one day early (Jun 28 → "Jun 27"). Parse date-only
// strings into LOCAL date components instead; full ISO timestamps (which carry
// a time and zone) still go through the native parser.

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const US_DATE = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/

export function parseCalendarDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const raw = String(s).trim()
  const iso = raw.match(ISO_DATE_ONLY)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const us = raw.match(US_DATE)
  if (us) {
    const year = us[3].length === 2 ? Number(`20${us[3]}`) : Number(us[3])
    return new Date(year, Number(us[1]) - 1, Number(us[2]))
  }
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

// Locale-formatted calendar date; returns the input unchanged when unparseable
// so a malformed value degrades visibly rather than to "Invalid Date".
export function formatCalendarDate(
  s: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  if (!s) return '—'
  const d = parseCalendarDate(s)
  return d ? d.toLocaleDateString('en-US', options) : String(s)
}
