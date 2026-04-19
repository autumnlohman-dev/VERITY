import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { careType, insuranceType, gfe, tier, amountBilled } = await request.json()

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        user_id: user.id,
        status: 'auditing',
        insurance_type: insuranceType,
        amount_billed: amountBilled || 0,
        bill_data: { careType, insuranceType, gfe, tier }
      })
      .select()
      .single()

    if (error) {
      console.error('Case creation error:', error)
      return NextResponse.json({ error: 'Failed to create case' }, { status: 500 })
    }

    return NextResponse.json({ success: true, caseId: newCase.id })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}