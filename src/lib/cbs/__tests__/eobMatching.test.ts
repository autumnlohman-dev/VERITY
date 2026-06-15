/**
 * Regression tests for the bill ↔ EOB cross-document matcher.
 *
 * Fixture: a real-shape Billings Clinic commercial-PPO EOB. The EOB carries NO
 * CPT codes — only service descriptions + dollar columns — which is the normal
 * case the matcher previously mishandled: it joined on CPT, found nothing, and
 * falsely flagged every bill code as "appears on bill but not adjudicated",
 * while missing the balance billing the EOB states outright.
 */
import { describe, it, expect } from 'vitest'
import { extractEOBLineItems, extractToCBS, billExtractionToCBS } from '../extractor'
import { normalizeCBSSet } from '../normalizer'
import type { CBSDiscrepancy } from '../schema'

// The EOB document, as a payer prints it: descriptions + columns, no CPT codes.
const EOB_TEXT = `BILLINGS CLINIC
Explanation of Benefits — This is not a bill

Member: JANE DOE        Member ID: ABC123456789
Plan: Commercial PPO    Claim #: 2024998877
Provider: Billings Clinic    Date Processed: 09/02/2024

Service Date   Service Description            Amount Billed   Amount Covered/Allowed   Your Total Costs   Notes
08/15/2024     Laboratory Services (TTG)      $268.00         $15.45                   $15.45
08/15/2024     Laboratory Services            $33.00          $0.00                    $0.00              Discounted under network agreement
08/15/2024     Medical Visits                 $329.00         $176.14                  $161.55
08/15/2024     Laboratory Services            $94.00          $0.00                    $0.00              Not payable with the diagnosis billed

If the amount billed is more than what is allowed, your provider should not bill
you for any balance over what is allowed.`

// The itemized bill DOES carry CPT codes; the EOB does not. Matching must still
// pair them up (by amount + date) and never demand the EOB carry codes.
function buildBill() {
  return billExtractionToCBS(
    {
      lineItems: [
        { cpt_code: '82728', description: 'Ferritin / TTG panel', date_of_service: '2024-08-15', units: 1, billed_amount: 268.0 },
        { cpt_code: '80053', description: 'Comprehensive metabolic panel', date_of_service: '2024-08-15', units: 1, billed_amount: 33.0 },
        { cpt_code: '99214', description: 'Office visit, established patient', date_of_service: '2024-08-15', units: 1, billed_amount: 329.0 },
        { cpt_code: '36415', description: 'Routine venipuncture', date_of_service: '2024-08-15', units: 1, billed_amount: 94.0 },
      ],
      billMetadata: {
        provider_name: 'Billings Clinic',
        provider_npi: '',
        bill_date: '2024-09-10',
        patient_name: 'Jane Doe',
        account_number: 'ACCT-1',
      },
    },
    'bill_1'
  )
}

describe('EOB extraction (no CPT codes required)', () => {
  const lines = extractEOBLineItems(EOB_TEXT)

  it('captures every service line without requiring a CPT code', () => {
    expect(lines).toHaveLength(4)
    expect(lines.every((l) => !l.cptCode)).toBe(true)
  })

  it('captures billed / allowed / patient-responsibility columns', () => {
    expect(
      lines.every((l) => l.billedAmount !== undefined && l.patientResponsibility !== undefined)
    ).toBe(true)
    const ttg = lines.find((l) => Math.abs((l.billedAmount ?? 0) - 268) < 0.01)
    expect(ttg?.allowedAmount).toBeCloseTo(15.45, 2)
  })

  it('flags the denied line with its verbatim note', () => {
    const denied = lines.find((l) => Math.abs((l.billedAmount ?? 0) - 94) < 0.01)
    expect((denied?.noteFlags ?? []).some((n) => /not payable/i.test(n))).toBe(true)
    expect(denied?.status).toBe('denied')
  })

  it('totals true patient responsibility at ~$177 (not the billed amount)', () => {
    const total = lines.reduce((s, l) => s + (l.patientResponsibility ?? 0), 0)
    expect(total).toBeCloseTo(177.0, 1)
  })
})

