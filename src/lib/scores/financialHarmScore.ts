import type { NormalizedCBSSet } from '../cbs/schema'
import type { DeadlineResult } from '../deadlines/calculator'

export interface FHSUserInputs {
  hasActiveCollectionActivity: boolean
  hasCreditReportingImpact: boolean
  hasInsuranceDenial: boolean
  estimatedMonthlyIncome?: number
}

// The case's real dollar stakes, so the score reflects what the patient actually
// faces — not just what the cross-document CBS layer happened to compute (which
// is $0 for a single self-pay bill, where billExtractionToCBS never sets a
// patient-responsibility figure).
export interface CaseStakes {
  amountBilled?: number
  potentialSavings?: number
  // Outstanding balance the patient is actually being asked to pay, when known.
  patientResponsibility?: number
  isSelfPay?: boolean
}

export interface FHSComponent {
  name: string
  weight: number
  rawValue: number
  normalizedScore: number
  description: string
}

export interface FinancialHarmScore {
  score: number // 0-1000
  tier: 'low' | 'moderate' | 'high' | 'severe'
  tierLabel: string
  tierDescription: string
  totalDollarAtRisk: number
  components: FHSComponent[]
  topRisks: string[]
  recommendedActions: string[]
}

function normalizeDollarAmount(amount: number): number {
  // More sensitive across the $1k–5k band: for most households a ~$2k medical
  // bill is a serious stake, not a "dispute when convenient" footnote.
  if (amount <= 0) return 0
  if (amount >= 10000) return 100
  if (amount >= 5000) return 85
  if (amount >= 2500) return 70
  if (amount >= 1500) return 60
  if (amount >= 1000) return 50
  if (amount >= 500) return 30
  if (amount >= 100) return 15
  return 8
}

function normalizeDeadlineUrgency(deadlines: DeadlineResult[]): number {
  if (deadlines.length === 0) return 0
  const mostUrgent = deadlines[0]
  switch (mostUrgent.urgencyLevel) {
    case 'missed': return 100
    case 'critical': return 100
    case 'high': return 70
    case 'moderate': return 40
    case 'informational': return 10
  }
}

function regulatoryStrength(cbsSet: NormalizedCBSSet): number {
  const regs = cbsSet.crossDocumentDiscrepancies.flatMap(d => d.applicableRegulations).join(' ').toLowerCase()
  if (regs.includes('no surprises act') || regs.includes('fdcpa') || regs.includes('fcra')) return 80
  if (regs.includes('aca') || regs.includes('erisa')) return 60
  if (cbsSet.crossDocumentDiscrepancies.length > 0) return 40
  return 20
}

