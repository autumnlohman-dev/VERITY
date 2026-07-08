/**
 * GOLDEN TEST — case #7A428426 (bill + EOB, structured fixture).
 *
 * Encodes the extracted content of the two case documents: an itemized bill
 * with gross charges of $20,905 and a stated patient responsibility of
 * $3,641.01, and an internally-consistent commercial EOB adjudicating every
 * line (codeless, as commercial EOBs are) with a "You Owe" total of $3,341.01.
 *
 * Pre-fix, this pair produced 8 false-critical "balance billing" findings by
 * comparing gross line charges against per-line patient responsibility, NCCI/
 * MUE findings that contradicted the payer's own adjudication, and a headline
 * savings figure ($12,549) far above what the patient was even asked to pay.
 *
 * Post-fix expectations:
 *  - exactly ONE cross-document finding: patient_responsibility_mismatch, $300.00
 *  - ZERO balance-billing findings
 *  - NCCI (85025/80053) and MUE (J7050) demote to informational coding
 *    observations because the EOB adjudicated those lines separately
 *  - potential savings hard-capped at $3,641.01
 *  - the letter-number reconciliation guard FAILS LOUDLY on the pre-fix
 *    numbers (guard tested, not just the happy path)
 */
import { describe, it, expect, vi } from 'vitest';
import type { CanonicalBillingSchema } from '../cbs/schema';
import { normalizeCBSSet } from '../cbs/normalizer';
import { capPotentialSavings, computeRecoverable } from '../audit/savings';
import { reconcileLetterNumbers } from '../letters/reconcile';
import { letterRecipient } from '../letters/recipient';

// ── Mocks so runAudit is testable without Supabase / Sentry / Next ────────────
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}));
vi.mock('@/lib/mockFeeSchedule', () => {
  type Row = { cpt_code: string; description: string | null; allowed_amount: number | null; non_facility_amount: number | null; facility_amount: number | null; work_rvu: number | null; locality: string | null; schedule?: string };
  const row = (code: string, allowed: number, schedule: 'PFS' | 'CLFS'): [string, Row] => [
    code,
    { cpt_code: code, description: null, allowed_amount: allowed, non_facility_amount: null, facility_amount: null, work_rvu: null, locality: '00', schedule },
  ];
  return {
    // CLFS rates far below billed → overcharge WOULD fire if not suppressed.
    batchFeeSchedule: vi.fn(async () => new Map([row('85025', 10.61, 'CLFS'), row('80053', 14.39, 'CLFS'), row('J7050', 5.0, 'PFS')])),
    batchPtpEdits: vi.fn(async () => [{ code_1: '80053', code_2: '85025', edit_type: 1 }]),
    batchMueEdits: vi.fn(async () => new Map([['J7050', { cpt_code: 'J7050', max_units: 2 }]])),
    effectiveAllowedAmount: (r: Row | null | undefined) =>
      r ? Number(r.non_facility_amount ?? r.allowed_amount ?? r.facility_amount ?? 0) : 0,
    ptpAllowsModifier: (t: unknown) => Number(t) === 1,
  };
});

import { runAudit, dedupeErrorsByLine, type LineItem } from '../errorDetection';

// ── Fixture: the bill (gross $20,905; stated patient responsibility $3,641.01) ─
const BILL_PR = 3641.01;
const EOB_PR = 3341.01;

function makeBillCbs(): CanonicalBillingSchema {
  const line = (id: string, cpt: string | undefined, desc: string, amount: number, units = 1) => ({
    lineItemId: id,
    cptCode: cpt,
    description: desc,
    billedAmount: amount,
    units,
    serviceDate: '06/14/2026',
    status: 'unknown' as const,
  });
  return {
    sourceDocumentId: 'bill_7A428426',
    sourceDocumentType: 'itemized_bill',
    serviceEpisodeId: 'episode_7A428426',
    dateOfService: '06/14/2026',
    billDate: '06/20/2026',
    lineItems: [
      line('b1', '99284', 'ED VISIT LEVEL 4', 1200),
      line('b2', '85025', 'CBC W AUTO DIFF', 245),
      line('b3', '80053', 'COMPREHENSIVE METABOLIC PANEL', 310),
      line('b4', 'J7050', 'NORMAL SALINE IV SOLUTION', 180, 4),
      line('b5', '74176', 'CT ABDOMEN/PELVIS W/O CONTRAST', 12000),
      line('b6', undefined, 'EMERGENCY ROOM FACILITY FEE', 6970),
    ],
    totalBilled: 20905,
    totalPatientResponsibility: BILL_PR,
    discrepancies: [],
    temporalInconsistencies: [],
  };
}

