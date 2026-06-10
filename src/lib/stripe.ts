import Stripe from 'stripe'

// Server-only Stripe client, lazily constructed so a missing key fails at
// request time (clear error) instead of at build/import time.
let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key)
  }
  return _stripe
}

export const PRICES = {
  singleDispute: process.env.STRIPE_PRICE_SINGLE_DISPUTE!,
  membershipMonthly: process.env.STRIPE_PRICE_MEMBERSHIP_MONTHLY!,
  membershipAnnual: process.env.STRIPE_PRICE_MEMBERSHIP_ANNUAL!,
}

// Map a Stripe price id back to our internal plan name.
export function planForPrice(priceId: string | null | undefined): string | null {
  if (!priceId) return null
  if (priceId === PRICES.membershipAnnual) return 'membership_annual'
  if (priceId === PRICES.membershipMonthly) return 'membership_monthly'
  return null
}

// Resolve the site origin for success/cancel URLs.
export function siteUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
}
