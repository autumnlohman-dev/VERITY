'use client'

// ─── Healthcare Financial Digital Twin ────────────────────────────────────────
// Patent Component P / Claim 15. A continuously updated computational model of
// the consumer's complete healthcare financial ecosystem, aggregated across all
// cases, providers, payers, workflows, and outcomes.
//
// v1 data substrate: Supabase case rows (passed in) + localStorage outcome
// labels + localStorage advocacy workflows. Updated on every dashboard load;
// future events projected from observed entity behavior.

import { getAllOutcomes } from '../outcomes/store'
import { getAllWorkflows } from '../agent/advocacyAgent'
import type { AdvocacyWorkflow } from '../agent/advocacyAgent'
import type { DisputeOutcomeLabel } from '../outcomes/store'

export interface TwinCaseInput {
  caseId: string
  providerName?: string
  insuranceType?: string
  createdAt?: string
  totalBilled?: number
  potentialSavings?: number
  errorCount?: number
  status?: string
}

export interface EntityRelationship {
  entityName: string
  entityType: 'provider' | 'payer'
  encounterCount: number
  totalBilled: number
  totalErrorsFound: number
  totalDisputed: number
  totalRecovered: number
  disputeWinRate: number | null // null until outcomes exist
  riskFlag: boolean // true when error rate across encounters is elevated
}

export interface ProjectedEvent {
  description: string
  probability: number
  estimatedAmount?: number
  basis: string
}

export interface DigitalTwin {
  generatedAt: string
  // Ecosystem aggregates
  totalEncounters: number
  totalBilledAllTime: number
  totalErrorsIdentified: number
  totalDollarsAtRisk: number
  totalRecovered: number
  openExposure: number // at-risk dollars on unresolved cases
  // Relationships
  providers: EntityRelationship[]
  payers: EntityRelationship[]
  // Activity
  activeWorkflows: AdvocacyWorkflow[]
  resolvedDisputes: number
  pendingDisputes: number
  // Forward-looking (Claim 41: predictive liability)
  projectedEvents: ProjectedEvent[]
  // Plain-language summary
  headline: string
}

function buildEntityMap(
  cases: TwinCaseInput[],
  outcomes: DisputeOutcomeLabel[],
  key: 'providerName' | 'insuranceType',
  type: 'provider' | 'payer'
): EntityRelationship[] {
  const map = new Map<string, EntityRelationship>()
  for (const c of cases) {
    const name = (c[key] || '').trim()
    if (!name) continue
    const e = map.get(name) ?? {
      entityName: name, entityType: type, encounterCount: 0, totalBilled: 0,
      totalErrorsFound: 0, totalDisputed: 0, totalRecovered: 0,
      disputeWinRate: null, riskFlag: false,
    }
    e.encounterCount += 1
    e.totalBilled += c.totalBilled ?? 0
    e.totalErrorsFound += c.errorCount ?? 0
    e.totalDisputed += c.potentialSavings ?? 0
    map.set(name, e)
  }
  // Fold in resolved outcomes per entity
  for (const o of outcomes) {
    const name = type === 'provider' ? o.providerName : o.payerName
    if (!name || !map.has(name)) continue
    const e = map.get(name)!
    if (o.status === 'won' || o.status === 'partial') {
      e.totalRecovered += o.amountRecovered ?? 0
    }
  }
  for (const e of map.values()) {
    const entityOutcomes = outcomes.filter(o =>
      (type === 'provider' ? o.providerName : o.payerName) === e.entityName &&
      ['won', 'partial', 'lost'].includes(o.status)
    )
    if (entityOutcomes.length > 0) {
      const wins = entityOutcomes.filter(o => o.status !== 'lost').length
      e.disputeWinRate = Math.round((wins / entityOutcomes.length) * 100)
    }
    // Risk flag: repeated encounters with errors on most of them
    e.riskFlag = e.encounterCount >= 2 && e.totalErrorsFound >= e.encounterCount
  }
  return [...map.values()].sort((a, b) => b.totalBilled - a.totalBilled)
}

function projectFutureEvents(
  providers: EntityRelationship[],
  payers: EntityRelationship[],
  openExposure: number
): ProjectedEvent[] {
  const events: ProjectedEvent[] = []

  for (const p of providers.filter(x => x.riskFlag)) {
    const avgError = p.encounterCount > 0 ? p.totalDisputed / p.encounterCount : 0
    events.push({
      description: `Future bills from ${p.entityName} are likely to contain errors`,
      probability: Math.min(0.9, 0.4 + p.totalErrorsFound / (p.encounterCount * 4)),
      estimatedAmount: Math.round(avgError),
      basis: `${p.totalErrorsFound} error(s) found across ${p.encounterCount} encounter(s) with this provider`,
    })
  }
  if (openExposure > 1000) {
    events.push({
      description: 'Unresolved disputed balances may be referred to collections',
      probability: 0.35,
      estimatedAmount: Math.round(openExposure),
      basis: 'Industry referral patterns for balances unresolved beyond 90 days',
    })
  }
  for (const py of payers.filter(x => x.disputeWinRate !== null && x.disputeWinRate < 40)) {
    events.push({
      description: `${py.entityName} disputes historically require escalation to external review`,
      probability: 0.5,
      basis: `Observed ${py.disputeWinRate}% first-pass win rate with this payer`,
    })
  }
  return events
}

export function buildDigitalTwin(cases: TwinCaseInput[]): DigitalTwin {
  const outcomes = getAllOutcomes()
  const workflows = getAllWorkflows()

  const providers = buildEntityMap(cases, outcomes, 'providerName', 'provider')
  const payers = buildEntityMap(cases, outcomes, 'insuranceType', 'payer')

  const totalBilledAllTime = cases.reduce((s, c) => s + (c.totalBilled ?? 0), 0)
  const totalErrorsIdentified = cases.reduce((s, c) => s + (c.errorCount ?? 0), 0)
  const totalDollarsAtRisk = cases.reduce((s, c) => s + (c.potentialSavings ?? 0), 0)
  const totalRecovered = outcomes
    .filter(o => o.status === 'won' || o.status === 'partial')
    .reduce((s, o) => s + (o.amountRecovered ?? 0), 0)

  const resolvedDisputes = outcomes.filter(o => ['won', 'partial', 'lost'].includes(o.status)).length
  const pendingDisputes = outcomes.filter(o => ['pending', 'in_progress'].includes(o.status)).length
  const openExposure = Math.max(0, totalDollarsAtRisk - totalRecovered)

  const activeWorkflows = workflows.filter(w => w.status === 'active')
  const projectedEvents = projectFutureEvents(providers, payers, openExposure)

  const headline =
    totalRecovered > 0
      ? `$${totalRecovered.toLocaleString()} recovered to date · $${openExposure.toLocaleString()} still at risk across ${cases.length} encounter(s)`
      : totalDollarsAtRisk > 0
      ? `$${totalDollarsAtRisk.toLocaleString()} at risk across ${cases.length} encounter(s) · ${activeWorkflows.length} active workflow(s)`
      : `${cases.length} encounter(s) tracked · no open financial exposure detected`

  return {
    generatedAt: new Date().toISOString(),
    totalEncounters: cases.length,
    totalBilledAllTime,
    totalErrorsIdentified,
    totalDollarsAtRisk,
    totalRecovered,
    openExposure,
    providers,
    payers,
    activeWorkflows,
    resolvedDisputes,
    pendingDisputes,
    projectedEvents,
    headline,
  }
}
