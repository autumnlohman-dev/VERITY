import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendReportEmail, emailEnabled } from '@/lib/email'
import { captureServer } from '@/lib/analytics-server'
import { checkRateLimit, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

// Public route → throttle per source IP: 10 sends / 10 minutes.
const EMAIL_RATE_LIMIT = 10
const EMAIL_RATE_WINDOW_SECONDS = 600

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Deliberately loose: real validation is whether Resend accepts and delivers.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Sends a guest their persisted audit report link. The token is the only
// credential; possession of it already grants read access to the report, so
// emailing that same report to an address the possessor supplies leaks
// nothing new. No account required — this IS the email-capture moment.
export async function POST(request: Request) {
  try {
    const { token, email } = await request.json()
    if (typeof token !== 'string' || !UUID_RE.test(token)) {
      return NextResponse.json({ error: 'Invalid report link' }, { status: 400 })
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 320) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    }
    if (!emailEnabled()) {
      return NextResponse.json(
        { error: 'Email delivery isn’t available right now. Your report link still works.' },
        { status: 503 }
      )
    }

    const rl = await checkRateLimit({
      bucket: `email-report:${clientIp(request)}`,
      limit: EMAIL_RATE_LIMIT,
      windowSeconds: EMAIL_RATE_WINDOW_SECONDS,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests right now. Please wait a few minutes and try again.' },
        { status: 429 }
      )
    }

    const admin = createAdminClient()
    const { data: report } = await admin
      .from('guest_audit_reports')
      .select('id, guest_session_id, audit, expires_at')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!report) {
      return NextResponse.json({ error: 'This report link has expired or doesn’t exist' }, { status: 404 })
    }

    const audit = (report.audit ?? {}) as { errorCount?: number; potentialSavings?: number }
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const result = await sendReportEmail({
      to: email,
      reportUrl: `${site.replace(/\/$/, '')}/report/${token}`,
      errorCount: Number(audit.errorCount ?? 0),
      potentialSavings: Number(audit.potentialSavings ?? 0),
      expiresOn: new Date(report.expires_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    })
    if (!result.sent) {
      console.error('email-report: send failed:', result.error)
      return NextResponse.json(
        { error: 'We couldn’t send the email. Your report link still works.' },
        { status: 502 }
      )
    }

    // Remember where the report went so lifecycle email (deadline reminders,
    // follow-ups) has an address. Best-effort: the send already succeeded.
    const { error: saveErr } = await admin
      .from('guest_audit_reports')
      .update({ email, email_sent_at: new Date().toISOString() })
      .eq('id', report.id)
    if (saveErr) console.error('email-report: email save failed:', saveErr.message)

    await captureServer(report.guest_session_id || `report:${report.id}`, 'report_emailed', {
      report_id: report.id,
      findings_count: Number(audit.errorCount ?? 0),
      potential_savings: Number(audit.potentialSavings ?? 0),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('email-report error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
