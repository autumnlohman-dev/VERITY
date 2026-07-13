import { describe, it, expect } from 'vitest'
import { hasNsaBasis, nsaFramingInstruction } from '../nsa'
import {
  buildSecondLevelAppeal,
  buildDoiComplaint,
  buildCreditBureauDisputes,
  buildCollectorValidation,
  buildCfpbEvidencePackage,
  type EscalationFacts,
} from '../escalationTemplates'
import { dedupeErrorsByLine, type BillingError } from '@/lib/errorDetection'

// ─── A1: NSA framing is conditional ──────────────────────────────────────────
describe('NSA framing gate (A1)', () => {
  it('a duplicate-charge-only case carries NO NSA basis and the prompt forbids citing it', () => {
    const errors = [{ rule_violated: 'CMS duplicate billing guidance, Medicare Claims Processing Manual' }]
    expect(hasNsaBasis(errors, [])).toBe(false)
    const instruction = nsaFramingInstruction(false, false)
    expect(instruction).toContain('do NOT cite the No Surprises Act')
    expect(instruction).not.toMatch(/^the No Surprises Act/)
  })

  it('a balance-billing finding enables NSA citation', () => {
    expect(hasNsaBasis([], [{ applicable_regulations: ['No Surprises Act, 42 U.S.C. 300gg-111'] }])).toBe(true)
    expect(nsaFramingInstruction(false, true)).toContain('No Surprises Act')
  })

  it('self-pay letters cite GFE protections by design', () => {
    expect(nsaFramingInstruction(true, false)).toContain('good-faith-estimate')
  })
})

// ─── A3: no double-listing ────────────────────────────────────────────────────
describe('per-line dedup notes the secondary finding (A3)', () => {
  it('a CPT flagged as overcharge AND unbundling appears once, secondary noted inside', () => {
    const mk = (error_type: string, explanation: string): BillingError =>
      ({ cpt_code: '80053', description: 'Metabolic panel', error_type, billed_amount: 400, expected_amount: 100, confidence: 'high', explanation, rule_violated: 'x' } as unknown as BillingError)
    const out = dedupeErrorsByLine([mk('overcharge', 'Charged above benchmark.'), mk('unbundling', 'Split from panel.')])
    expect(out).toHaveLength(1)
    expect(out[0].error_type).toBe('unbundling') // higher precedence wins
    expect(out[0].explanation).toContain('also flagged for overcharge')
    expect(out[0].explanation).toContain('not double-counted')
  })
})

// ─── C: golden-output tests for the deterministic templates ─────────────────
const FACTS: EscalationFacts = {
  providerName: 'City Medical Center',
  dateOfService: '2026-03-14',
  amountInDispute: 1340,
  patientState: 'MT',
  firstLetterDate: '2026-07-14T10:00:00.000Z',
  lobLetterId: 'ltr_abc123',
  responseReceivedAt: '2026-07-20T12:00:00.000Z',
  responseSummary: 'they upheld the charges without documentation',
  findings: [
    { cptCode: '80053', description: 'Metabolic panel', errorType: 'unbundling', correctionAmount: 300, ruleViolated: 'NCCI PTP edits' },
    { cptCode: '99285', description: 'ED visit level 5', errorType: 'overcharge', correctionAmount: 1040, ruleViolated: 'Medicare PFS benchmark' },
  ],
  collectorName: 'ABC Recovery LLC',
}

describe('escalation letter golden outputs (C1-C4)', () => {
  it('C1 second-level appeal: references the first letter, the response, findings, and benchmark framing', () => {
    const letter = buildSecondLevelAppeal(FACTS)
    expect(letter).toContain('SECOND-LEVEL DISPUTE')
    expect(letter).toContain('July 14, 2026') // first letter date
    expect(letter).toContain('ltr_abc123')
    expect(letter).toContain('they upheld the charges without documentation')
    expect(letter).toContain('TOTAL CORRECTION REQUESTED: $1,340.00')
    expect(letter).toContain('reasonableness benchmark')
    expect(letter).not.toMatch(/legally (required|entitled)/i) // A4
    expect(letter).not.toMatch(/[–—]/) // no em/en dashes in letter bodies
    expect(letter).toContain('[PATIENT NAME]')
  })

  it('C1 no-response variant states the silence', () => {
    const letter = buildSecondLevelAppeal({ ...FACTS, responseReceivedAt: null, responseSummary: null })
    expect(letter).toContain('no substantive response')
  })

  it('C2 DOI complaint routes MT to the Montana CSI; unsupported states refuse honestly', () => {
    const mt = buildDoiComplaint(FACTS)
    expect('letter' in mt && mt.letter).toContain('Montana Commissioner of Securities and Insurance')
    expect('letter' in mt && mt.letter).toContain('840 Helena Ave')
    const wy = buildDoiComplaint({ ...FACTS, patientState: 'WY' })
    expect('error' in wy && wy.error).toContain('not yet supported')
    const none = buildDoiComplaint({ ...FACTS, patientState: null })
    expect('error' in none).toBe(true)
  })

  it('C3 produces one FCRA letter per bureau with §611 language', () => {
    const letters = buildCreditBureauDisputes(FACTS)
    expect(letters.map((l) => l.bureau)).toEqual(['Equifax', 'Experian', 'TransUnion'])
    for (const l of letters) {
      expect(l.letter).toContain('Fair Credit Reporting Act')
      expect(l.letter).toContain('1681i')
      expect(l.letter).toContain('active, documented billing dispute')
      expect(l.letter).not.toMatch(/[–—]/)
    }
    expect(letters[0].letter).toContain('Atlanta, GA')
  })

  it('C4 collector letter requests FDCPA §809 validation and cites the active dispute', () => {
    const letter = buildCollectorValidation(FACTS)
    expect(letter).toContain('Fair Debt Collection Practices Act')
    expect(letter).toContain('1692g')
    expect(letter).toContain('ABC Recovery LLC')
    expect(letter).toContain('Cease collection activity until validation is provided')
    expect(letter).not.toMatch(/[–—]/)
  })

  it('CFPB package is documentation with self-file instructions, never a filing', () => {
    const pkg = buildCfpbEvidencePackage(FACTS, [{ letterType: 'first_dispute', date: '2026-07-14' }], [{ date: '2026-07-14', event: 'Dispute letter mailed' }])
    expect(pkg).toContain('a complaint you file yourself')
    expect(pkg).toContain('consumerfinance.gov/complaint')
    expect(pkg).toContain('LETTER HISTORY')
    expect(pkg).toContain('OUTCOME TIMELINE')
  })
})
