import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEntitlements } from '@/lib/entitlements'
import { checkRateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Currently-valid beta promo codes live in a comma-separated env var so they can
// be rotated without a code change, e.g. BETA_PROMO_CODES="BETA2026, PRESS, FAM".
function validPromoCodes(): string[] {
  return (process.env.BETA_PROMO_CODES ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

// Redeem a promo code to comp the dispute package for one case. Same effect as a
// paid Single Dispute (dispute_paid = true), but the unlock source is recorded
// as promo_code so paid and comped cases remain distinguishable in the data.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Please sign in to redeem a promo code.', code: 'auth_required' },
        { status: 401 }
      )
    }

    // Throttle code-guessing: 5 attempts per user per hour.
    const rl = await checkRateLimit({
      bucket: `promo:${user.id}`,
      limit: 5,
      windowSeconds: 3600,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many promo attempts. Please wait an hour and try again.' },
        { status: 429 }
      )
    }

    const { caseId, code } = (await request.json()) as { caseId?: string; code?: string }
    if (!caseId || typeof caseId !== 'string' || !code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Enter a promo code to continue.' }, { status: 400 })
    }

    // Case-insensitive, whitespace-tolerant match; store the canonical configured
    // value rather than whatever casing the user typed.
    const submitted = code.trim()
    const match = validPromoCodes().find((c) => c.toLowerCase() === submitted.toLowerCase())
    if (!match) {
      return NextResponse.json(
        { error: "That code isn't valid. Double-check it and try again." },
        { status: 422 }
      )
    }

    // The case must belong to this user.
    const { data: caseRecord } = await supabase
      .from('cases')
      .select('id, dispute_paid')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }

    // Already unlocked (paid, or comped earlier), or covered by a membership —
    // nothing to mark, and we must not relabel a paid/member case as comped.
    if (caseRecord.dispute_paid) {
      return NextResponse.json({ unlocked: true, alreadyUnlocked: true })
    }
    const { isMember } = await getEntitlements(supabase, user.id)
    if (isMember) {
      return NextResponse.json({ unlocked: true, alreadyUnlocked: true })
    }

    // Mark the case unlocked via the service-role client, recording the comp
    // source. Scoped to this user's case as defense in depth.
    const admin = createAdminClient()
    const { error } = await admin
      .from('cases')
      .update({
        dispute_paid: true,
        dispute_unlock_source: 'promo_code',
        promo_code: match,
      })
      .eq('id', caseId)
      .eq('user_id', user.id)
    if (error) {
      console.error('redeem-promo update failed:', error)
      return NextResponse.json(
        { error: 'Could not apply the code. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ unlocked: true })
  } catch (err) {
    console.error('redeem-promo error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
