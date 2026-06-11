'use client'

// ─── Autonomous Advocacy Agent ────────────────────────────────────────────────
// Patent Component N / Claims 13–14. Trigger detection → Advocacy Action
// selection → Workflow generation → execution → monitoring → termination.
//
// v1 execution model: the agent generates every document and sequences every
// step; transmission is consumer-performed (download/send) until certified
// mail / portal integrations land. Workflow state persists in localStorage.

import type { NormalizedCBSSet, CBSDiscrepancy } from '../cbs/schema'
import type { DeadlineResult } from '../deadlines/calculator'
import type { FinancialOutcomePrediction } from '../predictions/outcomePrediction'

export type TriggerType =
  | 'billing_discrepancy'
  | 'regulatory_violation'
  | 'financial_risk'
  | 'recovery_opportunity'
  | 'deadline_urgency'

export type ActionType =
  | 'provider_dispute_letter'
  | 'insurer_appeal'
  | 'nsa_dispute'
  | 'fdcpa_validation_letter'
  | 'fcra_credit_dispute'
  | 'regulatory_complaint'
  | 'escalation_letter'
  | 'settlement_proposal'
  | 'follow_up'

export type ActionStatus = 'planned' | 'ready' | 'sent' | 'response_received' | 'completed' | 'skipped'
export type WorkflowStatus = 'active' | 'resolved' | 'settled' | 'escalated' | 'abandoned' | 'deadline_expired'

export interface AdvocacyTrigger {
  triggerId: string
  type: TriggerType
  sourceDiscrepancyId?: string
  description: string
  estimatedImpact: number
  urgency: 'critical' | 'high' | 'moderate' | 'low'
}

export interface AdvocacyAction {
  actionId: string
  type: ActionType
  title: string
  description: string
  recipient: string
  sequenceOrder: number
  parallel: boolean // can run alongside same-order actions
  status: ActionStatus
  daysToWaitForResponse: number
  regulatoryBasis?: string
  plannedAt: string
  sentAt?: string
  responseAt?: string
  responseSummary?: string
}

export interface AdvocacyWorkflow {
  workflowId: string
  caseId: string
  createdAt: string
  status: WorkflowStatus
  triggers: AdvocacyTrigger[]
  actions: AdvocacyAction[]
  currentStep: number
  totalDollarAtStake: number
  expectedRecovery: number
  terminationReason?: string
  consumerAuthorized: boolean
}

function uid(): string {
  return typeof window === 'undefined' ? `id_${Date.now()}` : crypto.randomUUID()
}

// ─── Trigger detection (Claim 13: advocacy trigger module) ───────────────────

export function detectTriggers(
  cbsSet: NormalizedCBSSet,
  deadlines: DeadlineResult[]
): AdvocacyTrigger[] {
  const triggers: AdvocacyTrigger[] = []

  for (const d of cbsSet.crossDocumentDiscrepancies) {
    const isRegulatory = d.applicableRegulations.length > 0
    triggers.push({
      triggerId: uid(),
      type: isRegulatory ? 'regulatory_violation' : 'billing_discrepancy',
      sourceDiscrepancyId: d.discrepancyId,
      description: d.description,
      estimatedImpact: d.estimatedDollarImpact,
      urgency: d.severity === 'critical' ? 'critical' : d.severity === 'high' ? 'high' : 'moderate',
    })
  }

  for (const dl of deadlines) {
    if (dl.urgencyLevel === 'critical' || dl.urgencyLevel === 'missed') {
      triggers.push({
        triggerId: uid(),
        type: 'deadline_urgency',
        description: `${dl.deadlineType}: ${dl.daysRemaining < 0 ? 'MISSED' : `${dl.daysRemaining} days remaining`}`,
        estimatedImpact: dl.estimatedRecovery ?? 0,
        urgency: 'critical',
      })
    }
  }

  return triggers.sort((a, b) => b.estimatedImpact - a.estimatedImpact)
}

// ─── Action selection + workflow generation (Claims 13–14) ───────────────────

