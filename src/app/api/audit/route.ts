import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { runAudit, type LineItem } from '@/lib/errorDetection'
import { analyzeDisputedProcedures } from '@/lib/patientDisputes'
import { normalizeInsuranceType } from '@/lib/insuranceMapping'
import { NextResponse } from 'next/server'

// Anthropic generation runs longer than Vercel's 10s Hobby / 15s Pro default.
export const maxDuration = 60

function isLineItem(value: unknown): value is LineItem {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.cpt_code === 'string' &&
    typeof v.date_of_service === 'string' &&
    (typeof v.units === 'number' || typeof v.units === 'string') &&
    (typeof v.billed_amount === 'number' || typeof v.billed_amount === 'string')
  )
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { caseId, lineItems, insuranceType, userNotes } = body ?? {}

    if (!caseId || typeof caseId !== 'string') {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }

    if (!Array.isArray(lineItems) || !lineItems.every(isLineItem)) {
      return NextResponse.json(
        {
          error:
            'lineItems must be an array of line items with cpt_code, date_of_service, units, billed_amount'
        },
        { status: 400 }
      )
    }

    const { data: caseRecord, error: caseError } = await supabase
      .from('cases')
      .select('id, user_id, insurance_type, bill_data')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single()

    if (caseError || !caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const resolvedInsurance = normalizeInsuranceType(
      insuranceType ?? caseRecord.insurance_type
    )

    const caseNotes =
      caseRecord.bill_data &&
      typeof (caseRecord.bill_data as Record<string, unknown>).userNotes ===
        'string'
        ? ((caseRecord.bill_data as Record<string, unknown>).userNotes as string)
        : ''
    const resolvedNotes =
      (typeof userNotes === 'string' && userNotes.trim() && userNotes) ||
      caseNotes

    const normalizedItems: LineItem[] = lineItems.map((li) => ({
      cpt_code: String(li.cpt_code),
      description: typeof li.description === 'string' ? li.description : undefined,
      date_of_service: String(li.date_of_service),
      units: Number(li.units) || 1,
      billed_amount: Number(li.billed_amount) || 0,
      modifiers: Array.isArray(li.modifiers)
        ? li.modifiers.map((m: unknown) => String(m))
        : undefined
    }))

    const [ruleErrors, disputeErrors] = await Promise.all([
      runAudit(normalizedItems, resolvedInsurance, { supabase }),
      analyzeDisputedProcedures(normalizedItems, resolvedNotes)
    ])
    const errors = [...ruleErrors, ...disputeErrors]

    const totalExpected = errors.reduce(
      (sum, err) => sum + Number(err.expected_amount || 0),
      0
    )
    const totalBilledInErrors = errors.reduce(
      (sum, err) => sum + Number(err.billed_amount || 0),
      0
    )
    const potentialSavings = Math.max(0, totalBilledInErrors - totalExpected)

    const nextStatus = errors.length > 0 ? 'error_found' : 'no_errors'

    const { error: updateError } = await supabase
      .from('cases')
      .update({
        status: nextStatus,
        errors_found: errors,
        amount_expected: totalExpected,
        potential_savings: potentialSavings
      })
      .eq('id', caseId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Case update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to save audit results' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      caseId,
      status: nextStatus,
      errors,
      errorCount: errors.length,
      potentialSavings,
      insuranceType: resolvedInsurance
    })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error('Audit (Anthropic) error:', error.status, error.message)
      return NextResponse.json(
        { error: 'The dispute analysis is temporarily unavailable. Your bill data has been saved.' },
        { status: 503 }
      )
    }
    console.error('Audit error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
