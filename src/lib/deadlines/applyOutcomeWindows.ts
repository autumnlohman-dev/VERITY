import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deadlineMutationsForOutcome,
  type OutcomeDeadlineFacts,
  type ExistingDeadline,
  type OutcomeDeadlineType,
  type DeadlineStatus,
} from './outcomeWindows'

// Applies the pure outcome-window rules against the deadlines table. Called
// with the SERVICE-ROLE client (deadline rows are server-computed; clients are
// read-only) from the mail-dispatch route and the response-intake route.
// Best-effort like the dispatch bookkeeping itself: failures are returned for
// the caller to log loudly, never thrown into the user's request path.
export async function applyOutcomeDeadlines(
  admin: SupabaseClient,
  outcome: OutcomeDeadlineFacts,
  today: Date = new Date()
): Promise<{ error: string | null }> {
  try {
    const { data: rows, error: readErr } = await admin
      .from('deadlines')
      .select('id, deadline_type, due_date, status')
      .eq('outcome_id', outcome.outcomeId)
    if (readErr) return { error: `deadline read failed: ${readErr.message}` }

    const existing: ExistingDeadline[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      deadlineType: r.deadline_type as OutcomeDeadlineType,
      dueDate: r.due_date as string,
      status: r.status as DeadlineStatus,
    }))

    const m = deadlineMutationsForOutcome(outcome, existing, today)
    const stamp = new Date().toISOString()

    if (m.create.length > 0) {
      const { error } = await admin.from('deadlines').insert(m.create)
      if (error) return { error: `deadline insert failed: ${error.message}` }
    }
    if (m.satisfyIds.length > 0) {
      const { error } = await admin
        .from('deadlines')
        .update({ status: 'satisfied', updated_at: stamp })
        .in('id', m.satisfyIds)
      if (error) return { error: `deadline satisfy failed: ${error.message}` }
    }
    if (m.expireIds.length > 0) {
      const { error } = await admin
        .from('deadlines')
        .update({ status: 'expired', updated_at: stamp })
        .in('id', m.expireIds)
      if (error) return { error: `deadline expire failed: ${error.message}` }
    }
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'unknown deadline apply error' }
  }
}
