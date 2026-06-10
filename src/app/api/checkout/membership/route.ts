import { createClient } from '@/lib/supabase/server'
import { getStripe, PRICES, siteUrl } from '@/lib/stripe'
import { ensureStripeCustomer } from '@/lib/billing'
import { NextResponse } from 'next/server'

// Start Stripe Checkout for the recurring Membership ($19/mo or $149/yr).
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plan } = await request.json()
    const price = plan === 'annual' ? PRICES.membershipAnnual : PRICES.membershipMonthly

    const customerId = await ensureStripeCustomer(user.id, user.email)
    const origin = siteUrl(request)

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
      success_url: `${origin}/dashboard?welcome=1`,
      cancel_url: `${origin}/pricing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('membership checkout error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