function actionsForDiscrepancy(d: CBSDiscrepancy, order: number): AdvocacyAction[] {
  const base = {
    plannedAt: new Date().toISOString(),
    status: 'planned' as ActionStatus,
  }
  const actions: AdvocacyAction[] = []

  switch (d.type) {
    case 'balance_billing_violation':
      actions.push({
        ...base, actionId: uid(), type: 'nsa_dispute', sequenceOrder: order, parallel: true,
        title: 'No Surprises Act dispute to provider',
        description: `Dispute the $${d.estimatedDollarImpact.toFixed(0)} balance-billed amount citing 42 U.S.C. § 300gg-111; demand reprocessing at in-network cost-sharing.`,
        recipient: 'Provider billing department', daysToWaitForResponse: 30,
        regulatoryBasis: 'No Surprises Act',
      })
      actions.push({
        ...base, actionId: uid(), type: 'insurer_appeal', sequenceOrder: order, parallel: true,
        title: 'Parallel appeal to insurer',
        description: 'Request claim reprocessing and corrected EOB reflecting NSA protections.',
        recipient: 'Insurance carrier appeals department', daysToWaitForResponse: 30,
        regulatoryBasis: 'ACA § 2719',
      })
      actions.push({
        ...base, actionId: uid(), type: 'regulatory_complaint', sequenceOrder: order + 1, parallel: false,
        title: 'CMS No Surprises complaint (if unresolved)',
        description: 'Escalate to CMS at cms.gov/nosurprises if provider/insurer fail to correct within response window.',
        recipient: 'CMS', daysToWaitForResponse: 45,
        regulatoryBasis: 'No Surprises Act enforcement',
      })
      break

    case 'collection_violation':
      actions.push({
        ...base, actionId: uid(), type: 'fdcpa_validation_letter', sequenceOrder: order, parallel: false,
        title: 'FDCPA debt validation demand',
        description: 'Certified-mail validation request under 15 U.S.C. § 1692g; collection must pause pending validation.',
        recipient: 'Collection agency', daysToWaitForResponse: 30,
        regulatoryBasis: 'FDCPA § 1692g',
      })
      actions.push({
        ...base, actionId: uid(), type: 'regulatory_complaint', sequenceOrder: order + 1, parallel: false,
        title: 'CFPB complaint (if collector persists)',
        description: 'File at consumerfinance.gov/complaint if collection continues without validation.',
        recipient: 'CFPB', daysToWaitForResponse: 30,
        regulatoryBasis: 'FDCPA enforcement',
      })
      break

    case 'credit_reporting_violation':
      actions.push({
        ...base, actionId: uid(), type: 'fcra_credit_dispute', sequenceOrder: order, parallel: true,
        title: 'FCRA disputes to all three bureaus',
        description: 'Dispute the reported medical debt under 15 U.S.C. § 1681i; bureaus must investigate within 30 days.',
        recipient: 'Equifax, Experian, TransUnion', daysToWaitForResponse: 30,
        regulatoryBasis: 'FCRA § 1681i',
      })
      break

    case 'denial_without_authorization':
    case 'unauthorized_service':
      actions.push({
        ...base, actionId: uid(), type: 'insurer_appeal', sequenceOrder: order, parallel: false,
        title: 'Internal appeal with medical-necessity documentation',
        description: 'Appeal the denial; request the specific authorization requirement relied upon and a peer-to-peer review.',
        recipient: 'Insurance carrier appeals department', daysToWaitForResponse: 30,
        regulatoryBasis: 'ACA § 2719 / ERISA § 502(a)',
      })
      actions.push({
        ...base, actionId: uid(), type: 'escalation_letter', sequenceOrder: order + 1, parallel: false,
        title: 'External independent review (if appeal denied)',
        description: 'File for External Review through the state DOI or federal process.',
        recipient: 'Independent Review Organization', daysToWaitForResponse: 45,
        regulatoryBasis: 'ACA § 2719',
      })
      break

    default:
      actions.push({
        ...base, actionId: uid(), type: 'provider_dispute_letter', sequenceOrder: order, parallel: false,
        title: `Provider dispute — ${d.type.replace(/_/g, ' ')}`,
        description: `Dispute the identified ${d.type.replace(/_/g, ' ')} ($${d.estimatedDollarImpact.toFixed(0)}) with itemized evidence and citations.`,
        recipient: 'Provider billing department', daysToWaitForResponse: 30,
        regulatoryBasis: d.applicableRegulations[0],
      })
      actions.push({
        ...base, actionId: uid(), type: 'follow_up', sequenceOrder: order + 1, parallel: false,
        title: 'Follow-up / escalation if no response',
        description: 'Second notice with escalation warning; then regulator complaint if ignored.',
        recipient: 'Provider billing department', daysToWaitForResponse: 21,
      })
  }
  return actions
}