// The EOB: codeless commercial lines, every dollar column internally
// consistent, "You Owe" total $3,341.01 (= sum of per-line patient resp).
function makeEobCbs(): CanonicalBillingSchema {
  const line = (
    id: string,
    desc: string,
    billed: number,
    allowed: number,
    resp: number
  ) => ({
    lineItemId: id,
    description: desc,
    billedAmount: billed,
    allowedAmount: allowed,
    patientResponsibility: resp,
    serviceDate: '2026-06-14',
    status: 'paid' as const,
  });
  return {
    sourceDocumentId: 'eob_7A428426',
    sourceDocumentType: 'eob',
    serviceEpisodeId: 'episode_7A428426',
    dateOfService: '2026-06-14',
    eobDate: '2026-06-28',
    payerName: 'Commercial Plan',
    lineItems: [
      line('e1', 'Emergency Services', 1200, 620, 150),
      line('e2', 'Laboratory Services', 245, 40.0, 8.0), // 85025 adjudicated separately
      line('e3', 'Laboratory Services', 310, 55.0, 11.0), // 80053 adjudicated separately
      line('e4', 'IV Solutions', 180, 60.0, 12.0), // J7050 adjudicated as billed
      line('e5', 'Advanced Imaging', 12000, 4100, 1810.01),
      line('e6', 'Facility Services', 6970, 2800, 1350),
    ],
    totalBilled: 20905,
    totalAllowed: 7675,
    totalPatientResponsibility: EOB_PR,
    discrepancies: [],
    temporalInconsistencies: [],
  };
}

describe('golden case #7A428426 — cross-document comparison', () => {
  const result = normalizeCBSSet([makeBillCbs(), makeEobCbs()]);

  it('produces exactly ONE significant finding: patient_responsibility_mismatch of $300.00', () => {
    const significant = result.crossDocumentDiscrepancies.filter(
      (d) => d.estimatedDollarImpact > 0 || d.severity === 'critical' || d.severity === 'high'
    );
    expect(significant).toHaveLength(1);
    expect(significant[0].type).toBe('patient_responsibility_mismatch');
    expect(significant[0].estimatedDollarImpact).toBe(300.0);
    expect(significant[0].severity).toBe('high'); // $300 → high, not critical
  });

  it('produces ZERO balance-billing findings from gross charges on adjudicated lines', () => {
    expect(
      result.crossDocumentDiscrepancies.filter((d) => d.type === 'balance_billing_violation')
    ).toHaveLength(0);
    expect(
      result.crossDocumentDiscrepancies.filter((d) => d.type === 'denied_service_billed')
    ).toHaveLength(0);
  });

  it('does not cite the No Surprises Act by default — but does with emergency context', () => {
    // The fixture HAS an ED visit (99284), so NSA is defensible here.
    const finding = result.crossDocumentDiscrepancies.find(
      (d) => d.type === 'patient_responsibility_mismatch'
    )!;
    expect(finding.applicableRegulations.some((r) => /no surprises/i.test(r))).toBe(true);

    // Without emergency codes the same mismatch must NOT cite the NSA.
    const bill = makeBillCbs();
    bill.lineItems = bill.lineItems.filter((l) => l.cptCode !== '99284');
    const nonEmergency = normalizeCBSSet([bill, makeEobCbs()]);
    const f2 = nonEmergency.crossDocumentDiscrepancies.find(
      (d) => d.type === 'patient_responsibility_mismatch'
    )!;
    expect(f2.applicableRegulations.some((r) => /no surprises/i.test(r))).toBe(false);
  });

  it('marks EOB-adjudicated bill lines eobBenchmarked (85025, 80053, J7050, CT)', () => {
    const billDoc = result.documents.find((d) => d.sourceDocumentType === 'itemized_bill')!;
    const byCode = (c: string) => billDoc.lineItems.find((l) => l.cptCode === c)!;
    expect(byCode('85025').eobBenchmarked).toBe(true);
    expect(byCode('80053').eobBenchmarked).toBe(true);
    expect(byCode('J7050').eobBenchmarked).toBe(true);
    expect(byCode('74176').eobBenchmarked).toBe(true);
  });
});