describe('Bill ↔ EOB cross-document comparison', () => {
  const bill = buildBill()
  const eob = extractToCBS(EOB_TEXT, 'eob_1', 'eob')
  // Pin both documents to one episode so the normalizer compares them.
  bill.serviceEpisodeId = 'episode_test'
  eob.serviceEpisodeId = 'episode_test'

  const result = normalizeCBSSet([bill, eob])
  const discs: CBSDiscrepancy[] = result.crossDocumentDiscrepancies
  const byType = (t: CBSDiscrepancy['type']) => discs.filter((d) => d.type === t)

  it('emits ZERO false "code not adjudicated" findings', () => {
    expect(byType('code_mismatch')).toHaveLength(0)
    expect(discs.some((d) => /not adjudicated/i.test(d.valueB ?? ''))).toBe(false)
  })

  it('flags balance billing on the matched lines, quoting the EOB language', () => {
    const balanceBills = byType('balance_billing_violation')
    const hitFor = (billed: number) =>
      balanceBills.some((d) => d.valueA.includes(`$${billed.toFixed(2)}`))
    expect(hitFor(268)).toBe(true) // TTG: billed $268 vs allowed $15.45
    expect(hitFor(329)).toBe(true) // visit: billed $329 vs owe $161.55
    expect(
      balanceBills.some((d) => /should not bill you for any balance/i.test(d.description))
    ).toBe(true)
    expect(
      balanceBills.some((d) => d.applicableRegulations.some((r) => /No Surprises Act/i.test(r)))
    ).toBe(true)
  })

  it('flags the denied-but-billed line', () => {
    const denied = byType('denied_service_billed')
    expect(denied).toHaveLength(1)
    expect(denied.some((d) => /not payable/i.test(d.description))).toBe(true)
  })

  it('treats the EOB as the binding benchmark (no CLFS double-count)', () => {
    expect(bill.lineItems.every((l) => l.eobBenchmarked === true)).toBe(true)
    expect(byType('amount_mismatch')).toHaveLength(0)
  })
})

// A multi-claim EOB whose claims contain SEVERAL service rows each, in the
// 4-column layout (Amount Billed | Discounts and Reductions | Amount Covered
// (Allowed) | Your Total Costs). The detail rows carry no date of their own —
// the date of service is printed once on each claim header. Previously only
// single-line claims surfaced; multi-line rows fell through to "could not match",
// and the allowed column was misread as the discounts column.
const MULTICLAIM_EOB = `BLUE CROSS BLUE SHIELD — Explanation of Benefits
This is not a bill.

Member: JANE DOE     Member ID: ABC123456789
Plan: Commercial PPO

CLAIM DETAIL (3 of 5)   Claim Number: 30000001   Provider: Billings Clinic   Date of Service: 08/15/2024
Service Description       Amount Billed   Discounts and Reductions   Amount Covered (Allowed)   Your Total Costs
Laboratory Services      $43.00          $24.08                     $18.92                     $18.92
Laboratory Services      $94.00          $81.54                     $12.46                     $12.46
Laboratory Services      $64.00          $35.51                     $28.49                     $28.49
Laboratory Services      $268.00         $252.55                    $15.45                     $15.45
Claim Total              $469.00         $393.68                    $75.32                     $75.32

CLAIM DETAIL (4 of 5)   Claim Number: 30000002   Provider: Billings Clinic   Date of Service: 08/15/2024
Service Description       Amount Billed   Discounts and Reductions   Amount Covered (Allowed)   Your Total Costs
Laboratory Services      $365.00         $313.47                    $51.53                     $51.53
Laboratory Services      $94.00          $0.00                      $0.00                      $0.00    Not payable with the diagnosis billed

CLAIM DETAIL (5 of 5)   Claim Number: 30000003   Provider: Billings Clinic   Date of Service: 08/15/2024
Service Description       Amount Billed   Discounts and Reductions   Amount Covered (Allowed)   Your Total Costs
Laboratory Services      $33.00          $33.00                     $0.00                      $0.00

CLAIM DETAIL (1 of 5)   Claim Number: 30000004   Provider: Billings Clinic   Date of Service: 08/15/2024
Service Description       Amount Billed   Discounts and Reductions   Amount Covered (Allowed)   Your Total Costs
Medical Visits           $329.00         $152.86                    $176.14                    $50.00`

