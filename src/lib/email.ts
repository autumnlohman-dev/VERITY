/**
 * Transactional email (Resend), server-only.
 *
 * Env-gated like Sentry and PostHog: without RESEND_API_KEY every send is a
 * no-op that reports { sent: false }, so callers can degrade honestly.
 *
 * Privacy contract for anything this module sends: subjects and bodies may
 * carry dollar totals and error counts, never provider names, CPT codes, care
 * descriptions, or anything clinical. Subjects appear on lock screens and in
 * shared inboxes.
 */
import { Resend } from 'resend'

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export interface ReportEmailInput {
  to: string
  reportUrl: string
  errorCount: number
  potentialSavings: number
  expiresOn: string
}

const dollars = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Deliberately plain: a short serif document, not a marketing template.
// Email clients can't load brand fonts reliably, so Georgia stands in for
// Lora and the palette is inlined (CSS variables don't exist in email).
function reportEmailHtml({ reportUrl, errorCount, potentialSavings, expiresOn }: ReportEmailInput): string {
  const headline =
    errorCount > 0
      ? `We found ${errorCount === 1 ? '1 billing error' : `${errorCount} billing errors`} worth ${dollars(potentialSavings)}.`
      : 'We checked every charge and found nothing to dispute.'
  return `<div style="background:#F6F3EC;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#FCFAF5;border:1px solid #E2DACB;padding:32px;">
    <div style="font-family:Georgia,serif;font-size:13px;letter-spacing:0.3em;color:#33312B;margin-bottom:24px;">VERITY</div>
    <div style="font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#33312B;margin-bottom:16px;">${headline}</div>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:#5C594F;margin:0 0 24px;">
      Your full audit report is saved. Open it any time, from any device:
    </p>
    <a href="${reportUrl}" style="display:inline-block;background:#C9A876;color:#33312B;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;padding:14px 28px;">View my report</a>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#5C594F;margin:28px 0 0;">
      This link works until ${expiresOn}. Verity is an administrative advocacy service, not a law firm. We will never sell or share your information.
    </p>
  </div>
</div>`
}

function reportEmailText({ reportUrl, errorCount, potentialSavings, expiresOn }: ReportEmailInput): string {
  const headline =
    errorCount > 0
      ? `We found ${errorCount === 1 ? '1 billing error' : `${errorCount} billing errors`} worth ${dollars(potentialSavings)}.`
      : 'We checked every charge and found nothing to dispute.'
  return [
    headline,
    '',
    'Your full audit report is saved. Open it any time, from any device:',
    reportUrl,
    '',
    `This link works until ${expiresOn}.`,
    'Verity is an administrative advocacy service, not a law firm.',
  ].join('\n')
}

export async function sendReportEmail(input: ReportEmailInput): Promise<{ sent: boolean; error?: string }> {
  if (!emailEnabled()) return { sent: false, error: 'email_not_configured' }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM as string,
      to: input.to,
      subject:
        input.errorCount > 0
          ? `Your audit report: ${dollars(input.potentialSavings)} in potential overcharges`
          : 'Your audit report is ready',
      html: reportEmailHtml(input),
      text: reportEmailText(input),
    })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}
