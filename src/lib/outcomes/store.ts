'use client'

// ─── Dispute Outcome Label schema ─────────────────────────────────────────────
// Every dispute tracked here becomes a labeled training record for the
// future Recovery Probability Score ML model.

export interface DisputeOutcomeLabel {
  outcomeId: string
  createdAt: string
  resolvedAt?: string

  // Discrepancy details
  discrepancyType: string
  discrepancySeverity: string
  dollarAmountDisputed: number

  // Payer/provider
  payerName?: string
  payerType?: 'commercial' | 'medicare' | 'medicaid' | 'self_pay' | 'unknown'
  providerName?: string
  stateOfService?: string

  // What was used
  regulationsCited: string[]
  documentationCompleteness: 'complete' | 'partial' | 'minimal'
  resolutionPathwayUsed?: string

  // Outcome
  status: 'pending' | 'in_progress' | 'won' | 'partial' | 'lost' | 'abandoned'
  amountRecovered?: number
  daysToResolution?: number
  notes?: string
}

export interface OutcomeStats {
  totalDisputes: number
  resolvedDisputes: number
  winRate: number
  partialWinRate: number
  averageAmountRecovered: number
  averageDaysToResolution: number
  byDiscrepancyType: Record<string, { total: number; wins: number; winRate: number }>
  totalRecovered: number
}

const STORAGE_KEY = 'verity_dispute_outcomes'

function loadAll(): DisputeOutcomeLabel[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DisputeOutcomeLabel[]) : []
  } catch {
    return []
  }
}

function saveAll(outcomes: DisputeOutcomeLabel[]): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(outcomes))
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

export function saveOutcome(outcome: DisputeOutcomeLabel): void {
  const all = loadAll()
  const idx = all.findIndex(o => o.outcomeId === outcome.outcomeId)
  if (idx >= 0) {
    all[idx] = outcome
  } else {
    all.push(outcome)
  }
  saveAll(all)
}

export function getOutcome(outcomeId: string): DisputeOutcomeLabel | null {
  return loadAll().find(o => o.outcomeId === outcomeId) ?? null
}

export function getAllOutcomes(): DisputeOutcomeLabel[] {
  return loadAll()
}

export function updateOutcome(
  outcomeId: string,
  updates: Partial<DisputeOutcomeLabel>
): void {
  const all = loadAll()
  const idx = all.findIndex(o => o.outcomeId === outcomeId)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates }
    saveAll(all)
  }
}

export function getAggregateStats(): OutcomeStats {
  const all = loadAll()
  const resolved = all.filter(o => ['won', 'partial', 'lost'].includes(o.status))
  const won = all.filter(o => o.status === 'won')
  const partial = all.filter(o => o.status === 'partial')

  const winRate = resolved.length > 0 ? (won.length / resolved.length) * 100 : 0
  const partialWinRate = resolved.length > 0 ? (partial.length / resolved.length) * 100 : 0

  const totalRecovered = [...won, ...partial].reduce((sum, o) => sum + (o.amountRecovered || 0), 0)
  const avgRecovered = resolved.length > 0 ? totalRecovered / resolved.length : 0

  const daysArr = resolved.filter(o => o.daysToResolution).map(o => o.daysToResolution!)
  const avgDays = daysArr.length > 0 ? daysArr.reduce((a, b) => a + b, 0) / daysArr.length : 0

  const byType: Record<string, { total: number; wins: number; winRate: number }> = {}
  for (const o of all) {
    const key = o.discrepancyType || 'unknown'
    if (!byType[key]) byType[key] = { total: 0, wins: 0, winRate: 0 }
    byType[key].total++
    if (o.status === 'won' || o.status === 'partial') byType[key].wins++
  }
  for (const key of Object.keys(byType)) {
    byType[key].winRate = byType[key].total > 0 ? (byType[key].wins / byType[key].total) * 100 : 0
  }

  return {
    totalDisputes: all.length,
    resolvedDisputes: resolved.length,
    winRate,
    partialWinRate,
    averageAmountRecovered: avgRecovered,
    averageDaysToResolution: avgDays,
    byDiscrepancyType: byType,
    totalRecovered,
  }
}

export function createPendingOutcome(params: {
  outcomeId: string
  discrepancyType: string
  discrepancySeverity: string
  dollarAmountDisputed: number
  payerName?: string
  providerName?: string
  regulationsCited: string[]
}): DisputeOutcomeLabel {
  return {
    outcomeId: params.outcomeId,
    createdAt: new Date().toISOString(),
    discrepancyType: params.discrepancyType,
    discrepancySeverity: params.discrepancySeverity,
    dollarAmountDisputed: params.dollarAmountDisputed,
    payerName: params.payerName,
    providerName: params.providerName,
    regulationsCited: params.regulationsCited,
    documentationCompleteness: 'partial',
    status: 'pending',
  }
}
