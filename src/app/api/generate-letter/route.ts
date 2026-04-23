import Anthropic from '@anthropic-ai/sdk'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { renderEmReviewForPrompt, type EmReview } from '@/lib/emReview'

// Anthropic generation runs longer than Vercel's 10s Hobby / 15s Pro default.
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 60_000,
})

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()

if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Verify this case belongs to the user
    const { data: caseRecord } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single()

    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const userNotes: string =
      (caseData && typeof caseData.userNotes === 'string' && caseData.userNotes) ||
      (caseRecord.bill_data && typeof caseRecord.bill_data.userNotes === 'string'
        ? caseRecord.bill_data.userNotes
        : '')

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

    // Generate the dispute letter with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
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

Provider: ${caseData.provider_name}
Insurance Type: ${caseData.insurance_type}
Total Billed: $${caseData.amount_billed}
Expected Amount: $${caseData.amount_expected}
Date of Service: ${caseData.date_of_service || 'See attached bill'}
Patient: [PATIENT NAME]
Account Number: [ACCOUNT NUMBER]
Member ID: [MEMBER ID]

Errors Found:
${JSON.stringify(errors, null, 2)}${userNotesSection}${emReviewSection}

The letter should:
1. Be addressed to the insurance company claims review department
2. Clearly state each billing error with the specific rule violated
3. Request correction of each error with the correct amount
4. Reference the No Surprises Act and applicable patient rights
5. Include a professional closing requesting response within 30 days`
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
      console.error('Letter generation (Anthropic) error:', error.status, error.message)
      return NextResponse.json(
        { error: 'Letter generation is temporarily unavailable. Please try again in a few minutes.' },
        { status: 503 }
      )
    }
    console.error('Letter generation error:', error)
    return NextResponse.json({ error: 'Failed to generate letter' }, { status: 500 })
  }
}