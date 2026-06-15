'use client'

// ─── Guest-audit claim ────────────────────────────────────────────────────────
// A guest runs a free audit on /upload (the /api/audit-guest pipeline persists
// nothing — guests have no DB rows under the user-scoped RLS). To carry that
// audit through signup without a re-upload, we stash the full result in
// localStorage under a generated claim ID. On the first authenticated load
// (login redirect or dashboard), claimPendingGuestAudit() turns it into a real
// case row owned by the now-authenticated user, then clears the claim.
//
// Survives a full page round trip (it's localStorage, not React state) so it
// works whether email confirmation is OFF (instant session) or ON (the user
// leaves, confirms by email, and returns to sign in).

const CLAIM_KEY = 'verity_guest_claim'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // discard audits older than 7 days

// The audit fields we need to reconstruct the case the guest already saw. Kept
// permissive (the source is /api/audit-guest's JSON) — the server route
// re-validates and recomputes derived totals.
export interface GuestClaimAudit {
  provider?: string | null
  lineItems?: unknown[]
  errors?: unknown[]
  totalBilled?: number
  potentialSavings?: number
  normalizedCbs?: unknown
  hasEob?: boolean
  // An EOB was uploaded for the guest audit but couldn't be read, so it ran
  // bill-only. Carried through the claim so the saved case can surface the
  // "couldn't read your EOB" notice instead of degrading silently.
  eobError?: boolean
  lowConfidence?: boolean
}

export interface GuestClaimInputs {
  careType?: string | null
  insuranceType?: string | null
  gfe?: string | null
  tier?: string | null
  userNotes?: string
}

export interface GuestClaim {
  claimId: string
  createdAt: string // ISO
  audit: GuestClaimAudit
  inputs: GuestClaimInputs
}

// Persist a freshly-completed guest audit. Best-effort: a storage failure must
// not break the results screen, so swallow and return null.
export function saveGuestClaim(audit: GuestClaimAudit, inputs: GuestClaimInputs): string | null {
  try {
    if (typeof window === 'undefined') return null
    const claim: GuestClaim = {
      claimId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      audit: {
        provider: audit.provider ?? null,
        lineItems: Array.isArray(audit.lineItems) ? audit.lineItems : [],
        errors: Array.isArray(audit.errors) ? audit.errors : [],
        totalBilled: Number(audit.totalBilled ?? 0),
        potentialSavings: Number(audit.potentialSavings ?? 0),
        normalizedCbs: audit.normalizedCbs ?? null,
        hasEob: !!audit.hasEob,
        eobError: !!audit.eobError,
        lowConfidence: !!audit.lowConfidence,
      },
      inputs,
    }
    window.localStorage.setItem(CLAIM_KEY, JSON.stringify(claim))
    return claim.claimId
  } catch {
    return null
  }
}

export function getGuestClaim(): GuestClaim | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(CLAIM_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GuestClaim
  } catch {
    // Corrupt JSON in storage — treat as no claim rather than throwing.
    return null
  }
}

export function clearGuestClaim(): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(CLAIM_KEY)
  } catch {
    // ignore
  }
}

// Import a pending guest audit into a real, user-owned case. Returns the case id
// to navigate to (newly created OR already-imported), or null when there is
// nothing to claim / it isn't usable. Designed to be called on any authenticated
// entry point; safe to call when no claim exists.
export async function claimPendingGuestAudit(): Promise<string | null> {
  if (typeof window === 'undefined') return null

  // Malformed JSON in storage → discard and fall through to the normal flow.
  let claim: GuestClaim | null
  try {
    claim = getGuestClaim()
  } catch {
    clearGuestClaim()
    return null
  }
  if (!claim) return null

  // Shape / freshness validation. Anything off → discard silently.
  const created = new Date(claim.createdAt ?? '').getTime()
  const ageOk = Number.isFinite(created) && Date.now() - created <= MAX_AGE_MS
  const shapeOk =
    typeof claim.claimId === 'string' &&
    claim.claimId.length > 0 &&
    !!claim.audit &&
    Array.isArray(claim.audit.lineItems)
  if (!ageOk || !shapeOk) {
    clearGuestClaim()
    return null
  }

  try {
    const res = await fetch('/api/claim-guest-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(claim),
    })

    if (!res.ok) {
      // 401: not authenticated yet — keep the claim for the next attempt.
      // 5xx: transient — keep the claim so a later load can retry.
      // Other 4xx: the server rejected the payload as unusable — discard.
      if (res.status !== 401 && res.status < 500) clearGuestClaim()
      return null
    }

    const data = (await res.json()) as { caseId?: string }
    clearGuestClaim()
    return typeof data.caseId === 'string' ? data.caseId : null
  } catch {
    // Network error — keep the claim so the dashboard fallback can retry.
    return null
  }
}
