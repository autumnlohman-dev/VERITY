// ─── Financial Outcome Prediction Engine ─────────────────────────────────────
// Patent Component O / Claim 16. Generates multi-dimensional forward-looking
// estimates for each discrepancy: expected recovery, resolution timeframe,
// escalation probability, collection probability, credit reporting probability,
// and a settlement range (floor/ceiling).
//
// HONESTY NOTE: v1 uses published-industry priors + rule-based entity
// adjustments. As Dispute Outcome Labels accumulate (lib/outcomes/store.ts),
// predictions blend in real outcome data and report their evidence base.

import type { NormalizedCBSSet, CBSDiscrepancy } from '../cbs/schema'
import { getAggregateStats } from '../outcomes/store'

export interface FinancialOutcomePrediction {
  discrepancyId: string
  discrepancyType: string
  expectedRecoveryAmount: number
  expectedRecoveryLow: number
  expectedRecoveryHigh: number
  estimatedResolutionDays: number
  escalationProbability: number // 0–1
  collectionProbability: number // 0–1 if unresolved
  creditReportingProbability: number // 0–1 if unresolved
  settlementFloor: number
  settlementCeiling: number
  recommendedOpeningPosition: number
  walkawayThreshold: number
  confidenceBasis: string // plain-English evidence statement
  basedOnRealOutcomes: number // count of real Dispute Outcome Labels informing this
}

// Industry priors by discrepancy type (recovery rate = fraction of disputed
// dollars typically recovered; sources: published payer appeal-reversal and
// billing-error remediation rates; refined by real outcomes as they accrue).
const TYPE_PRIORS: Record<string, { recoveryRate: number; days: number; escalation: number }> = {
  balance_billing_violation: { recoveryRate: 0.75, days: 35, escalation: 0.20 }, // NSA = strong federal protection
  duplicate_charge: { recoveryRate: 0.80, days: 25, escalation: 0.10 },
  amount_mismatch: { recoveryRate: 0.55, days: 40, escalation: 0.25 },
  code_mismatch: { recoveryRate: 0.50, days: 45, escalation: 0.30 },
  upcoding: { recoveryRate: 0.45, days: 50, escalation: 0.35 },
  unbundling: { recoveryRate: 0.50, days: 45, escalation: 0.30 },
  unauthorized_service: { recoveryRate: 0.40, days: 60, escalation: 0.45 },
  denial_without_authorization: { recoveryRate: 0.40, days: 60, escalation: 0.45 },
  collection_violation: { recoveryRate: 0.65, days: 30, escalation: 0.15 }, // FDCPA leverage
  credit_reporting_violation: { recoveryRate: 0.70, days: 35, escalation: 0.15 }, // FCRA leverage
  temporal_inconsistency: { recoveryRate: 0.45, days: 50, escalation: 0.30 },
}

const DEFAULT_PRIOR = { recoveryRate: 0.50, days: 45, escalation: 0.30 }

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

export function predictOutcome(
  discrepancy: CBSDiscrepancy,
  context: {
    hasActiveCollection?: boolean
    hasCreditReporting?: boolean
    documentCount: number
  }
): FinancialOutcomePrediction {
  const prior = TYPE_PRIORS[discrepancy.type] ?? DEFAULT_PRIOR
  const amount = Math.max(0, discrepancy.estimatedDollarImpact)

  // Blend with real outcome data when available (simple shrinkage:
  // weight real data by n/(n+20) so small samples don't dominate).
  const stats = getAggregateStats()
  const typeStats = stats.byDiscrepancyType[discrepancy.type]
  let recoveryRate = prior.recoveryRate
  let basedOnRealOutcomes = 0
  if (typeStats && typeStats.total >= 3) {
    const w = typeStats.total / (typeStats.total + 20)
    recoveryRate = (1 - w) * prior.recoveryRate + w * (typeStats.winRate / 100)
    basedOnRealOutcomes = typeStats.total
  }

  // Documentation completeness adjustment: multi-document cases dispute better.
  const docBoost = context.documentCount >= 3 ? 0.08 : context.documentCount === 2 ? 0.04 : 0
  recoveryRate = clamp01(recoveryRate + docBoost)

  // Confidence-score adjustment from the detection engine.
  recoveryRate = clamp01(recoveryRate * (0.7 + 0.3 * discrepancy.confidenceScore))

  const expected = Math.round(amount * recoveryRate)
  const low = Math.round(amount * Math.max(0, recoveryRate - 0.2))
  const high = Math.round(amount * Math.min(1, recoveryRate + 0.15))

  // Collection / credit probabilities if left unresolved.
  const collectionProbability = clamp01(
    (context.hasActiveCollection ? 0.9 : 0.35) + (amount > 2000 ? 0.1 : 0)
  )
  const creditReportingProbability = clamp01(
    context.hasCreditReporting ? 0.95 : collectionProbability * 0.6
  )

  // Settlement band: floor = what entities historically concede with minimal
  // fight; ceiling = strong-documentation outcome.
  const settlementFloor = Math.round(amount * Math.max(0.15, recoveryRate - 0.25))
  const settlementCeiling = Math.round(amount * Math.min(1, recoveryRate + 0.2))
  const recommendedOpeningPosition = Math.round(amount) // open at full disputed amount
  const walkawayThreshold = Math.round(amount * Math.max(0.1, recoveryRate - 0.3))

  const confidenceBasis =
    basedOnRealOutcomes > 0
      ? `Based on ${basedOnRealOutcomes} resolved VERITY dispute(s) of this type, blended with industry baselines.`
      : `Based on industry baselines for ${discrepancy.type.replace(/_/g, ' ')} disputes; will refine as VERITY outcome data accumulates.`

  return {
    discrepancyId: discrepancy.discrepancyId,
    discrepancyType: discrepancy.type,
    expectedRecoveryAmount: expected,
    expectedRecoveryLow: low,
    expectedRecoveryHigh: high,
    estimatedResolutionDays: prior.days,
    escalationProbability: clamp01(prior.escalation),
    collectionProbability,
    creditReportingProbability,
    settlementFloor,
    settlementCeiling,
    recommendedOpeningPosition,
    walkawayThreshold,
    confidenceBasis,
    basedOnRealOutcomes,
  }
}

export function predictAll(
  cbsSet: NormalizedCBSSet,
  context: { hasActiveCollection?: boolean; hasCreditReporting?: boolean }
): FinancialOutcomePrediction[] {
  return cbsSet.crossDocumentDiscrepancies.map(d =>
    predictOutcome(d, { ...context, documentCount: cbsSet.documents.length })
  )
}

export function aggregatePrediction(predictions: FinancialOutcomePrediction[]) {
  if (predictions.length === 0) return null
  return {
    totalExpectedRecovery: predictions.reduce((s, p) => s + p.expectedRecoveryAmount, 0),
    totalLow: predictions.reduce((s, p) => s + p.expectedRecoveryLow, 0),
    totalHigh: predictions.reduce((s, p) => s + p.expectedRecoveryHigh, 0),
    longestTimelineDays: Math.max(...predictions.map(p => p.estimatedResolutionDays)),
    settlementFloor: predictions.reduce((s, p) => s + p.settlementFloor, 0),
    settlementCeiling: predictions.reduce((s, p) => s + p.settlementCeiling, 0),
  }
}
