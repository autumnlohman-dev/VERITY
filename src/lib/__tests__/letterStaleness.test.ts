/**
 * Stale-letter invalidation.
 *
 * A dispute letter is generated from a snapshot of the case's audit results;
 * recompute / re-run can change those results afterwards. These tests pin the
 * contract: the fingerprint is stable across equivalent persists and changes
 * with any number a letter states; letters flip to stale when the audit moves
 * and come back fresh only after regeneration.
 */
import { describe, it, expect } from 'vitest';
import { auditSnapshotFingerprint, isLetterStale, type AuditSnapshotSource } from '../letters/staleness';
import { AUDIT_LOGIC_VERSION } from '../audit/version';

function snapshot(overrides: Partial<AuditSnapshotSource> = {}): AuditSnapshotSource {
  return {
    amount_billed: 20905,
    amount_expected: 3341.01,
    potential_savings: 300,
    errors_found: [
      { cpt_code: '85025', error_type: 'coding_observation', billed_amount: 245, expected_amount: 245 },
      { cpt_code: 'J7050', error_type: 'coding_observation', billed_amount: 180, expected_amount: 180 },
    ],
    bill_data: {
      auditLogicVersion: AUDIT_LOGIC_VERSION,
      billPatientResponsibility: 3641.01,
      eobPatientResponsibility: 3341.01,
      normalizedCbs: {
        crossDocumentDiscrepancies: [
          { type: 'patient_responsibility_mismatch', severity: 'high', estimatedDollarImpact: 300 },
        ],
      },
    },
    ...overrides,
  };
}

describe('auditSnapshotFingerprint', () => {
  it('is stable across equivalent persists (finding order does not matter)', () => {
    const a = snapshot();
    const b = snapshot({
      errors_found: [...(snapshot().errors_found as unknown[])].reverse(),
    });
    expect(auditSnapshotFingerprint(a)).toBe(auditSnapshotFingerprint(b));
  });

  it('changes when the headline savings change', () => {
    expect(auditSnapshotFingerprint(snapshot())).not.toBe(
      auditSnapshotFingerprint(snapshot({ potential_savings: 1819.07 }))
    );
  });

  it('changes when findings change', () => {
    const withExtraFinding = snapshot();
    (withExtraFinding.errors_found as unknown[]).push({
      cpt_code: '80053',
      error_type: 'overcharge',
      billed_amount: 310,
      expected_amount: 14.39,
    });
    expect(auditSnapshotFingerprint(snapshot())).not.toBe(
      auditSnapshotFingerprint(withExtraFinding)
    );
  });

  it('changes when a cross-document discrepancy changes dollars', () => {
    const changed = snapshot();
    ((changed.bill_data as Record<string, unknown>).normalizedCbs as {
      crossDocumentDiscrepancies: Array<{ estimatedDollarImpact: number }>;
    }).crossDocumentDiscrepancies[0].estimatedDollarImpact = 450;
    expect(auditSnapshotFingerprint(snapshot())).not.toBe(auditSnapshotFingerprint(changed));
  });

  it('changes when the audit logic version moves', () => {
    const bumped = snapshot();
    (bumped.bill_data as Record<string, unknown>).auditLogicVersion = AUDIT_LOGIC_VERSION + 1;
    expect(auditSnapshotFingerprint(snapshot())).not.toBe(auditSnapshotFingerprint(bumped));
  });
});

describe('isLetterStale', () => {
  const currentFp = auditSnapshotFingerprint(snapshot());
  const freshLetter = {
    stale: false,
    audit_fingerprint: currentFp,
    audit_logic_version: AUDIT_LOGIC_VERSION,
  };

  it('a freshly generated letter matching the case is not stale', () => {
    expect(isLetterStale(freshLetter, currentFp)).toBe(false);
  });

  it('a writer-flagged letter is stale even if fingerprints happen to match', () => {
    expect(isLetterStale({ ...freshLetter, stale: true }, currentFp)).toBe(true);
  });

  it('a legacy letter (no fingerprint) is stale — its snapshot cannot be verified', () => {
    expect(isLetterStale({ stale: false, audit_fingerprint: null, audit_logic_version: null }, currentFp)).toBe(true);
  });

  it('a letter generated under an older logic version is stale', () => {
    expect(
      isLetterStale({ ...freshLetter, audit_logic_version: AUDIT_LOGIC_VERSION - 1 }, currentFp)
    ).toBe(true);
  });
});

describe('recompute → stale → regenerate flow (requirement 5)', () => {
  it('recompute changes savings → letter flips stale → regenerate clears it', () => {
    // 1. Letter generated from the pre-recompute snapshot.
    const before = snapshot({ potential_savings: 1819.07 });
    const letter = {
      stale: false,
      audit_fingerprint: auditSnapshotFingerprint(before),
      audit_logic_version: AUDIT_LOGIC_VERSION,
    };
    expect(isLetterStale(letter, auditSnapshotFingerprint(before))).toBe(false);

    // 2. Recompute persists changed results (savings 1819.07 → 300.00). The
    //    reader's derived check flips stale immediately — even before the
    //    writer-side markLettersStaleIfChanged lands.
    const after = snapshot({ potential_savings: 300 });
    const afterFp = auditSnapshotFingerprint(after);
    expect(isLetterStale(letter, afterFp)).toBe(true);
    //    ...and the writer marks it, which keeps it stale regardless.
    const marked = { ...letter, stale: true };
    expect(isLetterStale(marked, afterFp)).toBe(true);

    // 3. Regeneration stamps the new snapshot → download/print/mail re-enabled.
    const regenerated = {
      stale: false,
      audit_fingerprint: afterFp,
      audit_logic_version: AUDIT_LOGIC_VERSION,
    };
    expect(isLetterStale(regenerated, afterFp)).toBe(false);
  });

  it('a no-op persist (identical results) never invalidates the letter', () => {
    const fp = auditSnapshotFingerprint(snapshot());
    const letter = { stale: false, audit_fingerprint: fp, audit_logic_version: AUDIT_LOGIC_VERSION };
    // Re-persisting the same snapshot yields the same fingerprint.
    expect(isLetterStale(letter, auditSnapshotFingerprint(snapshot()))).toBe(false);
  });
});
