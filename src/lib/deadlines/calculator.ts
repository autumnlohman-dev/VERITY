import type { NormalizedCBSSet } from '../cbs/schema'

export type UrgencyLevel = 'critical' | 'high' | 'moderate' | 'informational' | 'missed'

export interface DeadlineResult {
  deadlineId: string
  deadlineType: string
  description: string
  triggerDate: string
  deadlineDate: string
  daysRemaining: number
  urgencyLevel: UrgencyLevel
  actionRequired: string
  escalationPath: string
  applicableRegulation: string
  estimatedRecovery?: number
}

interface DeadlineRule {
  ruleId: string
  deadlineType: string
  triggerEvent: string
  daysFromTrigger: number
  description: string
  actionRequired: string
  escalationPath: string
  federalBasis: string
}

const DEADLINE_RULES: DeadlineRule[] = [
  {
    ruleId: 'internal_appeal_commercial',
    deadlineType: 'Internal Insurance Appeal',
    triggerEvent: 'denial_date',
    daysFromTrigger: 180,
    description: 'File internal appeal with your insurance company',
    actionRequired: 'Submit a written appeal to your insurer via certified mail or the insurer portal. Include your EOB, itemized bill, and a copy of the denial letter.',
    escalationPath: 'If denied: file for External Independent Review within 4 months',
    federalBasis: 'ACA § 2719 (42 U.S.C. § 300gg-19) — right to internal appeal of denied claims',
  },
  {
    ruleId: 'external_review',
    deadlineType: 'External Independent Review',
    triggerEvent: 'denial_date',
    daysFromTrigger: 300,
    description: 'Request external independent review of denied claim',
    actionRequired: 'File for External Independent Review (IRO) through your state insurance commissioner or the federal process at HealthCare.gov.',
    escalationPath: 'If denied: file regulatory complaint with state DOI or CFPB',
    federalBasis: 'ACA § 2719 — right to external independent review after internal appeal exhausted',
  },
  {
    ruleId: 'nsa_balance_billing',
    deadlineType: 'No Surprises Act Balance Billing Dispute',
    triggerEvent: 'bill_date',
    daysFromTrigger: 120,
    description: 'Dispute balance billing violation under the No Surprises Act',
    actionRequired: 'Submit a written dispute to your insurer and the provider citing the No Surprises Act. Request the claim be processed at in-network cost-sharing.',
    escalationPath: 'File complaint with CMS at cms.gov/nosurprises or call 1-800-985-3059',
    federalBasis: 'No Surprises Act (42 U.S.C. § 300gg-111) — effective January 1, 2022',
  },
  {
    ruleId: 'fdcpa_validation',
    deadlineType: 'FDCPA Debt Validation Request',
    triggerEvent: 'collection_date',
    daysFromTrigger: 30,
    description: 'Request debt validation from collection agency under FDCPA',
    actionRequired: 'Send a written debt validation request via certified mail to the collection agency within 30 days of first contact. The collector must cease all collection activity until they provide validation.',
    escalationPath: 'File CFPB complaint at consumerfinance.gov/complaint if collector refuses to validate or continues contact',
    federalBasis: 'Fair Debt Collection Practices Act § 1692g (15 U.S.C. § 1692g)',
  },
  {
    ruleId: 'medicare_redetermination',
    deadlineType: 'Medicare Appeal — Redetermination',
    triggerEvent: 'eob_date',
    daysFromTrigger: 120,
    description: 'File Medicare Redetermination (first level of Medicare appeal)',
    actionRequired: 'Complete CMS Form 20027 or submit a written request to the Medicare Administrative Contractor (MAC) that processed the claim.',
    escalationPath: 'If denied: file Reconsideration with Qualified Independent Contractor within 180 days',
    federalBasis: 'Medicare Claims Processing Manual (Pub. 100-04), Ch. 29 — Medicare appeals process',
  },
  {
    ruleId: 'prior_auth_appeal',
    deadlineType: 'Prior Authorization Denial Appeal',
    triggerEvent: 'denial_date',
    daysFromTrigger: 60,
    description: 'Appeal denial of prior authorization',
    actionRequired: 'File a written appeal with clinical documentation supporting medical necessity. Request a peer-to-peer review between your physician and the insurer\'s medical reviewer.',
    escalationPath: 'If denied: request external independent medical review; file state DOI complaint',
    federalBasis: 'ACA § 2719 — right to appeal coverage denials including prior authorization denials',
  },
  {
    ruleId: 'fcra_dispute',
    deadlineType: 'FCRA Credit Report Dispute',
    triggerEvent: 'collection_date',
    daysFromTrigger: 30,
    description: 'Dispute medical debt on credit report under FCRA',
    actionRequired: 'Send written dispute letters to all three credit bureaus (Equifax, Experian, TransUnion) by certified mail. Bureaus must investigate within 30 days.',
    escalationPath: 'If not resolved: file CFPB complaint; consider disputing with CFPB medical debt rules (debts under $500 may be removed)',
    federalBasis: 'Fair Credit Reporting Act § 1681i (15 U.S.C. § 1681i) — right to dispute inaccurate credit information',
  },
]

