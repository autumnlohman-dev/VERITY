/**
 * The honest-count bug: the dashboard said 8 errors while the case page said
 * 5 for the same data, because the dashboard counted errors_found.length
 * while the case page excluded manual-review flags / coding observations and
 * counted only significant cross-document findings. Both now route through
 * lib/audit/errorCount — these tests pin the shared rules and the parity.
 */
import { describe, it, expect } from 'vitest';
import {
  disputableErrorCount,
  significantCrossDocCount,
  userFacingErrorCount,
} from '../audit/errorCount';
import { MANUAL_REVIEW_ERROR_TYPES } from '../audit/manualReview';

// The 8-vs-5 shape: 8 raw errors_found rows, of which 2 are coding
// observations and 1 is a manual-review flag → 5 disputable.
const ERRORS_FOUND = [
  { error_type: 'overcharge', cpt_code: '80053' },
  { error_type: 'unbundling', cpt_code: '85025' },
  { error_type: 'mue', cpt_code: 'J7050' },
  { error_type: 'duplicate', cpt_code: '36415' },
  { error_type: 'patient_disputed', cpt_code: '74176' },
  { error_type: 'coding_observation', cpt_code: '85025' },
  { error_type: 'coding_observation', cpt_code: 'J7050' },
  { error_type: 'rate_unavailable', cpt_code: '' },
];

// Cross-document set: one real finding + two low-confidence unmatched-line
// notes (0 impact, low severity) that must never count.
const CROSS_DOCS = [
  { type: 'patient_responsibility_mismatch', severity: 'high', estimatedDollarImpact: 300 },
  { type: 'amount_mismatch', severity: 'low', estimatedDollarImpact: 0 },
  { type: 'amount_mismatch', severity: 'low', estimatedDollarImpact: 0 },
];

describe('the shared user-facing error count', () => {
  it('excludes coding observations and manual-review flags', () => {
    expect(disputableErrorCount(ERRORS_FOUND)).toBe(5);
  });

  it('excludes low-confidence unmatched-line notes from cross-document counts', () => {
    expect(significantCrossDocCount(CROSS_DOCS)).toBe(1);
  });

  it('dashboard count === case page count for the same data', () => {
    // The case page's counting rules, written out longhand: disputable audit
    // errors + significant cross-document findings.
    const casePageCount =
      ERRORS_FOUND.filter((e) => !MANUAL_REVIEW_ERROR_TYPES.has(e.error_type)).length +
      CROSS_DOCS.filter(
        (d) => d.estimatedDollarImpact > 0 || d.severity === 'critical' || d.severity === 'high'
      ).length;
    const dashboardCount = userFacingErrorCount(ERRORS_FOUND, CROSS_DOCS);
    expect(dashboardCount).toBe(casePageCount);
    expect(dashboardCount).toBe(6); // 5 disputable + 1 significant cross-doc
    // The raw length (the old dashboard bug) would have said 8.
    expect(ERRORS_FOUND.length).toBe(8);
  });

  it('tolerates missing/empty inputs', () => {
    expect(userFacingErrorCount(null, null)).toBe(0);
    expect(userFacingErrorCount(undefined, undefined)).toBe(0);
    expect(userFacingErrorCount([], [])).toBe(0);
  });
});
