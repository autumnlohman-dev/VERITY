/**
 * FIX 6 regression coverage — timezone-safe calendar dates, no $0.00
 * placeholder events, no entity-name residue ("Provider: NPI").
 */
import { describe, it, expect } from 'vitest';
import { formatCalendarDate, parseCalendarDate } from '../dates';
import { normalizeCBSSet } from '../cbs/normalizer';
import { extractToCBS } from '../cbs/extractor';
import type { CanonicalBillingSchema } from '../cbs/schema';

describe('calendar dates render timezone-safe', () => {
  it('renders an ISO date-only string as the same calendar day (no UTC shift)', () => {
    // Pre-fix: new Date("2026-06-28") parsed as UTC midnight → "Jun 27" for
    // any viewer west of Greenwich.
    expect(formatCalendarDate('2026-06-28')).toBe('Jun 28, 2026');
    expect(formatCalendarDate('06/28/2026')).toBe('Jun 28, 2026');
    const d = parseCalendarDate('2026-06-28')!;
    expect(d.getDate()).toBe(28);
    expect(d.getMonth()).toBe(5);
  });

  it('degrades unparseable input visibly, not to "Invalid Date"', () => {
    expect(formatCalendarDate('not-a-date')).toBe('not-a-date');
    expect(formatCalendarDate(null)).toBe('—');
  });
});

describe('timeline hygiene', () => {
  it('never renders $0.00 placeholder amounts for missing figures', () => {
    const doc: CanonicalBillingSchema = {
      sourceDocumentId: 'eob_x',
      sourceDocumentType: 'eob',
      eobDate: '2026-06-28',
      dateOfService: '2026-06-14',
      lineItems: [],
      // no totalAllowed / totalBilled — placeholders must not appear
      discrepancies: [],
      temporalInconsistencies: [],
    };
    const set = normalizeCBSSet([doc]);
    for (const e of set.timeline) {
      expect(e.description).not.toContain('$0.00');
      expect(e.financialAmount === 0).toBe(false);
    }
  });

  it('does not leak "NPI" as a provider entity name', () => {
    // The transcription line when no provider is printed: "Provider:   NPI: …"
    const cbs = extractToCBS('Provider:  NPI: 1234567890\nDate of Service: 06/14/2026', 'doc1', 'eob');
    expect(cbs.providerName).toBeUndefined();
    expect(cbs.providerNPI).toBe('1234567890');
  });
});
