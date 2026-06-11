import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertSubscription } from '@/lib/billing'
import { NextResponse } from 'next/server'

// Stripe sends raw JSON; we must verify the signature against the unparsed body.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Idempotency: never process the same event twice.
  const { data: seen } = await admin
    .from('webhook_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()
  if (seen) return NextResponse.json({ received: true, duplicate: true })

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode === 'payment' && session.metadata?.kind === 'single_dispute') {
          const userId = session.metadata.userId
          const caseId = session.metadata.caseId
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id ?? null

          await admin.from('payments').insert({
            user_id: userId,
            case_id: caseId || null,
            stripe_payment_intent_id: paymentIntentId,
            amount_cents: session.amount_total,
            status: 'succeeded',
          })

          if (caseId) {
            await admin
              .from('cases')
              .update({ dispute_paid: true, dispute_unlock_source: 'payment' })
              .eq('id', caseId)
          }
        } else if (session.mode === 'subscription' && session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          const sub = await getStripe().subscriptions.retrieve(subId)
          await upsertSubscription(admin, sub, session.metadata?.userId)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await upsertSubscription(admin, sub)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subRef = (invoice as unknown as { subscription?: string | { id: string } })
          .subscription
        const subId = typeof subRef === 'string' ? subRef : subRef?.id
        if (subId) {
          await admin
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subId)
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const piId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id
        if (piId) {
          const { data: pay } = await admin
            .from('payments')
            .update({ status: 'refunded' })
            .eq('stripe_payment_intent_id', piId)
            .select('case_id')
            .maybeSingle()
          if (pay?.case_id) {
            await admin
              .from('cases')
              .update({ dispute_paid: false, dispute_unlock_source: null, promo_code: null })
              .eq('id', pay.case_id)
          }
        }
        break
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break
    }

    await admin.from('webhook_events').insert({ stripe_event_id: event.id, type: event.type })
  } catch (err) {
    console.error('Webhook handler error:', event.type, err)
    // 500 → Stripe retries later.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
