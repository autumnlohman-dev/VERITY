import type { SupabaseClient } from '@supabase/supabase-js'

// Server-side entitlement checks. Pass the request's RLS-scoped Supabase client
// (from @/lib/supabase/server) so reads respect row-level security.

export type Entitlements = {
  isMember: boolean
  renewsOn: string | null
  cancelAtPeriodEnd: boolean
}

export async function getEntitlements(
  supabase: SupabaseClient,
  userId: string
): Promise<Entitlements> {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .order('current_period_end', { ascending: false })
    .limit(1)

  const sub = data?.[0]
  return {
    isMember: !!sub,
    renewsOn: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
  }
}

// True if the user may generate dispute letters for this case:
// a member (unlimited) or someone who paid the one-time Single Dispute for it.
export async function disputeUnlocked(
  supabase: SupabaseClient,
  userId: string,
  caseId: string
): Promise<boolean> {
  const { isMember } = await getEntitlements(supabase, userId)
  if (isMember) return true

  const { data } = await supabase
    .from('cases')
    .select('dispute_paid')
    .eq('id', caseId)
    .eq('user_id', userId)
    .maybeSingle()

  return data?.dispute_paid === true
}
