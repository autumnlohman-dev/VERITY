import { createClient } from '@/lib/supabase/server'
import { runAudit, type LineItem, type InsuranceType } from '@/lib/errorDetection'
import { NextResponse } from 'next/server'

const VALID_INSURANCE_TYPES: InsuranceType[] = [
  'commercial',
  'medicare',
  'medicaid',
  'self-pay',
  'tricare',
  'other'
]

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
    const { caseId, lineItems, insuranceType } = body ?? {}

    if (!caseId || typeof caseId !== 'string') {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }

    if (!Array.isArray(lineItems) || !lineItems.every(isLineItem)) {
      return NextResponse.json(
        { error: 'lineItems must be an array of line items with cpt_code, date_of_service, units, billed_amount' },
        { status: 400 }
      )
    }

    if (!VALID_INSURANCE_TYPES.includes(insuranceType)) {
      return NextResponse.json(
        { error: `insuranceType must be one of: ${VALID_INSURANCE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const { data: caseRecord, error: caseError } = await supabase
      .from('cases')
      .select('id, user_id')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single()

    if (caseError || !caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

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

    const errors = await runAudit(normalizedItems, insuranceType as InsuranceType, {
      supabase
    })

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
      potentialSavings
    })
  } catch (error) {
    console.error('Audit error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
