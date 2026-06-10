import type Stripe from 'stripe'
import { getStripe, planForPrice } from './stripe'
import { createAdminClient } from './supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// Return the user's Stripe customer id, creating (and persisting) one if needed.
export async function ensureStripeCustomer(
  userId: string,
  email?: string | null
): Promise<string> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (profile?.stripe_customer_id) return profile.stripe_customer_id

  const customer = await getStripe().customers.create({
    email: email ?? undefined,
    metadata: { userId },
  })

  await admin
    .from('profiles')
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: 'user_id' })

  return customer.id
}

// Read the subscription's current-period-end across Stripe API versions
// (it moved from the subscription to the line item in newer versions).
function periodEndISO(sub: Stripe.Subscription): string | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined
  const ts = top ?? item?.current_period_end
  return ts ? new Date(ts * 1000).toISOString() : null
}

// Upsert a subscription row from a Stripe.Subscription object. Resolves the
// owning user from subscription metadata, an explicit fallback, or the customer id.
export async function upsertSubscription(
  admin: AdminClient,
  sub: Stripe.Subscription,
  fallbackUserId?: string | null
): Promise<void> {
  let userId = sub.metadata?.userId || fallbackUserId || null

  if (!userId) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
    if (customerId) {
      const { data } = await admin
        .from('profiles')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      userId = data?.user_id ?? null
    }
  }

  if (!userId) {
    console.error('upsertSubscription: could not resolve user for subscription', sub.id)
    return
  }

  const priceId = sub.items?.data?.[0]?.price?.id ?? null

  await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      plan: planForPrice(priceId),
      price_id: priceId,
      current_period_end: periodEndISO(sub),
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' }
  )
}
