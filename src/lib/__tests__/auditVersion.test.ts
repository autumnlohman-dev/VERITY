/**
 * Audit-logic version stamping + stale-read behavior.
 *
 * Persisted results are a cache of logic that changes; these tests pin the
 * read-path contract:
 *  - classification: stale rows with persisted extraction data → recompute;
 *    stale rows without → re-run required; current rows → untouched
 *  - a version bump flips a current row to stale
 *  - recompute failure falls back to stored results + staleness banner
 *  - the legacy-honesty banner: recompute-only results never imply the full
 *    current analysis ran when the bill-vs-EOB total check couldn't
 *  - the deterministic core recomputes a stale (pre-overhaul) case from
 *    persisted extraction data: false balance-billing criticals gone; the
 *    PR-mismatch appears exactly when the bill's stated PR is available
 *  - the letter-generation gate predicate rejects stale, passes current
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AUDIT_LOGIC_VERSION,
  auditVersionOf,
  classifyAuditFreshness,
  staleBannerFor,
} from '../audit/version';
import type { CanonicalBillingSchema } from '../cbs/schema';

// ── Mocks so the deterministic core runs without Supabase / Sentry / Next ────
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/mockFeeSchedule', () => ({
  batchFeeSchedule: vi.fn(async () => new Map()),
  batchPtpEdits: vi.fn(async () => []),
  batchMueEdits: vi.fn(async () => new Map()),
  effectiveAllowedAmount: () => 0,
  ptpAllowsModifier: () => true,
}));

import { runDeterministicAudit } from '../audit/deterministicCore';
import type { LineItem } from '../errorDetection';

const CURRENT = AUDIT_LOGIC_VERSION;

// A stale (pre-stamp) row shaped like a real pre-overhaul case: line items and
// the EOB CBS document persisted, computed findings stale, no version stamp.
function staleBillData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    lineItems: [
      { cpt_code: '85025', description: 'CBC', date_of_service: '06/14/2026', units: 1, billed_amount: 245 },
      { cpt_code: '80053', description: 'CMP', date_of_service: '06/14/2026', units: 1, billed_amount: 310 },
    ],
    hasEob: true,
    normalizedCbs: { documents: [], crossDocumentDiscrepancies: [], timeline: [] },
    ...overrides,
  };
}

describe('version stamp + classification', () => {
  it('treats a missing stamp as legacy version 1', () => {
    expect(auditVersionOf({})).toBe(1);
    expect(auditVersionOf(null)).toBe(1);
    expect(auditVersionOf({ auditLogicVersion: CURRENT })).toBe(CURRENT);
  });

  it('classifies a stale row with persisted line items as recomputable', () => {
    expect(classifyAuditFreshness(staleBillData())).toBe('recomputable');
  });

  it('classifies a stale row without persisted line items as rerun_required', () => {
    expect(classifyAuditFreshness({ hasEob: true })).toBe('rerun_required');
    expect(classifyAuditFreshness({ lineItems: [] })).toBe('rerun_required');
  });

  it('leaves a current row untouched', () => {
    expect(classifyAuditFreshness({ auditLogicVersion: CURRENT })).toBe('current');
  });

  it('a version bump flips a current row to stale', () => {
    const bd = staleBillData({ auditLogicVersion: CURRENT });
    expect(classifyAuditFreshness(bd, CURRENT)).toBe('current');
    expect(classifyAuditFreshness(bd, CURRENT + 1)).toBe('recomputable');
  });
});

describe('staleness banners', () => {
  it('recompute succeeded but bill PR missing on an EOB case → explicit limitation banner', () => {
    const banner = staleBannerFor(
      { auditLogicVersion: CURRENT, hasEob: true, billPatientResponsibility: null },
      true
    );
    expect(banner?.kind).toBe('rerun_for_full_analysis');
    // Must state the limitation, not just "older version".
    expect(banner?.message).toContain("comparing your bill's total against your EOB");
    expect(banner?.message).toContain('Re-run audit');
  });

  it('recompute succeeded with full inputs → no banner', () => {
    expect(
      staleBannerFor(
        { auditLogicVersion: CURRENT, hasEob: true, billPatientResponsibility: 3641.01 },
        true
      )
    ).toBeNull();
    expect(staleBannerFor({ auditLogicVersion: CURRENT, hasEob: false }, true)).toBeNull();
  });

  it('an originally-current row never gets a banner (even with EOB and no bill PR)', () => {
    expect(
      staleBannerFor({ auditLogicVersion: CURRENT, hasEob: true }, null)
    ).toBeNull();
  });

  it('recompute FAILED → stored results render behind the staleness banner (fallback path)', () => {
    const banner = staleBannerFor(staleBillData(), false);
    expect(banner?.kind).toBe('stale_rerun');
    expect(banner?.message).toContain('older version');
  });

  it('rerun_required (no recompute attempted) → staleness banner', () => {
    expect(staleBannerFor({ hasEob: true }, null)?.kind).toBe('stale_rerun');
  });
});

describe('deterministic recompute from persisted extraction data', () => {
  // Persisted EOB CBS document, as bill_data.normalizedCbs.documents stores it
  // (the vision output the recompute reuses instead of re-reading the EOB).
  function persistedEobCbs(): CanonicalBillingSchema {
    return {
      sourceDocumentId: 'eob_stale',
      sourceDocumentType: 'eob',
      dateOfService: '2026-06-14',
      eobDate: '2026-06-28',
      lineItems: [
        { lineItemId: 'e1', description: 'Laboratory Services', billedAmount: 245, allowedAmount: 40, patientResponsibility: 8, serviceDate: '2026-06-14', status: 'paid' },
        { lineItemId: 'e2', description: 'Laboratory Services', billedAmount: 310, allowedAmount: 55, patientResponsibility: 11, serviceDate: '2026-06-14', status: 'paid' },
      ],
      totalBilled: 555,
      totalPatientResponsibility: 19,
      discrepancies: [],
      temporalInconsistencies: [],
    };
  }
  const lineItems: LineItem[] = [
    { cpt_code: '85025', description: 'CBC', date_of_service: '06/14/2026', units: 1, billed_amount: 245 },
    { cpt_code: '80053', description: 'CMP', date_of_service: '06/14/2026', units: 1, billed_amount: 310 },
  ];

  it('removes pre-overhaul false balance-billing findings; PR-mismatch needs the bill PR', async () => {
    // Legacy case: bill PR was never extracted → no PR-mismatch possible, and
    // crucially ZERO gross-charge balance-billing findings survive.
    const withoutBillPr = await runDeterministicAudit({
      lineItems,
      insuranceType: 'commercial',
      docIdBase: 'stale',
      eobCbs: persistedEobCbs(),
      eobSupplied: true,
      billTotals: { statedTotalBilled: null, patientResponsibility: null },
      supabase: {} as never,
    });
    expect(
      withoutBillPr.normalizedCbs.crossDocumentDiscrepancies.filter(
        (d) => d.type === 'balance_billing_violation'
      )
    ).toHaveLength(0);
    expect(
      withoutBillPr.normalizedCbs.crossDocumentDiscrepancies.filter(
        (d) => d.type === 'patient_responsibility_mismatch'
      )
    ).toHaveLength(0);
    expect(withoutBillPr.billPatientResponsibility).toBeNull();
    // EOB-derived expected amount still honest.
    expect(withoutBillPr.totalExpected).toBe(19);

    // Same case after a vision re-run supplies the bill PR → the primary
    // check fires with the exact difference.
    const withBillPr = await runDeterministicAudit({
      lineItems,
      insuranceType: 'commercial',
      docIdBase: 'stale',
      eobCbs: persistedEobCbs(),
      eobSupplied: true,
      billTotals: { statedTotalBilled: null, patientResponsibility: 119 },
      supabase: {} as never,
    });
    const mismatches = withBillPr.normalizedCbs.crossDocumentDiscrepancies.filter(
      (d) => d.type === 'patient_responsibility_mismatch'
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].estimatedDollarImpact).toBe(100);
    expect(withBillPr.potentialSavings).toBeLessThanOrEqual(119);
  });

  it('carries over patient_disputed findings through dedup', async () => {
    const result = await runDeterministicAudit({
      lineItems,
      insuranceType: 'commercial',
      docIdBase: 'stale',
      eobCbs: null,
      eobSupplied: false,
      extraErrors: [
        {
          cpt_code: '85025',
          description: 'CBC',
          error_type: 'patient_disputed',
          billed_amount: 245,
          expected_amount: 0,
          confidence: 'MEDIUM',
          explanation: 'Patient reports the test was not completed.',
          rule_violated: '42 C.F.R. § 1001.952',
        },
      ],
      supabase: {} as never,
    });
    const disputed = result.errors.filter((e) => e.error_type === 'patient_disputed');
    expect(disputed).toHaveLength(1);
    // Precedence: patient_disputed outranks anything else on the same line.
    expect(result.errors.filter((e) => e.cpt_code === '85025')).toHaveLength(1);
  });
});

describe('letter-generation version gate (predicate)', () => {
  // The route refuses with 409 stale_audit_version when this predicate holds.
  const gateRejects = (bd: Record<string, unknown>) => auditVersionOf(bd) < AUDIT_LOGIC_VERSION;

  it('rejects legacy and stale-stamped audits', () => {
    expect(gateRejects({})).toBe(true);
    expect(gateRejects({ auditLogicVersion: CURRENT - 1 })).toBe(true);
  });

  it('passes current-version audits', () => {
    expect(gateRejects({ auditLogicVersion: CURRENT })).toBe(false);
  });
});