// Self-pay / uninsured patients have no insurer, so the default NSA balance-
// billing guidance ("submit to your insurer / request in-network cost-sharing")
// is wrong for them. Their No Surprises Act protection is the Good Faith
// Estimate + the federal Patient-Provider Dispute Resolution (PPDR) process.
// Same branch the letter-page submission guide uses (SELF_PAY_SUBMISSION_OPTIONS).
const NSA_SELF_PAY = {
  deadlineType: 'No Surprises Act — Good Faith Estimate Dispute',
  description: 'Dispute a self-pay bill that exceeds your Good Faith Estimate',
  actionRequired:
    'If your final bill is at least $400 more than your Good Faith Estimate, file a dispute through the federal Patient-Provider Dispute Resolution (PPDR) process at cms.gov/nosurprises (or call 1-800-985-3059), generally within 120 days of the bill. First request a fully itemized statement and the provider\'s self-pay / financial-assistance policy in writing.',
  escalationPath: 'Submit the PPDR dispute at cms.gov/nosurprises or call 1-800-985-3059',
  federalBasis:
    'No Surprises Act — Good Faith Estimate & Patient-Provider Dispute Resolution (45 C.F.R. §§ 149.610, 149.620)',
}

// Resolve a rule's patient-facing content, branching the NSA rule for self-pay.
function resolveRule(rule: DeadlineRule, selfPay: boolean) {
  if (selfPay && rule.ruleId === 'nsa_balance_billing') {
    return {
      deadlineType: NSA_SELF_PAY.deadlineType,
      description: NSA_SELF_PAY.description,
      actionRequired: NSA_SELF_PAY.actionRequired,
      escalationPath: NSA_SELF_PAY.escalationPath,
      federalBasis: NSA_SELF_PAY.federalBasis,
    }
  }
  return {
    deadlineType: rule.deadlineType,
    description: rule.description,
    actionRequired: rule.actionRequired,
    escalationPath: rule.escalationPath,
    federalBasis: rule.federalBasis,
  }
}

