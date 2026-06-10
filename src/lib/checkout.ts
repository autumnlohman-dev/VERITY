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

export function startSingleDisputeCheckout(caseId: string) {
  return startCheckout('/api/checkout/single-dispute', { caseId })
}
