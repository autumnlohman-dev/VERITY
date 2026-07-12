import { createClient } from '@/lib/supabase/server'
import { getStripe, PRICES, siteUrl } from '@/lib/stripe'
import { ensureStripeCustomer } from '@/lib/billing'
import { NextResponse } from 'next/server'

// Start Stripe Checkout for a one-time Single Dispute ($39) tied to one case.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { caseId, certified } = await request.json()
    if (!caseId || typeof caseId !== 'string') {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }
    // certified=true buys the $59 "Dispute Package + Certified Mail" product,
    // which additionally grants the Lob mail fulfillment for this case.
    const withMail = certified === true

    // The case must belong to this user.
    const { data: caseRecord } = await supabase
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single()

    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const customerId = await ensureStripeCustomer(user.id, user.email)
    const origin = siteUrl(request)
    const metadata = {
      userId: user.id,
      caseId,
      kind: 'single_dispute',
      mailIncluded: withMail ? 'true' : 'false',
    }

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: withMail ? PRICES.disputeCertified : PRICES.singleDispute, quantity: 1 }],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/cases/${caseId}/letter?paid=1`,
      cancel_url: `${origin}/cases/${caseId}`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('single-dispute checkout error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
