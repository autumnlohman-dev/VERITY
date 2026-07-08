/**
 * CBS bill↔EOB line-matching test — H2 regression coverage.
 *
 * Bill-side CBS lines carry service dates verbatim from vision output
 * ("03/14/2025") while EOB-side lines are ISO-normalized ("2025-03-14").
 * datesMatch must normalize both operands or the amount+date pairing fallback
 * never pairs, silently suppressing balance-billing / denied-service findings.
 */
import { describe, it, expect } from 'vitest';
import { datesMatch, normalizeCBSSet } from '../cbs/normalizer';
import type { CanonicalBillingSchema } from '../cbs/schema';

describe('datesMatch', () => {
  it('matches US-format against ISO for the same day', () => {
    expect(datesMatch('03/14/2025', '2025-03-14')).toBe(true);
    expect(datesMatch('2025-03-14', '03/14/2025')).toBe(true);
    expect(datesMatch('3/4/2025', '2025-03-04')).toBe(true);
  });

  it('still matches same-format dates', () => {
    expect(datesMatch('2025-03-14', '2025-03-14')).toBe(true);
    expect(datesMatch('03/14/2025', '03/14/2025')).toBe(true);
  });

  it('rejects genuinely different days', () => {
    expect(datesMatch('03/14/2025', '2025-03-15')).toBe(false);
  });

  it('does not block when either side is missing', () => {
    expect(datesMatch(undefined, '2025-03-14')).toBe(true);
    expect(datesMatch('03/14/2025', undefined)).toBe(true);
    expect(datesMatch(undefined, undefined)).toBe(true);
  });

  it('falls back to raw equality for unparseable strings', () => {
    expect(datesMatch('not-a-date', 'not-a-date')).toBe(true);
    expect(datesMatch('not-a-date', 'other-garbage')).toBe(false);
  });
});

describe('bill↔EOB pairing across date formats', () => {
  it('pairs a US-format bill line with an ISO EOB line and flags balance billing', () => {
    // Codeless commercial-EOB shape: pairing must go through the
    // amount + service_date fallback, which the H2 bug defeated.
    // Shared serviceEpisodeId mirrors runFullAudit, which stamps the same
    // episode onto both docs before calling normalizeCBSSet.
    const bill: CanonicalBillingSchema = {
      sourceDocumentId: 'doc-bill',
      sourceDocumentType: 'itemized_bill',
      serviceEpisodeId: 'episode-test',
      lineItems: [
        {
          lineItemId: 'bill-1',
          description: 'OFFICE VISIT',
          billedAmount: 350,
          units: 1,
          serviceDate: '03/14/2025', // verbatim vision output
          status: 'unknown',
        },
      ],
      totalBilled: 350,
      discrepancies: [],
      temporalInconsistencies: [],
    };
    const eob: CanonicalBillingSchema = {
      sourceDocumentId: 'doc-eob',
      sourceDocumentType: 'eob',
      serviceEpisodeId: 'episode-test',
      lineItems: [
        {
          lineItemId: 'eob-1',
          description: 'OFFICE VISIT',
          billedAmount: 350,
          allowedAmount: 180,
          patientResponsibility: 40,
          serviceDate: '2025-03-14', // ISO-normalized EOB output
          status: 'paid',
        },
      ],
      totalBilled: 350,
      discrepancies: [],
      temporalInconsistencies: [],
    };

    const result = normalizeCBSSet([bill, eob]);
    const balanceBilling = result.crossDocumentDiscrepancies.filter(
      (d) => d.type === 'balance_billing_violation'
    );
    expect(balanceBilling).toHaveLength(1);
    // Billed $350 vs $40 patient responsibility → $310 balance bill.
    expect(balanceBilling[0].estimatedDollarImpact).toBe(310);
  });
});
