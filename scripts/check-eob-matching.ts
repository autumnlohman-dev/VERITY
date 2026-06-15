/**
 * Standalone regression check for the bill ↔ EOB cross-document matcher.
 *
 * Run:  npx tsx scripts/check-eob-matching.ts
 *
 * Deliberately NOT a vitest test: this file lives in scripts/ (excluded from the
 * Next production build typecheck) so a check fixture can never break `next
 * build`. It asserts the per-line balance-billing results the matcher must
 * produce, then exits non-zero on any failure.
 *
 * Fixture = the CANONICAL pipe-delimited table the EOB vision transcription now
 * emits (see EOB_TRANSCRIBE_SYSTEM in src/lib/cbs/eobExtractor.ts). It is the
 * normalized form of a real Billings Clinic commercial-PPO EOB whose native
 * layout has NINE money columns:
 *
 *   Amount Billed | Discounts and Reductions | Amount Covered (Allowed) |
 *   Health Plan Responsibility | Deductible Amount | Copay Amount | Coinsurance |
 *   Amount Not Covered | Your Total Costs
 *
 * The vision model maps those nine source columns down to the three that matter —
 * amount_billed (match key), allowed_amount ("Amount Covered (Allowed)"), and
 * patient_responsibility ("Your Total Costs") — and the parser then resolves them
 * STRICTLY by header name. The old 4-column positional fallback misread this
 * layout and dropped every line to "could not confidently match".
 */
import { extractEOBLineItems, extractToCBS, billExtractionToCBS } from '../src/lib/cbs/extractor'
import { normalizeCBSSet } from '../src/lib/cbs/normalizer'
import type { CBSDiscrepancy, CBSLineItem } from '../src/lib/cbs/schema'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
function near(a: number | undefined, b: number, eps = 0.01): boolean {
  return a !== undefined && Math.abs(a - b) <= eps
}

// The EOB as the vision layer now normalizes it: canonical header, one row per
// service line across every claim, no total rows, numeric values without "$".
const EOB_CANONICAL = `Claim Number: 30000001
Provider: Billings Clinic
Member ID: ABC123456789
Date of Service: 08/15/2024
Processed/EOB Date: 09/02/2024

claim_ref | service_description | service_date | amount_billed | allowed_amount | patient_responsibility | flag
30000001 | Laboratory Services | 08/15/2024 | 43.00 | 18.92 | 18.92 |
30000001 | Laboratory Services | 08/15/2024 | 94.00 | 12.46 | 12.46 |
30000001 | Laboratory Services | 08/15/2024 | 64.00 | 28.49 | 28.49 |
30000001 | Laboratory Services | 08/15/2024 | 268.00 | 15.45 | 15.45 |
30000002 | Laboratory Services | 08/15/2024 | 365.00 | 51.53 | 51.53 |
30000002 | Laboratory Services | 08/15/2024 | 94.00 | 0.00 | 0.00 | Not payable with the diagnosis billed
30000003 | Laboratory Services | 08/15/2024 | 33.00 | 0.00 | 0.00 |
30000004 | Medical Visits | 08/15/2024 | 329.00 | 176.14 | 50.00 |`

// The itemized bill carries CPT codes; the EOB does not. Matching pairs them by
// amount_billed + service_date, never by demanding the EOB carry codes.
function buildBill() {
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
        li('86003', 'Lab D (TTG)', 268.0),
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
        account_number: 'ACCT-1',
      },
    },
    'bill_1'
  )
}

console.log('EOB extraction (canonical header, resolved strictly by name)')
const lines = extractEOBLineItems(EOB_CANONICAL)
check('captures every service row, claim totals excluded (8)', lines.length === 8, `got ${lines.length}`)
check('every row inherits/keeps the service date', lines.every((l) => l.serviceDate === '2024-08-15'))
check('no CPT code invented from the EOB', lines.every((l) => !l.cptCode))

const findLine = (billed: number, denied = false): CBSLineItem | undefined =>
  lines.find((l) => near(l.billedAmount, billed) && (l.status === 'denied') === denied)

// "owe" = patient_responsibility (the "Your Total Costs" column), read by header.
const oweExpectations: Array<{ billed: number; owe: number; denied?: boolean }> = [
  { billed: 329, owe: 50.0 },
  { billed: 268, owe: 15.45 },
  { billed: 43, owe: 18.92 },
  { billed: 64, owe: 28.49 },
  { billed: 94, owe: 12.46 },
  { billed: 94, owe: 0.0, denied: true },
  { billed: 33, owe: 0.0 },
]
for (const { billed, owe, denied } of oweExpectations) {
  const line = findLine(billed, denied ?? false)
  check(
    `$${billed} line: patient owes $${owe}${denied ? ' (denied)' : ''}`,
    near(line?.patientResponsibility, owe),
    `got ${line?.patientResponsibility}`
  )
}

// The visit's allowed must be the "Amount Covered" figure (176.14), NOT the
// discount (152.86); the $33 line's allowed is 0, NOT the billed amount.
check('visit allowed = 176.14 (not the discount)', near(findLine(329)?.allowedAmount, 176.14))
check('$33 allowed = 0.00 (not the billed amount)', near(findLine(33)?.allowedAmount, 0.0))
check('denied $94 carries its verbatim note', /not payable/i.test(findLine(94, true)?.noteFlags?.[0] ?? ''))

const trueResp = lines.reduce((s, l) => s + (l.patientResponsibility ?? 0), 0)
check('true patient responsibility ~ $177', near(trueResp, 176.85, 0.5), `got ${trueResp.toFixed(2)}`)

console.log('\nBill ↔ EOB cross-document findings')
const bill = buildBill()
const eob = extractToCBS(EOB_CANONICAL, 'eob_1', 'eob')
bill.serviceEpisodeId = 'episode_1'
eob.serviceEpisodeId = 'episode_1'

const discs: CBSDiscrepancy[] = normalizeCBSSet([bill, eob]).crossDocumentDiscrepancies
const byType = (t: CBSDiscrepancy['type']) => discs.filter((d) => d.type === t)

check('balance billing on all 7 matchable lines', byType('balance_billing_violation').length === 7, `got ${byType('balance_billing_violation').length}`)
check('denied-but-billed flagged exactly once', byType('denied_service_billed').length === 1, `got ${byType('denied_service_billed').length}`)
check('zero false "code not adjudicated"', byType('code_mismatch').length === 0)
check('zero "could not confidently match"', byType('amount_mismatch').length === 0, `got ${byType('amount_mismatch').length}`)

const balanceBilled = byType('balance_billing_violation').reduce((s, d) => s + d.estimatedDollarImpact, 0)
check('total balance billed > $1,000', balanceBilled > 1000, `got $${balanceBilled.toFixed(2)}`)

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nAll EOB matcher checks passed.')
