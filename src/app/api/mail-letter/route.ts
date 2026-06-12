import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { disputeUnlocked } from '@/lib/entitlements'
import { applyLetterSubstitutions } from '@/lib/letterFields'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  lobConfigured,
  isLobTestKey,
  verifyUsAddress,
  createLetter,
  LobError,
  type LobAddress,
} from '@/lib/lob'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

// Turn Lob's raw field-validation message into something a patient can act on.
// Lob's 4xx messages reference API field names (address_line1, name, …); map the
// common ones to plain words. The message is otherwise safe to surface verbatim.
function humanizeLobMessage(msg: string): string {
  let m = msg
    .replace(/address_line1/gi, 'street address')
    .replace(/address_line2/gi, 'street address (line 2)')
    .replace(/address_city/gi, 'city')
    .replace(/address_state/gi, 'state')
    .replace(/address_zip/gi, 'ZIP code')
    .replace(/\bfile\b/gi, 'letter document')
    .replace(/\bto\./gi, 'recipient ')
    .replace(/\bfrom\./gi, 'return-address ')
  m = m.trim()
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export const runtime = 'nodejs'
export const maxDuration = 30

interface AddrInput {
  name?: unknown
  line1?: unknown
  line2?: unknown
  city?: unknown
  state?: unknown
  zip?: unknown
}

function parseAddress(raw: AddrInput | undefined, label: string): LobAddress | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: `Missing ${label} address` }
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const addr: LobAddress = {
    name: s(raw.name),
    line1: s(raw.line1),
    line2: s(raw.line2) || undefined,
    city: s(raw.city),
    state: s(raw.state),
    zip: s(raw.zip),
  }
  if (!addr.name) return { error: `Enter the ${label} name` }
  if (!addr.line1 || !addr.city || !addr.state || !addr.zip) {
    return { error: `Enter the full ${label} street address, city, state, and ZIP` }
  }
  if (!/^[A-Za-z]{2}$/.test(addr.state)) return { error: `Use the 2-letter state code for the ${label} address` }
  if (!/^\d{5}(-\d{4})?$/.test(addr.zip)) return { error: `Enter a valid ZIP for the ${label} address` }
  return addr
}