describe('golden case #7A428426 — audit on adjudicated lines', () => {
  const auditItems: LineItem[] = [
    { cpt_code: '85025', description: 'CBC W AUTO DIFF', date_of_service: '06/14/2026', units: 1, billed_amount: 245, eobAdjudicated: true },
    { cpt_code: '80053', description: 'COMPREHENSIVE METABOLIC PANEL', date_of_service: '06/14/2026', units: 1, billed_amount: 310, eobAdjudicated: true },
    { cpt_code: 'J7050', description: 'NORMAL SALINE IV SOLUTION', date_of_service: '06/14/2026', units: 4, billed_amount: 180, eobAdjudicated: true },
  ];

  it('demotes NCCI 85025/80053 and MUE J7050 to informational coding observations', async () => {
    const errors = await runAudit(auditItems, 'commercial', { supabase: {} as never });
    expect(errors.filter((e) => e.error_type === 'unbundling')).toHaveLength(0);
    expect(errors.filter((e) => e.error_type === 'mue')).toHaveLength(0);
    expect(errors.filter((e) => e.error_type === 'overcharge')).toHaveLength(0);
    const observations = errors.filter((e) => e.error_type === 'coding_observation');
    expect(observations.map((o) => o.cpt_code).sort()).toEqual(['85025', 'J7050']);
    // Observations carry no recoverable dollars.
    expect(computeRecoverable(errors, 20905)).toBe(0);
  });

  it('keeps NCCI/MUE/overcharge as real findings on UN-adjudicated lines', async () => {
    const unadjudicated = auditItems.map((i) => ({ ...i, eobAdjudicated: false }));
    const errors = await runAudit(unadjudicated, 'commercial', { supabase: {} as never });
    const deduped = dedupeErrorsByLine(errors);
    expect(deduped.some((e) => e.error_type === 'unbundling' && e.cpt_code === '85025')).toBe(true);
    expect(deduped.some((e) => e.error_type === 'mue' && e.cpt_code === 'J7050')).toBe(true);
    // One CPT line → at most ONE finding, even when several checks fire.
    const per85025 = deduped.filter((e) => e.cpt_code === '85025');
    expect(per85025).toHaveLength(1);
  });
});

describe('golden case #7A428426 — savings cap invariant', () => {
  it('never exceeds the amount the patient is asked to pay', () => {
    // Pre-fix the raw figure was $12,549 on this case.
    expect(capPotentialSavings(12549, BILL_PR)).toBe(BILL_PR);
    expect(capPotentialSavings(300, BILL_PR)).toBe(300);
    expect(capPotentialSavings(-5, BILL_PR)).toBe(0);
    // No stated patient responsibility → raw figure stands.
    expect(capPotentialSavings(12549, null)).toBe(12549);
  });
});

describe('golden case #7A428426 — letter number reconciliation', () => {
  it('reconciles the post-fix numbers (one $300 mismatch finding)', () => {
    const r = reconcileLetterNumbers({
      totalBilled: 20905,
      billPatientResponsibility: BILL_PR,
      eobPatientResponsibility: EOB_PR,
      findings: [{ type: 'patient_responsibility_mismatch', amount: 300.0 }],
    });
    expect(r.ok).toBe(true);
    expect(r.demandedTotal).toBe(300.0);
  });

  it('FAILS LOUDLY on the pre-fix numbers (18 findings / $12,549 vs $3,641.01 owed)', () => {
    // The pre-fix letter: 8 false balance-billing criticals + coding findings
    // summing $12,549 demanded against a bill whose bottom line is $3,641.01.
    const preFixFindings = [
      ...Array.from({ length: 8 }, () => ({ type: 'balance_billing_violation', amount: 1200 })),
      ...Array.from({ length: 10 }, () => ({ type: 'overcharge', amount: 294.9 })),
    ];
    const r = reconcileLetterNumbers({
      totalBilled: 20905,
      billPatientResponsibility: BILL_PR,
      eobPatientResponsibility: EOB_PR,
      findings: preFixFindings,
    });
    expect(r.ok).toBe(false);
    expect(r.demandedTotal).toBe(12549);
    expect(r.problems.some((p) => p.includes('exceed the bill\'s stated patient responsibility'))).toBe(true);
  });

  it('rejects a mismatch finding whose amount disagrees with bill PR − EOB PR', () => {
    const r = reconcileLetterNumbers({
      totalBilled: 20905,
      billPatientResponsibility: BILL_PR,
      eobPatientResponsibility: EOB_PR,
      findings: [{ type: 'patient_responsibility_mismatch', amount: 450 }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('golden case #7A428426 — letter recipient', () => {
  it('routes the provider-billing dispute to the provider, not the insurer portal', () => {
    expect(
      letterRecipient({
        selfPay: false,
        findings: [{ type: 'patient_responsibility_mismatch', dollarImpact: 300 }],
      })
    ).toBe('provider');
  });

  it('routes denied-service content to the insurer', () => {
    expect(
      letterRecipient({
        selfPay: false,
        findings: [{ type: 'denied_service_billed', dollarImpact: 500 }],
      })
    ).toBe('insurer');
  });
});
