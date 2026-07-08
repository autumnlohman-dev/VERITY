// ─── Letter-number reconciliation guard ──────────────────────────────────────
// A dispute letter must state ONE consistent set of numbers: total billed,
// patient responsibility per the bill, per the EOB, and a demanded correction
// that sums from its findings. This guard runs BEFORE generation — if our own
// numbers don't reconcile, generation fails loudly instead of mailing a letter
// whose arithmetic collapses on first read (the pre-fix failure mode: 18
// findings "demanding" $12,549 against a bill whose bottom line was $3,641.01).

const CENT = 0.01

export interface LetterFindingAmount {
  /** Finding type (CBSDiscrepancy `type` or BillingError `error_type`). */
  type: string
  /** Dollars this finding demands be corrected (0 = justification-only). */
  amount: number
}

export interface LetterNumbers {
  /** Gross total charges on the bill (list prices — context, not the demand). */
  totalBilled: number
  /** The bill's stated bottom-line patient responsibility (null if unstated). */
  billPatientResponsibility: number | null
  /** The EOB's adjudicated total patient obligation (null without an EOB). */
  eobPatientResponsibility: number | null
  findings: LetterFindingAmount[]
}

export interface ReconcileResult {
  ok: boolean
  problems: string[]
  /** Sum of per-finding demanded corrections — the letter's headline figure. */
  demandedTotal: number
}

export function reconcileLetterNumbers(n: LetterNumbers): ReconcileResult {
  const problems: string[] = []

  for (const f of n.findings) {
    if (!Number.isFinite(f.amount) || f.amount < 0) {
      problems.push(`Finding "${f.type}" carries an invalid correction amount (${f.amount}).`)
    }
  }

  const demandedTotal =
    Math.round(n.findings.reduce((s, f) => s + Math.max(0, Number(f.amount) || 0), 0) * 100) / 100

  if (Number.isFinite(n.totalBilled) && demandedTotal > n.totalBilled + CENT) {
    problems.push(
      `Demanded corrections ($${demandedTotal.toFixed(2)}) exceed the bill's total charges ($${n.totalBilled.toFixed(2)}).`
    )
  }

  // THE invariant: never demand more than the patient is being asked to pay.
  if (
    n.billPatientResponsibility !== null &&
    demandedTotal > n.billPatientResponsibility + CENT
  ) {
    problems.push(
      `Demanded corrections ($${demandedTotal.toFixed(2)}) exceed the bill's stated patient responsibility ($${n.billPatientResponsibility.toFixed(2)}) — a letter cannot dispute more than the patient owes.`
    )
  }

  // The patient-responsibility-mismatch finding must equal bill-PR − EOB-PR to
  // the cent; anything else means two parts of the letter will disagree.
  if (n.billPatientResponsibility !== null && n.eobPatientResponsibility !== null) {
    const expectedDiff =
      Math.round((n.billPatientResponsibility - n.eobPatientResponsibility) * 100) / 100
    for (const f of n.findings) {
      if (f.type !== 'patient_responsibility_mismatch') continue
      if (Math.abs(f.amount - expectedDiff) > CENT) {
        problems.push(
          `Patient-responsibility mismatch amount ($${f.amount.toFixed(2)}) does not equal bill PR − EOB PR ($${expectedDiff.toFixed(2)}).`
        )
      }
    }
  }

  return { ok: problems.length === 0, problems, demandedTotal }
}