// ─── Minimal, safe Markdown → HTML for the printed letter ────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(text: string): string {
  // Escape first, then apply bold/italic on the escaped text.
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const isBullet = (l: string) => /^[-*+]\s+/.test(l)
  while (i < lines.length) {
    const raw = lines[i]
    const t = raw.trim()
    if (!t) {
      i++
      continue
    }
    if (/^###\s+/.test(t)) { out.push(`<h3>${inline(t.replace(/^###\s+/, ''))}</h3>`); i++; continue }
    if (/^##\s+/.test(t)) { out.push(`<h2>${inline(t.replace(/^##\s+/, ''))}</h2>`); i++; continue }
    if (/^#\s+/.test(t)) { out.push(`<h1>${inline(t.replace(/^#\s+/, ''))}</h1>`); i++; continue }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(t)) { out.push('<hr/>'); i++; continue }
    if (isBullet(t)) {
      const items: string[] = []
      while (i < lines.length && isBullet(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    // paragraph: gather consecutive non-blank, non-structural lines
    const para: string[] = []
    while (i < lines.length) {
      const pl = lines[i].trim()
      if (!pl || /^#{1,3}\s+/.test(pl) || isBullet(pl) || /^(-{3,}|_{3,}|\*{3,})$/.test(pl)) break
      para.push(inline(lines[i]))
      i++
    }
    if (para.length) out.push(`<p>${para.join('<br/>')}</p>`)
  }
  return out.join('\n')
}

// Full-page HTML for Lob. The top area is reserved blank so Lob can print the
// recipient + return address (address_placement: top_first_page).
function buildLetterHtml(bodyMarkdown: string): string {
  const body = markdownToHtml(bodyMarkdown)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: letter; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #222222; font-size: 11pt; line-height: 1.5; }
    .page { width: 8.5in; min-height: 11in; box-sizing: border-box; padding: 0 1in 1in 1in; }
    .addr-reserve { height: 2.75in; }
    h1 { font-size: 15pt; margin: 0 0 10pt; }
    h2 { font-size: 13pt; margin: 16pt 0 8pt; }
    h3 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.04em; margin: 14pt 0 6pt; }
    p { margin: 0 0 10pt; }
    ul { margin: 0 0 10pt 18pt; padding: 0; }
    li { margin: 0 0 4pt; }
    hr { border: none; border-top: 1px solid #cccccc; margin: 14pt 0; }
  </style></head><body><div class="page"><div class="addr-reserve"></div>${body}</div></body></html>`
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to mail this letter.', code: 'auth_required' }, { status: 401 })
    }

    if (!lobConfigured()) {
      return NextResponse.json(
        { error: 'Mailing is not configured yet. Download the letter and mail it yourself for now.', code: 'not_configured' },
        { status: 503 }
      )
    }

    // Modest per-user throttle — mailing is an external, paid action.
    const rl = await checkRateLimit({ bucket: `mail-letter:${user.id}`, limit: 10, windowSeconds: 3600 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many mail requests. Please try again later.' }, { status: 429 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      caseId?: unknown
      to?: AddrInput
      from?: AddrInput
      certified?: unknown
    }
    const caseId = typeof body.caseId === 'string' ? body.caseId : ''
    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }
    const certified = body.certified === true

    const toParsed = parseAddress(body.to, 'recipient (provider)')
    if ('error' in toParsed) return NextResponse.json({ error: toParsed.error, field: 'to' }, { status: 400 })
    const fromParsed = parseAddress(body.from, 'return')
    if ('error' in fromParsed) return NextResponse.json({ error: fromParsed.error, field: 'from' }, { status: 400 })

    // Ownership + current mail state.
    const { data: caseRecord } = await supabase
      .from('cases')
      .select('id, provider_name, bill_data, patient_info, lob_letter_id, mail_status')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // Same paid gate as letter generation.
    if (!(await disputeUnlocked(supabase, user.id, caseId))) {
      return NextResponse.json(
        { error: 'Mailing the dispute letter requires an active purchase or membership.', code: 'payment_required' },
        { status: 402 }
      )
    }

    // Idempotency: don't mail twice for the same case.
    if (caseRecord.lob_letter_id && caseRecord.mail_status !== 'failed') {
      return NextResponse.json(
        { error: 'This letter has already been sent to mail.', code: 'already_mailed', alreadyMailed: true },
        { status: 409 }
      )
    }

    // Need a generated letter to mail.
    const { data: letterData } = await supabase
      .from('dispute_letters')
      .select('letter_content')
      .eq('case_id', caseId)
      .order('generated_at', { ascending: false })
      .limit(1)
    const letterContent = letterData?.[0]?.letter_content
    if (!letterContent) {
      return NextResponse.json(
        { error: 'Generate the dispute letter before mailing it.', code: 'no_letter' },
        { status: 409 }
      )
    }

    // Verify the recipient (provider) address first; block on a definitive
    // undeliverable so we never pay to mail into the void.
    const verification = await verifyUsAddress(toParsed)
    if (!verification.deliverable) {
      return NextResponse.json(
        {
          error:
            "We couldn't verify the provider's address as deliverable. Double-check the street, city, state, and ZIP.",
          code: 'undeliverable',
          deliverability: verification.deliverability,
          suggestion: verification.normalized ?? null,
        },
        { status: 422 }
      )
    }
    // Use Lob's normalized recipient address when it returned one.
    const toFinal = verification.normalized ?? toParsed

    // Fill the patient/provider placeholders, then render to print HTML.
    const patientInfo = (caseRecord.patient_info ?? {}) as Record<string, string | undefined>
    const billData = (caseRecord.bill_data ?? {}) as Record<string, unknown>
    const finalLetter = applyLetterSubstitutions(letterContent, {
      name: patientInfo.name,
      address: patientInfo.address,
      phone: patientInfo.phone,
      email: patientInfo.email,
      member_id: patientInfo.member_id,
      account_number: patientInfo.account_number,
      provider_name: caseRecord.provider_name,
      date_of_service: typeof billData.date_of_service === 'string' ? billData.date_of_service : undefined,
    })
    // Lob letters have a page cap. We mail ONLY the formal dispute letter
    // (letterContent) — never the long Evidentiary Package (cover sheet,
    // timeline, calculation worksheet, citation appendix), which is download-only
    // — so this stays short. Guard anyway and tell the user plainly if a letter
    // is somehow too long to mail, rather than letting Lob reject it opaquely.
    const MAX_LETTER_PAGES = 60
    const estimatedPages = Math.max(1, Math.ceil(finalLetter.length / 3000))
    if (estimatedPages > MAX_LETTER_PAGES) {
      return NextResponse.json(
        {
          error: `This letter is too long to mail automatically (about ${estimatedPages} pages; the limit is ${MAX_LETTER_PAGES}). Download it and mail it yourself.`,
          code: 'too_long',
        },
        { status: 422 }
      )
    }

    const html = buildLetterHtml(finalLetter)

    let created
    try {
      created = await createLetter({
        to: toFinal,
        from: fromParsed,
        html,
        certified,
        description: `Dispute letter — case ${caseId.slice(0, 8)}`,
        // Stable key so an accidental double-submit doesn't create two letters.
        idempotencyKey: `mail_${caseId}`,
      })
    } catch (lobErr) {
      // Don't mask the reason. Log Lob's actual error to Sentry, and return a
      // specific (sanitized) message for client errors (4xx = our payload, e.g.
      // a too-long name) vs a generic retry for Lob outages (5xx).
      const status = lobErr instanceof LobError ? lobErr.statusCode : 0
      console.error('Lob letter creation failed:', status, lobErr instanceof Error ? lobErr.message : lobErr)
      Sentry.captureException(lobErr, {
        tags: { route: 'mail-letter', stage: 'lob-create' },
        extra: { caseId, lobStatus: status },
      })
      if (lobErr instanceof LobError && status >= 400 && status < 500) {
        return NextResponse.json(
          {
            error: `The mail service couldn't accept this letter: ${humanizeLobMessage(lobErr.message)}`,
            code: 'lob_rejected',
          },
          { status: 422 }
        )
      }
      return NextResponse.json(
        { error: 'The mail service is temporarily unavailable. Please try again shortly.', code: 'lob_error' },
        { status: 502 }
      )
    }

    const testMode = isLobTestKey()

    // Persist mail state via the service role (these columns are server-only).
    const admin = createAdminClient()
    const { error: updateErr } = await admin
      .from('cases')
      .update({
        lob_letter_id: created.id,
        mail_status: testMode ? 'test_mode' : 'submitted',
        mail_expected_delivery: created.expectedDeliveryDate,
        mail_test_mode: testMode,
        mail_certified: certified,
        mailed_at: new Date().toISOString(),
        mail_to: toFinal,
        mail_from: fromParsed,
      })
      .eq('id', caseId)
      .eq('user_id', user.id)
    if (updateErr) {
      // The letter WAS created at Lob; log but still report success with the id
      // so the user isn't told it failed when it didn't.
      console.error('mail-letter: persisted state update failed:', updateErr)
    }

    return NextResponse.json({
      success: true,
      lobLetterId: created.id,
      status: testMode ? 'test_mode' : 'submitted',
      testMode,
      certified,
      expectedDeliveryDate: created.expectedDeliveryDate,
      carrier: created.carrier,
    })
  } catch (err) {
    console.error('mail-letter error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