function buildMultiClaimBill() {
  const li = (cpt: string, desc: string, amt: number) => ({
    cpt_code: cpt,
    description: desc,
    date_of_service: '2024-08-15',
    units: 1,
    billed_amount: amt,
  })
  return billExtractionToCBS(
    {
      lineItems: [
        li('82728', 'Lab A', 43.0),
        li('83520', 'Lab B', 94.0),
        li('84443', 'Lab C', 64.0),
        li('86003', 'Lab D', 268.0),
        li('80053', 'Lab E', 365.0),
        li('36415', 'Lab F', 94.0),
        li('81002', 'Lab G', 33.0),
        li('99214', 'Office visit', 329.0),
      ],
      billMetadata: {
        provider_name: 'Billings Clinic',
        provider_npi: '',
        bill_date: '2024-09-10',
        patient_name: 'Jane Doe',
        account_number: 'ACCT-2',
      },
    },
    'bill_2'
  )
}

describe('Multi-line claims — extraction depth', () => {
  const lines = extractEOBLineItems(MULTICLAIM_EOB)

  it('captures every service row across every claim (8 line items, claim totals excluded)', () => {
    expect(lines).toHaveLength(8)
  })

  it('inherits the date of service from each claim header', () => {
    expect(lines.every((l) => l.serviceDate === '2024-08-15')).toBe(true)
  })

  it('reads the "Amount Covered (Allowed)" column, not the discounts column', () => {
    const visit = lines.find((l) => Math.abs((l.billedAmount ?? 0) - 329) < 0.01)
    expect(visit?.allowedAmount).toBeCloseTo(176.14, 2) // NOT 152.86 (discounts)
    expect(visit?.patientResponsibility).toBeCloseTo(50.0, 2)

    const fullyDiscounted = lines.find((l) => Math.abs((l.billedAmount ?? 0) - 33) < 0.01)
    expect(fullyDiscounted?.allowedAmount).toBeCloseTo(0.0, 2) // NOT 33 (the billed amount)
  })
})

describe('Multi-line claims — cross-document findings', () => {
  const bill = buildMultiClaimBill()
  const eob = extractToCBS(MULTICLAIM_EOB, 'eob_2', 'eob')
  bill.serviceEpisodeId = 'episode_multi'
  eob.serviceEpisodeId = 'episode_multi'

  const result = normalizeCBSSet([bill, eob])
  const discs = result.crossDocumentDiscrepancies
  const byType = (t: CBSDiscrepancy['type']) => discs.filter((d) => d.type === t)

  it('surfaces balance billing on ALL matchable lines, not just single-line claims', () => {
    // 4 labs (claim 3) + $365 (claim 4) + $33 (claim 5) + visit = 7 balance bills.
    expect(byType('balance_billing_violation')).toHaveLength(7)
    expect(byType('code_mismatch')).toHaveLength(0)
    // No bill line should fall through to a low-confidence "could not match".
    expect(byType('amount_mismatch')).toHaveLength(0)
  })

  it('flags the denied "not payable" $94 line exactly once', () => {
    expect(byType('denied_service_billed')).toHaveLength(1)
  })

  it('true patient responsibility ≈ $177 and balance billed is the bulk of ~$1.3k billed', () => {
    const trueResp = eob.lineItems.reduce((s, l) => s + (l.patientResponsibility ?? 0), 0)
    expect(trueResp).toBeCloseTo(177.0, 0) // 176.85

    const balanceBilled = byType('balance_billing_violation').reduce(
      (s, d) => s + d.estimatedDollarImpact,
      0
    )
    expect(balanceBilled).toBeGreaterThan(1000) // ~$1,019, vs ~$312 before the fix
  })
})
