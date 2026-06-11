'use client'

import { createClient } from '@/lib/supabase/client'

// ─── Dispute Outcome Label schema ─────────────────────────────────────────────
// Every dispute tracked here becomes a labeled training record for the
// future Recovery Probability Score ML model.
//
// Persistence model (v8.1): Supabase is the system of record; localStorage is
// a synchronous cache and offline fallback. Every write lands in localStorage
// immediately (so the synchronous read API below stays instant) and is then
// pushed to Supabase best-effort. Guests accumulate records locally; on login
// `syncOutcomes()` reconciles the two stores.

export interface DisputeOutcomeLabel {
  outcomeId: string
  caseId?: string
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
  void pushRemote(outcome)
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
    void pushRemote(all[idx])
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
  caseId?: string
  discrepancyType: string
  discrepancySeverity: string
  dollarAmountDisputed: number
  payerName?: string
  providerName?: string
  regulationsCited: string[]
}): DisputeOutcomeLabel {
  return {
    outcomeId: params.outcomeId,
    caseId: params.caseId,
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

// ─── Supabase sync ────────────────────────────────────────────────────────────
// localStorage is the synchronous cache; Supabase is the durable store. Writes
// are best-effort — a failure leaves the localStorage copy as the offline
// fallback to be reconciled by syncOutcomes() on the next login.

function rowToLabel(row: Record<string, unknown>): DisputeOutcomeLabel {
  return {
    outcomeId: String(row.id),
    caseId: (row.case_id as string) ?? undefined,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    resolvedAt: (row.resolved_at as string) ?? undefined,
    discrepancyType: (row.discrepancy_type as string) ?? '',
    discrepancySeverity: (row.discrepancy_severity as string) ?? '',
    dollarAmountDisputed: Number(row.dollar_amount_disputed ?? 0),
    payerName: (row.payer_name as string) ?? undefined,
    payerType: (row.payer_type as DisputeOutcomeLabel['payerType']) ?? undefined,
    providerName: (row.provider_name as string) ?? undefined,
    stateOfService: (row.state_of_service as string) ?? undefined,
    regulationsCited: (row.regulations_cited as string[]) ?? [],
    documentationCompleteness:
      (row.documentation_completeness as DisputeOutcomeLabel['documentationCompleteness']) ?? 'partial',
    resolutionPathwayUsed: (row.resolution_pathway_used as string) ?? undefined,
    status: (row.status as DisputeOutcomeLabel['status']) ?? 'pending',
    amountRecovered: row.amount_recovered != null ? Number(row.amount_recovered) : undefined,
    daysToResolution: row.days_to_resolution != null ? Number(row.days_to_resolution) : undefined,
    notes: (row.notes as string) ?? undefined,
  }
}

async function pushRemote(outcome: DisputeOutcomeLabel): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    await fetch('/api/outcomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outcome),
    })
  } catch {
    // Offline / network error — localStorage copy is the fallback.
  }
}

// Reconcile localStorage with Supabase. Called on login: pushes every local
// record up (claiming guest records under the now-authenticated user via the
// API route), then pulls the remote set down into the local cache.
export async function syncOutcomes(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const local = loadAll()
    await Promise.all(local.map(pushRemote))

    const supabase = createClient()
    const { data, error } = await supabase.from('dispute_outcomes').select('*')
    if (error || !data) return

    const merged = new Map<string, DisputeOutcomeLabel>()
    for (const o of local) merged.set(o.outcomeId, o)
    for (const row of data) {
      const label = rowToLabel(row as Record<string, unknown>)
      merged.set(label.outcomeId, label)
    }
    saveAll([...merged.values()])
  } catch {
    // Sync is best-effort; the local cache remains usable.
  }
}
