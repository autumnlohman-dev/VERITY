'use client'

// Client helpers that start Stripe Checkout and redirect the browser.
// On 401 (not signed in) we send the user to login first.

async function startCheckout(endpoint: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 401) {
      window.location.href = '/login'
      return
    }
    const data = await res.json()
    if (data?.url) {
      window.location.href = data.url
    } else {
      console.error('Checkout: no url returned', data)
    }
  } catch (err) {
    console.error('Checkout failed', err)
  }
}

export function startMembershipCheckout(plan: 'monthly' | 'annual' = 'monthly') {
  return startCheckout('/api/checkout/membership', { plan })
}

export function startSingleDisputeCheckout(caseId: string, opts?: { certified?: boolean }) {
  return startCheckout('/api/checkout/single-dispute', {
    caseId,
    certified: opts?.certified === true,
  })
}

// ─── Pending checkout intent (guest → auth → checkout) ────────────────────────
// When a signed-out visitor picks a paid tier we can't start Stripe Checkout yet
// (the API needs a session). We stash their choice, send them through the
// auth/signup funnel, and resume the checkout right after they sign in.

const CHECKOUT_INTENT_KEY = 'verity.pendingCheckout'

export type CheckoutIntent =
  | { type: 'membership'; plan: 'monthly' | 'annual' }
  | { type: 'single-dispute'; caseId: string }

export function rememberCheckoutIntent(intent: CheckoutIntent) {
  try {
    window.sessionStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(intent))
  } catch {
    // Storage unavailable (private mode / SSR) — intent simply isn't preserved.
  }
}

// Read + clear any stored intent and resume that checkout. Returns true when a
// checkout redirect was kicked off (caller should not navigate elsewhere).
export function resumePendingCheckout(): boolean {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(CHECKOUT_INTENT_KEY)
    if (raw) window.sessionStorage.removeItem(CHECKOUT_INTENT_KEY)
  } catch {
    return false
  }
  if (!raw) return false

  let intent: CheckoutIntent
  try {
    intent = JSON.parse(raw) as CheckoutIntent
  } catch {
    return false
  }

  if (intent.type === 'membership') {
    void startMembershipCheckout(intent.plan)
    return true
  }
  if (intent.type === 'single-dispute' && intent.caseId) {
    void startSingleDisputeCheckout(intent.caseId)
    return true
  }
  return false
}