export function calculateFinancialHarmScore(
  cbsSet: NormalizedCBSSet,
  deadlines: DeadlineResult[],
  userInputs: FHSUserInputs,
  caseStakes?: CaseStakes
): FinancialHarmScore {
  // What the CBS cross-document layer derived (EOB patient-responsibility +
  // cross-document discrepancy impact). This is $0 for a single self-pay bill.
  const cbsDerived = cbsSet.totalDollarAtRisk +
    cbsSet.documents.reduce((sum, d) => sum + (d.totalPatientResponsibility || 0), 0)

  // What the actual case says is at stake. For a self-pay patient the whole
  // outstanding bill is their exposure (they owe it all); for an insured patient
  // it's the disputed overcharge / balance-billed amount. Use the patient's
  // known outstanding responsibility when we have it, else the billed total.
  const billed = Math.max(0, caseStakes?.amountBilled ?? 0)
  const savings = Math.max(0, caseStakes?.potentialSavings ?? 0)
  const patientResp = Math.max(0, caseStakes?.patientResponsibility ?? 0)
  const caseAtRisk = caseStakes?.isSelfPay
    ? Math.max(patientResp, billed)
    : Math.max(patientResp, savings)

  const totalDollarAtRisk = Math.max(cbsDerived, caseAtRisk)

  const components: FHSComponent[] = [
    {
      name: 'Dollar Amount in Dispute',
      weight: 30,
      rawValue: totalDollarAtRisk,
      normalizedScore: normalizeDollarAmount(totalDollarAtRisk),
      description: `$${totalDollarAtRisk.toFixed(2)} identified at risk across all documents`,
    },
    {
      name: 'Active Collection Activity',
      weight: 20,
      rawValue: userInputs.hasActiveCollectionActivity ? 1 : 0,
      normalizedScore: userInputs.hasActiveCollectionActivity ? 100 : 0,
      description: userInputs.hasActiveCollectionActivity
        ? 'Active collection notices detected, immediate action required'
        : 'No active collection activity reported',
    },
    {
      name: 'Appeal Deadline Urgency',
      weight: 20,
      rawValue: deadlines.length,
      normalizedScore: normalizeDeadlineUrgency(deadlines),
      description: deadlines.length > 0
        ? `${deadlines.length} deadline(s) detected, most urgent: ${deadlines[0]?.urgencyLevel}`
        : 'No time-sensitive deadlines detected',
    },
    {
      name: 'Credit Reporting Exposure',
      weight: 15,
      rawValue: userInputs.hasCreditReportingImpact ? 1 : 0,
      normalizedScore: userInputs.hasCreditReportingImpact ? 100 : 0,
      description: userInputs.hasCreditReportingImpact
        ? 'Medical debt appearing on credit report, potential score impact'
        : 'No credit reporting impact reported',
    },
    {
      name: 'Insurance Coverage Denial',
      weight: 10,
      rawValue: userInputs.hasInsuranceDenial ? 1 : 0,
      normalizedScore: userInputs.hasInsuranceDenial ? 100 : 0,
      description: userInputs.hasInsuranceDenial
        ? 'Insurance denial on file, appeal rights active'
        : 'No coverage denial reported',
    },
    {
      name: 'Regulatory Protection Strength',
      weight: 5,
      rawValue: cbsSet.crossDocumentDiscrepancies.length,
      normalizedScore: regulatoryStrength(cbsSet),
      description: cbsSet.crossDocumentDiscrepancies.length > 0
        ? `${cbsSet.crossDocumentDiscrepancies.length} discrepancy(s) with applicable federal protections`
        : 'No cross-document discrepancies identified (single document analysis)',
    },
  ]

  const score = Math.round(
    components.reduce((sum, c) => sum + (c.normalizedScore * c.weight) / 100, 0) * 10
  )

  let tier: FinancialHarmScore['tier']
  let tierLabel: string
  let tierDescription: string

  if (score <= 250) {
    tier = 'low'
    tierLabel = 'LOW RISK'
    tierDescription = 'Some errors found, dispute when convenient'
  } else if (score <= 500) {
    tier = 'moderate'
    tierLabel = 'MODERATE RISK'
    tierDescription = 'Significant overcharges, act within 30 days'
  } else if (score <= 750) {
    tier = 'high'
    tierLabel = 'HIGH RISK'
    tierDescription = 'Serious violations, act within 7 days'
  } else {
    tier = 'severe'
    tierLabel = 'SEVERE RISK'
    tierDescription = 'Critical situation, act immediately'
  }

  // Build top risks
  const topRisks: string[] = []
  if (totalDollarAtRisk > 0) topRisks.push(`$${totalDollarAtRisk.toFixed(2)} in potential overcharges identified across your documents`)
  if (userInputs.hasActiveCollectionActivity) topRisks.push('Active collection activity may affect your credit score and add fees if not addressed immediately')
  if (deadlines.some(d => d.urgencyLevel === 'critical' || d.urgencyLevel === 'missed')) topRisks.push('Critical appeal deadlines detected, missing these windows permanently forfeits your right to dispute')
  if (userInputs.hasCreditReportingImpact) topRisks.push('Medical debt on your credit report can reduce your credit score by 50-100 points and can be disputed')
  if (cbsSet.crossDocumentDiscrepancies.some(d => d.type === 'balance_billing_violation')) topRisks.push('Balance billing violation detected, you may have been charged above your contracted insurance rate in violation of the No Surprises Act')

  // Build recommended actions
  const recommendedActions: string[] = []
  const criticalDeadline = deadlines.find(d => d.urgencyLevel === 'critical' || d.urgencyLevel === 'missed')
  if (criticalDeadline) recommendedActions.push(`URGENT: ${criticalDeadline.actionRequired}`)
  if (userInputs.hasActiveCollectionActivity) recommendedActions.push('Send FDCPA debt validation letter to collection agency via certified mail to pause collection activity')
  if (userInputs.hasCreditReportingImpact) recommendedActions.push('Dispute medical debt with all three credit bureaus under FCRA § 1681i, bureaus must investigate within 30 days')
  if (cbsSet.crossDocumentDiscrepancies.length > 0) recommendedActions.push('Download your evidentiary package and submit dispute to your insurer or provider with the included regulatory citations')
  if (recommendedActions.length === 0) recommendedActions.push('Review the errors found and file a dispute with your provider using the generated dispute package')

  return {
    score,
    tier,
    tierLabel,
    tierDescription,
    totalDollarAtRisk,
    components,
    topRisks: topRisks.slice(0, 3),
    recommendedActions: recommendedActions.slice(0, 3),
  }
}
