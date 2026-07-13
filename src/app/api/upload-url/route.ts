import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSupportedExt } from '@/lib/extraction'
import { BILLS_BUCKET, buildBillPath, isUuid } from '@/lib/storage/bills'
import { checkRateLimit, clientIp } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Mints a one-time signed upload URL so the browser can PUT a bill/EOB straight
// into Supabase Storage, bypassing Vercel's request body limit. The path is
// chosen HERE (never by the client) and scoped to the caller — by user id when
// signed in, by an opaque per-session UUID for guests — so files stay isolated.
// The audit routes later download the file with the service role using the path.
export async function POST(request: Request) {
  try {
    const { slot, fileName, guestSessionId } = await request.json()

    // 'response' = a provider/insurer response or denial letter attached to a
    // dispute outcome (evidence storage only; never parsed or audited).
    if (slot !== 'bill' && slot !== 'eob' && slot !== 'response') {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })
    }
    if (typeof fileName !== 'string' || !fileName) {
      return NextResponse.json({ error: 'Missing fileName' }, { status: 400 })
    }
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    if (!isSupportedExt(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, JPG, PNG, WEBP, or HEIC.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let prefix: string
    if (user) {
      prefix = user.id
    } else if (isUuid(guestSessionId)) {
      prefix = `guest/${guestSessionId}`
    } else {
      return NextResponse.json({ error: 'Missing session' }, { status: 400 })
    }

    // Throttle URL minting (each mint = a storage write grant). Guests key on
    // IP — the guestSessionId is client-chosen, so it can't be the limiter.
    // Signed-in users get a generous ceiling: a full multi-page audit is up to
    // 20 files (10 pages × 2 slots) plus retries.
    const rl = await checkRateLimit(
      user
        ? { bucket: `upload-url:user:${user.id}`, limit: 120, windowSeconds: 600 }
        : { bucket: `upload-url:ip:${clientIp(request)}`, limit: 30, windowSeconds: 600 }
    )
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads in a short period. Please wait a few minutes and try again.' },
        { status: 429 }
      )
    }

    const path = buildBillPath(prefix, slot, fileName, Date.now())

    // Service role bypasses RLS to issue the upload token; the subsequent
    // uploadToSignedUrl from the browser is authorized by the token, so guests
    // (anon) can upload even though the bucket's RLS only grants authenticated.
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(BILLS_BUCKET).createSignedUploadUrl(path)
    if (error || !data) {
      console.error('Signed upload URL error:', error)
      return NextResponse.json({ error: 'Could not prepare the upload. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ path, token: data.token })
  } catch (error) {
    console.error('upload-url error:', error)
    return NextResponse.json({ error: 'Could not prepare the upload. Please try again.' }, { status: 500 })
  }
}
