import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      careType,
      insuranceType,
      gfe,
      tier,
      amountBilled,
      userNotes,
      providerName,
      patientInfo
    } = await request.json()

    const normalizedProvider =
      typeof providerName === 'string' && providerName.trim()
        ? providerName.trim()
        : null

    const normalizedPatientInfo =
      patientInfo && typeof patientInfo === 'object' && !Array.isArray(patientInfo)
        ? Object.fromEntries(
            Object.entries(patientInfo as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string' && v.trim())
              .map(([k, v]) => [k, (v as string).trim()])
          )
        : null

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        user_id: user.id,
        status: 'auditing',
        insurance_type: insuranceType,
        provider_name: normalizedProvider,
        amount_billed: amountBilled || 0,
        bill_data: { careType, insuranceType, gfe, tier, userNotes: userNotes || '' },
        ...(normalizedPatientInfo && Object.keys(normalizedPatientInfo).length > 0
          ? { patient_info: normalizedPatientInfo }
          : {})
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
