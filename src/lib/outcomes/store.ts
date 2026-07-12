'use client'

import { createClient } from '@/lib/supabase/client'

// ─── Dispute Outcome Label schema ─────────────────────────────────────────────
// Every dispute tracked here becomes a labeled training record for the
// future Recovery Probability Score ML model.
//
// Persistence model (v8.2): Supabase is the system of record for authenticated
// users; localStorage is guest-only. `hydrateOutcomes()` (called on login and
// by outcome-reading components) determines the session, replays any legacy
// localStorage records through /api/outcomes ONCE and clears the legacy key,
// then pulls the user's rows into an in-memory cache so the synchronous read
// API below stays instant. Guests keep accumulating records in localStorage,
// untouched, until they sign up. Before hydration resolves, writes fall back
// to the old dual-write (localStorage + push) so nothing is ever dropped; the
// next hydration migrates and clears.

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

// Session-scoped module state. `memCache` is the authenticated user's Supabase
// rows (or the guest's localStorage rows) after hydration; `authed` is only
// trusted once hydration has run. Both reset on full page load, which is when
// hydration re-runs.
let memCache: DisputeOutcomeLabel[] | null = null
let authed = false
let hydration: Promise<void> | null = null

function loadLocal(): DisputeOutcomeLabel[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DisputeOutcomeLabel[]) : []
  } catch {
    return []
  }
}

function saveLocal(outcomes: DisputeOutcomeLabel[]): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(outcomes))
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

// The synchronous read source: hydrated cache when available, else the guest/
// legacy localStorage copy.
function current(): DisputeOutcomeLabel[] {
  return memCache ?? loadLocal()
}

function cacheUpsert(outcome: DisputeOutcomeLabel): void {
  if (!memCache) memCache = loadLocal()
  const idx = memCache.findIndex(o => o.outcomeId === outcome.outcomeId)
  if (idx >= 0) memCache[idx] = outcome
  else memCache.push(outcome)
}

// Hydrate the read cache. Authenticated: migrate any legacy localStorage
// records to Supabase (clearing the key only when EVERY row landed), then pull
// the user's rows. Guest: cache is the localStorage copy. Idempotent per page
// load; concurrent callers share one flight.
export async function hydrateOutcomes(): Promise<void> {
  if (typeof window === 'undefined') return
  if (hydration) return hydration
  hydration = (async () => {
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      authed = !!session

      if (!authed) {
        memCache = loadLocal()
        return
      }

      // One-time legacy migration for this user. Clear the key only if every
      // record was accepted — a partial failure leaves the key for a retry on
      // the next load, and the upsert makes replays harmless.
      const legacy = loadLocal()
      if (legacy.length > 0) {
        const results = await Promise.all(legacy.map(pushRemote))
        if (results.every(Boolean)) {
          try {
            window.localStorage.removeItem(STORAGE_KEY)
          } catch {
            // Key removal failing is cosmetic; the upsert already landed.
          }
        } else {
          console.error(
            `outcomes: legacy localStorage migration incomplete (${results.filter(r => !r).length}/${legacy.length} failed); keeping legacy key for retry.`
          )
        }
      }

      const { data, error } = await supabase.from('dispute_outcomes').select('*')
      if (!error && data) {
        memCache = data.map(row => rowToLabel(row as Record<string, unknown>))
      } else if (!memCache) {
        memCache = legacy
      }
    } catch {
      // Hydration is best-effort; readers fall back to localStorage.
      if (!memCache) memCache = loadLocal()
    }
  })()
  return hydration
}

export function saveOutcome(outcome: DisputeOutcomeLabel): void {
  cacheUpsert(outcome)
  // Guests (and pre-hydration writes, where the session is unknown) keep the
  // localStorage copy; hydration later migrates and clears it. Authenticated
  // users write through to Supabase only.
  if (!authed) {
    const all = loadLocal()
    const idx = all.findIndex(o => o.outcomeId === outcome.outcomeId)
    if (idx >= 0) all[idx] = outcome
    else all.push(outcome)
    saveLocal(all)
  }
  void pushRemote(outcome)
}

export function getOutcome(outcomeId: string): DisputeOutcomeLabel | null {
  return current().find(o => o.outcomeId === outcomeId) ?? null
}

export function getAllOutcomes(): DisputeOutcomeLabel[] {
  return current()
}

export function updateOutcome(
  outcomeId: string,
  updates: Partial<DisputeOutcomeLabel>
): void {
  const existing = current().find(o => o.outcomeId === outcomeId)
  if (!existing) return
  const merged = { ...existing, ...updates }
  cacheUpsert(merged)
  if (!authed) {
    const all = loadLocal()
    const idx = all.findIndex(o => o.outcomeId === outcomeId)
    if (idx >= 0) {
      all[idx] = merged
      saveLocal(all)
    }
  }
  void pushRemote(merged)
}

export function getAggregateStats(): OutcomeStats {
  const all = current()
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

// Returns true when the API accepted the record (401 for guests and network
// failures return false; the localStorage copy remains the fallback).
async function pushRemote(outcome: DisputeOutcomeLabel): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    const res = await fetch('/api/outcomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outcome),
    })
    return res.ok
  } catch {
    return false
  }
}

// Login-time reconciliation. Kept as the historical export name; hydration now
// owns the whole flow (legacy migration + Supabase pull into the read cache).
export async function syncOutcomes(): Promise<void> {
  return hydrateOutcomes()
}