function addDays(dateStr: string, days: number): string {
  try {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch {
    return dateStr
  }
}

function daysUntilDate(dateStr: string): number {
  try {
    const target = new Date(dateStr).getTime()
    const now = Date.now()
    return Math.round((target - now) / (1000 * 60 * 60 * 24))
  } catch {
    return 999
  }
}

function classifyUrgency(daysRemaining: number): UrgencyLevel {
  if (daysRemaining < 0) return 'missed'
  if (daysRemaining <= 7) return 'critical'
  if (daysRemaining <= 30) return 'high'
  if (daysRemaining <= 90) return 'moderate'
  return 'informational'
}

export function calculateDeadlines(
  cbsSet: NormalizedCBSSet,
  opts?: { selfPay?: boolean }
): DeadlineResult[] {
  const selfPay = opts?.selfPay ?? false
  const results: DeadlineResult[] = []
  const seen = new Set<string>()

  for (const doc of cbsSet.documents) {
    const triggerDates: Record<string, string | undefined> = {
      denial_date: doc.denialDate,
      eob_date: doc.eobDate,
      bill_date: doc.billDate,
      collection_date: doc.collectionDate,
    }

    // Also check if explicit appeal deadline is set
    if (doc.appealDeadline) {
      const days = daysUntilDate(doc.appealDeadline)
      const key = `explicit_${doc.sourceDocumentId}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({
          deadlineId: crypto.randomUUID(),
          deadlineType: 'Appeal Deadline (from document)',
          description: 'Appeal deadline explicitly stated in your document',
          triggerDate: doc.billDate || doc.denialDate || '',
          deadlineDate: doc.appealDeadline,
          daysRemaining: days,
          urgencyLevel: classifyUrgency(days),
          actionRequired: 'File your appeal before this date. Contact your insurer or provider immediately.',
          escalationPath: 'If missed, contact a patient advocate or healthcare attorney',
          applicableRegulation: 'Per your insurance plan documents',
        })
      }
    }

    for (const rule of DEADLINE_RULES) {
      const triggerDate = triggerDates[rule.triggerEvent]
      if (!triggerDate) continue

      // Only apply relevant rules based on document type
      if (rule.triggerEvent === 'collection_date' && doc.sourceDocumentType !== 'collection_notice') continue
      if (rule.triggerEvent === 'denial_date' && doc.sourceDocumentType !== 'denial_letter' && doc.adjudicationStatus !== 'denied') continue
      if (rule.triggerEvent === 'eob_date' && doc.sourceDocumentType !== 'eob') continue
      if (rule.triggerEvent === 'bill_date' && doc.sourceDocumentType !== 'itemized_bill') continue

      const dedupeKey = `${rule.ruleId}_${triggerDate}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const deadlineDate = addDays(triggerDate, rule.daysFromTrigger)
      const daysRemaining = daysUntilDate(deadlineDate)
      const urgencyLevel = classifyUrgency(daysRemaining)

      // Skip informational deadlines that have years left — reduce noise
      if (urgencyLevel === 'informational' && daysRemaining > 365) continue

      const content = resolveRule(rule, selfPay)
      results.push({
        deadlineId: crypto.randomUUID(),
        deadlineType: content.deadlineType,
        description: content.description,
        triggerDate,
        deadlineDate,
        daysRemaining,
        urgencyLevel,
        actionRequired: content.actionRequired,
        escalationPath: content.escalationPath,
        applicableRegulation: content.federalBasis,
        estimatedRecovery: doc.totalBilled || doc.totalPatientResponsibility,
      })
    }

    // Balance billing: check for NSA violation discrepancy
    const hasBalanceBillingViolation = cbsSet.crossDocumentDiscrepancies.some(
      d => d.type === 'balance_billing_violation'
    )
    if (hasBalanceBillingViolation && doc.billDate) {
      const rule = DEADLINE_RULES.find(r => r.ruleId === 'nsa_balance_billing')!
      const content = resolveRule(rule, selfPay)
      const dedupeKey = `nsa_${doc.billDate}`
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey)
        const deadlineDate = addDays(doc.billDate, rule.daysFromTrigger)
        const daysRemaining = daysUntilDate(deadlineDate)
        results.push({
          deadlineId: crypto.randomUUID(),
          deadlineType: content.deadlineType,
          description: content.description,
          triggerDate: doc.billDate,
          deadlineDate,
          daysRemaining,
          urgencyLevel: classifyUrgency(daysRemaining),
          actionRequired: content.actionRequired,
          escalationPath: content.escalationPath,
          applicableRegulation: content.federalBasis,
          estimatedRecovery: cbsSet.crossDocumentDiscrepancies
            .filter(d => d.type === 'balance_billing_violation')
            .reduce((sum, d) => sum + d.estimatedDollarImpact, 0),
        })
      }
    }
  }

  // Sort: missed first, then by days remaining ascending
  return results.sort((a, b) => {
    if (a.urgencyLevel === 'missed' && b.urgencyLevel !== 'missed') return -1
    if (b.urgencyLevel === 'missed' && a.urgencyLevel !== 'missed') return 1
    return a.daysRemaining - b.daysRemaining
  })
}
