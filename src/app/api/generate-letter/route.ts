import Anthropic from '@anthropic-ai/sdk'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { renderEmReviewForPrompt, type EmReview } from '@/lib/emReview'
import { disputeUnlocked } from '@/lib/entitlements'

// The Anthropic SDK needs the Node runtime (never edge). A full evidentiary
// letter is ~6000 output tokens (≈90–120s at Sonnet speeds), so the old 60s
// window timed out and surfaced as the "temporarily unavailable" error. Vercel
// Pro allows up to 300s — give generation room to finish.
export const runtime = 'nodejs'
export const maxDuration = 300

// Constructed lazily inside the handler, never at module scope (a module-scope
// SDK client evaluates on import; keep all construction in-handler). The SDK
// request timeout must sit just under maxDuration — at 60s it aborted long
// letters before they completed.
let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 290_000 })
  return _client
}

export async function POST(request: Request) {
  try {
    // The dispute letter is the paid "evidentiary package": generation requires
    // an authenticated user who either holds an active membership or has paid
    // the Single Dispute for this case. (The free bill audit is a separate
    // route and stays open to everyone.)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Please sign in to generate a dispute letter.', code: 'auth_required' },
        { status: 401 }
      )
    }

    const { caseId, errors, caseData, emReview } = (await request.json()) as {
      caseId?: string
      errors?: unknown
      caseData?: {
        provider_name?: string
        insurance_type?: string
        amount_billed?: number
        amount_expected?: number
        date_of_service?: string
        userNotes?: string
      }
      emReview?: EmReview
    }

    if (!caseId || !caseData) {
      return NextResponse.json(
        { error: 'Missing caseId or caseData' },
        { status: 400 }
      )
    }

    // L4: `errors` and `caseData` are interpolated straight into the Anthropic
    // prompt. Validate the shape and bound the size BEFORE the model call so an
    // oversized or malformed payload can't inflate the prompt (cost/DoS) or
    // smuggle in unbounded free text.
    const capStr = (v: unknown, max: number): string =>
      typeof v === 'string' ? v.slice(0, max) : ''
    const MAX_ERRORS = 100
    const safeErrors = (Array.isArray(errors) ? errors : []).slice(0, MAX_ERRORS).map((e) => {
      const o = (e ?? {}) as Record<string, unknown>
      return {
        cpt_code: capStr(o.cpt_code, 20),
        description: capStr(o.description, 300),
        error_type: capStr(o.error_type, 40),
        billed_amount: Number(o.billed_amount) || 0,
        expected_amount: Number(o.expected_amount) || 0,
        confidence: capStr(o.confidence, 16),
        explanation: capStr(o.explanation, 1200),
        rule_violated: capStr(o.rule_violated, 600),
      }
    })
    const safeCaseData = {
      provider_name: capStr(caseData.provider_name, 200),
      insurance_type: capStr(caseData.insurance_type, 100),
      amount_billed: Number(caseData.amount_billed) || 0,
      amount_expected: Number(caseData.amount_expected) || 0,
      date_of_service: capStr(caseData.date_of_service, 60),
    }

    // Verify this case belongs to the user.
    const { data: caseRecord } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single()

    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // Entitlement gate: members generate unlimited letters; everyone else must
    // have paid the Single Dispute for this specific case.
    if (!(await disputeUnlocked(supabase, user.id, caseId))) {
      return NextResponse.json(
        {
          error: 'Generating the dispute package requires an active purchase or membership.',
          code: 'payment_required',
        },
        { status: 402 }
      )
    }

    const userNotes: string = (
      (caseData && typeof caseData.userNotes === 'string' && caseData.userNotes) ||
      (caseRecord.bill_data && typeof caseRecord.bill_data.userNotes === 'string'
        ? caseRecord.bill_data.userNotes
        : '')
    ).slice(0, 4000) // L4: bound the free-text note injected into the prompt.

    const userNotesSection = userNotes.trim()
      ? `

Additional context provided by the patient: ${userNotes.trim()}

If the patient has described a service that was billed but not rendered, a procedure that was cancelled, or any other situational error not captured in the billing codes, incorporate this into the dispute letter with specific language citing that billing for unrendered services violates 42 C.F.R. § 1001.952 and CMS policy on billing for services not provided.`
      : ''

    // If the patient completed the E&M complexity review and the outcome is
    // 'confirmed' or 'borderline', inject their answers so the letter can make
    // a specific complexity argument citing CMS 2021 E&M guidelines. A
    // 'cleared' outcome means the upstream caller filtered E&M codes out of
    // `errors` — no narrative needed here.
    const emReviewSection =
      emReview && (emReview.outcome === 'confirmed' || emReview.outcome === 'borderline')
        ? `

${renderEmReviewForPrompt(emReview)}

E&M DISPUTE GUIDANCE:
- Cite the CMS 2021 E&M guidelines revision (for office/outpatient CPT 99202–99215) and, where applicable, the 2023 revision for emergency department codes (99281–99285). Reference that levels must be supported by either medical decision-making complexity OR total time, not by a fixed per-visit amount.
- Reference the patient's responses above as evidence the billed complexity level is not supported.
- If the outcome is 'borderline', request that the provider produce documentation substantiating the billed level or downcode to the level supported by the encounter.
- If the outcome is 'confirmed', request that the charge be adjusted to the E&M level supported by the visit's complexity and time.`
        : ''

    // Self-pay letters address the provider's billing office and omit insurer
    // fields; insured letters address the payer.
    const isSelfPay = /self|uninsured/i.test(safeCaseData.insurance_type || '')
    // The prose count must match the itemized list EXACTLY (a real letter said
    // "ten (10)" for an 11-error bill). Inject the authoritative count.
    const errorCount = safeErrors.length

    // Generate the dispute letter with Claude
    const message = await anthropic().messages.create({
      model: 'claude-sonnet-4-6',
      // Enough headroom for every error section (tables included) — 2000 tokens
      // truncated multi-error letters mid-table.
      max_tokens: 8000,
      system: `You are a medical billing advocate generating a formal dispute letter
on behalf of a patient. Use precise regulatory language. Cite the specific federal
rule violated for each error. Be firm but professional. Never threaten legal action.
Never suggest involving an attorney unless the situation clearly warrants it.
Format the letter professionally with proper sections and spacing.
Always include specific CPT codes, dollar amounts, and regulatory citations.`,
      messages: [{
        role: 'user',
        // The bracketed tokens below ([PATIENT NAME] / [ACCOUNT NUMBER] /
        // [MEMBER ID]) are intentional: the model is instructed to preserve
        // them verbatim in the generated letter so the patient can fill them
        // in by hand before sending. They are NOT leaked test data.
        content: `Generate a formal medical bill dispute letter for the following case:

Provider: ${safeCaseData.provider_name}
Insurance Type: ${safeCaseData.insurance_type}
Total Billed: $${safeCaseData.amount_billed}
Expected Amount: $${safeCaseData.amount_expected}
Date of Service: ${safeCaseData.date_of_service || 'See attached bill'}

This bill contains exactly ${errorCount} billing ${errorCount === 1 ? 'error' : 'errors'}, itemized below. When you state the number of errors anywhere in the letter, use exactly this number (${errorCount}) — do not recount, round, or summarize to a different figure. Write a clearly formatted section for EVERY one of the ${errorCount} errors; do not omit, merge, or stop early.

Errors Found:
${JSON.stringify(safeErrors, null, 2)}${userNotesSection}${emReviewSection}

SENDER BLOCK — begin the letter with exactly these placeholder tokens, each on its own line:
[PATIENT NAME]
[ADDRESS]
[PHONE]
[EMAIL]

The ONLY bracketed placeholders allowed anywhere in the letter are: [PATIENT NAME], [ADDRESS], [PHONE], [EMAIL], [ACCOUNT NUMBER]${isSelfPay ? '' : ', [MEMBER ID]'}. Represent the patient's full mailing address with the single token [ADDRESS] — never split it into separate street / city / state / ZIP lines, and never add a "[City, State, ZIP]" line. Reference the account number as [ACCOUNT NUMBER] where appropriate.${isSelfPay ? ' This is a SELF-PAY / uninsured patient: do NOT include a Member ID line or any insurer/member-portal references.' : ''}

The letter should:
1. Be addressed to ${isSelfPay ? "the provider's patient billing / accounts-receivable department" : "the insurance company's claims review department"}
2. State each billing error with the specific rule violated, citing the EXACT "rule_violated" text provided for each error verbatim — in particular, do NOT relabel a Clinical Laboratory Fee Schedule citation as the Physician Fee Schedule (or vice versa)
3. Request correction of each error with the correct amount
4. Reference ${isSelfPay ? "the No Surprises Act good-faith-estimate protections and the Hospital Price Transparency Rule" : "the No Surprises Act and applicable patient rights"}
5. Include a professional closing requesting a corrected statement within 30 days`
      }]
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    const letterContent = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    if (!letterContent) {
      console.error('Letter generation returned no text content', {
        stopReason: message.stop_reason,
      })
      return NextResponse.json(
        { error: 'Letter generation returned no content. Please try again.' },
        { status: 502 }
      )
    }

    // Save the letter to the database
    const { data: letter, error: dbError } = await supabase
      .from('dispute_letters')
      .insert({
        case_id: caseId,
        letter_content: letterContent
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB error:', dbError)
      return NextResponse.json({ error: 'Failed to save letter' }, { status: 500 })
    }

    // Update case status to letter_ready. If this fails the letter is still
    // saved and returned — but the case status will be stale, so report to
    // Sentry so we can reconcile.
    const { error: statusErr } = await supabase
      .from('cases')
      .update({ status: 'letter_ready' })
      .eq('id', caseId)
      .eq('user_id', user.id)
    if (statusErr) {
      console.error('Case status update failed:', statusErr)
      Sentry.captureException(statusErr, {
        tags: { route: 'generate-letter', stage: 'status-update' },
        extra: { caseId, letterId: letter.id },
      })
    }

    return NextResponse.json({ 
      success: true, 
      letter: letterContent,
      letterId: letter.id
    })

  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      // Includes APIConnectionTimeoutError (the SDK request timeout) — capture it
      // so a recurring timeout/limit is visible in Sentry, not just function logs.
      console.error('Letter generation (Anthropic) error:', error.status, error.message)
      Sentry.captureException(error, {
        tags: { route: 'generate-letter', stage: 'anthropic' },
        extra: { status: error.status },
      })
      return NextResponse.json(
        { error: 'Letter generation is temporarily unavailable. Please try again in a few minutes.' },
        { status: 503 }
      )
    }
    console.error('Letter generation error:', error)
    Sentry.captureException(error, { tags: { route: 'generate-letter', stage: 'handler' } })
    return NextResponse.json({ error: 'Failed to generate letter' }, { status: 500 })
  }
}