export function generateWorkflow(
  caseId: string,
  cbsSet: NormalizedCBSSet,
  deadlines: DeadlineResult[],
  predictions: FinancialOutcomePrediction[],
  consumerAuthorized: boolean
): AdvocacyWorkflow {
  const triggers = detectTriggers(cbsSet, deadlines)

  // Sequence: highest dollar impact first; deadline-critical items jump the queue.
  const sorted = [...cbsSet.crossDocumentDiscrepancies].sort(
    (a, b) => b.estimatedDollarImpact - a.estimatedDollarImpact
  )
  let order = 1
  const actions: AdvocacyAction[] = []
  for (const d of sorted) {
    const acts = actionsForDiscrepancy(d, order)
    actions.push(...acts)
    order = Math.max(...acts.map(a => a.sequenceOrder)) + 1
  }

  const expectedRecovery = predictions.reduce((s, p) => s + p.expectedRecoveryAmount, 0)
  const totalDollarAtStake = cbsSet.totalDollarAtRisk

  return {
    workflowId: uid(),
    caseId,
    createdAt: new Date().toISOString(),
    status: 'active',
    triggers,
    actions,
    currentStep: 1,
    totalDollarAtStake,
    expectedRecovery,
    consumerAuthorized,
  }
}

// ─── Monitoring + termination (Claims 13–14: iterate until termination) ──────

export function recordActionUpdate(
  workflow: AdvocacyWorkflow,
  actionId: string,
  update: { status: ActionStatus; responseSummary?: string }
): AdvocacyWorkflow {
  const actions = workflow.actions.map(a =>
    a.actionId === actionId
      ? {
          ...a,
          status: update.status,
          sentAt: update.status === 'sent' ? new Date().toISOString() : a.sentAt,
          responseAt: update.status === 'response_received' ? new Date().toISOString() : a.responseAt,
          responseSummary: update.responseSummary ?? a.responseSummary,
        }
      : a
  )

  // Advance current step when all actions at the current order are done.
  const stepActions = actions.filter(a => a.sequenceOrder === workflow.currentStep)
  const stepDone = stepActions.every(a => ['completed', 'skipped', 'response_received'].includes(a.status))
  const maxStep = Math.max(...actions.map(a => a.sequenceOrder))
  const currentStep = stepDone ? Math.min(workflow.currentStep + 1, maxStep) : workflow.currentStep

  return { ...workflow, actions, currentStep }
}

export function checkTermination(workflow: AdvocacyWorkflow): AdvocacyWorkflow {
  const allDone = workflow.actions.every(a => ['completed', 'skipped'].includes(a.status))
  if (allDone && workflow.status === 'active') {
    return { ...workflow, status: 'resolved', terminationReason: 'All advocacy actions completed' }
  }
  return workflow
}

export function terminateWorkflow(
  workflow: AdvocacyWorkflow,
  status: WorkflowStatus,
  reason: string
): AdvocacyWorkflow {
  return { ...workflow, status, terminationReason: reason }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const WF_KEY = 'verity_advocacy_workflows'

export function saveWorkflow(wf: AdvocacyWorkflow): void {
  try {
    if (typeof window === 'undefined') return
    const all: AdvocacyWorkflow[] = JSON.parse(window.localStorage.getItem(WF_KEY) || '[]')
    const idx = all.findIndex(w => w.workflowId === wf.workflowId)
    if (idx >= 0) all[idx] = wf
    else all.push(wf)
    window.localStorage.setItem(WF_KEY, JSON.stringify(all))
  } catch { /* quota — non-fatal */ }
}

export function getWorkflowForCase(caseId: string): AdvocacyWorkflow | null {
  try {
    if (typeof window === 'undefined') return null
    const all: AdvocacyWorkflow[] = JSON.parse(window.localStorage.getItem(WF_KEY) || '[]')
    return all.find(w => w.caseId === caseId) ?? null
  } catch {
    return null
  }
}

export function getAllWorkflows(): AdvocacyWorkflow[] {
  try {
    if (typeof window === 'undefined') return []
    return JSON.parse(window.localStorage.getItem(WF_KEY) || '[]')
  } catch {
    return []
  }
}
