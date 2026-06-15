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
