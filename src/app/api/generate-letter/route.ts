import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()

if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

    const { caseId, errors, caseData } = await request.json()

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
        content: `Generate a formal medical bill dispute letter for the following case:

Provider: ${caseData.provider_name}
Insurance Type: ${caseData.insurance_type}
Total Billed: $${caseData.amount_billed}
Expected Amount: $${caseData.amount_expected}
Date of Service: ${caseData.date_of_service || 'See attached bill'}
Patient: [PATIENT NAME]
Member ID: [MEMBER ID]

Errors Found:
${JSON.stringify(errors, null, 2)}

The letter should:
1. Be addressed to the insurance company claims review department
2. Clearly state each billing error with the specific rule violated
3. Request correction of each error with the correct amount
4. Reference the No Surprises Act and applicable patient rights
5. Include a professional closing requesting response within 30 days`
      }]
    })

    const letterContent = message.content[0].type === 'text' 
      ? message.content[0].text 
      : ''

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

    // Update case status to letter_ready
    await supabase
      .from('cases')
      .update({ status: 'letter_ready' })
      .eq('id', caseId)

    return NextResponse.json({ 
      success: true, 
      letter: letterContent,
      letterId: letter.id
    })

  } catch (error) {
    console.error('Letter generation error:', error)
    return NextResponse.json({ error: 'Failed to generate letter' }, { status: 500 })
  }
}