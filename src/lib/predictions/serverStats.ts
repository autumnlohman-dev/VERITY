import type { SupabaseClient } from '@supabase/supabase-js'
import type { OutcomeStats } from '@/lib/outcomes/store'

// ─── Server-side outcome stats (M7) ───────────────────────────────────────────
// The prediction engine blends industry priors with real Verity dispute
// outcomes. The client gets those from localStorage (lib/outcomes/store, a
// 'use client' module); on the server that store is empty (window is undefined),
// so server-side predictions would silently blend against zero real outcomes.
//
// This reads dispute_outcomes from Supabase and returns the same OutcomeStats
// shape the engine expects. Pass the result into predictAll(cbsSet, ctx, stats).
// Mirrors the aggregation in store.getAggregateStats so client and server agree.

const EMPTY_STATS: OutcomeStats = {
  totalDisputes: 0,
  resolvedDisputes: 0,
  winRate: 0,
  partialWinRate: 0,
  averageAmountRecovered: 0,
  averageDaysToResolution: 0,
  byDiscrepancyType: {},
  totalRecovered: 0,
}

interface OutcomeRow {
  discrepancy_type: string | null
  status: string | null
  amount_recovered: number | null
  days_to_resolution: number | null
}

export async function aggregateStatsFromSupabase(
  supabase: SupabaseClient,
  userId?: string
): Promise<OutcomeStats> {
  try {
    let query = supabase
      .from('dispute_outcomes')
      .select('discrepancy_type, status, amount_recovered, days_to_resolution')
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error || !Array.isArray(data)) return EMPTY_STATS

    const rows = data as OutcomeRow[]
    const resolved = rows.filter((o) => ['won', 'partial', 'lost'].includes(o.status ?? ''))
    const won = rows.filter((o) => o.status === 'won')
    const partial = rows.filter((o) => o.status === 'partial')

    const winRate = resolved.length > 0 ? (won.length / resolved.length) * 100 : 0
    const partialWinRate = resolved.length > 0 ? (partial.length / resolved.length) * 100 : 0

    const totalRecovered = [...won, ...partial].reduce((sum, o) => sum + (o.amount_recovered || 0), 0)
    const avgRecovered = resolved.length > 0 ? totalRecovered / resolved.length : 0

    const daysArr = resolved
      .map((o) => o.days_to_resolution)
      .filter((d): d is number => typeof d === 'number')
    const avgDays = daysArr.length > 0 ? daysArr.reduce((a, b) => a + b, 0) / daysArr.length : 0

    const byType: OutcomeStats['byDiscrepancyType'] = {}
    for (const o of rows) {
      const key = o.discrepancy_type || 'unknown'
      if (!byType[key]) byType[key] = { total: 0, wins: 0, winRate: 0 }
      byType[key].total++
      if (o.status === 'won' || o.status === 'partial') byType[key].wins++
    }
    for (const key of Object.keys(byType)) {
      byType[key].winRate = byType[key].total > 0 ? (byType[key].wins / byType[key].total) * 100 : 0
    }

    return {
      totalDisputes: rows.length,
      resolvedDisputes: resolved.length,
      winRate,
      partialWinRate,
      averageAmountRecovered: avgRecovered,
      averageDaysToResolution: avgDays,
      byDiscrepancyType: byType,
      totalRecovered,
    }
  } catch {
    return EMPTY_STATS
  }
}
