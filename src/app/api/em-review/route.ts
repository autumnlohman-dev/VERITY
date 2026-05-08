import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import {
  EM_QUESTIONS,
  getEmFlaggedCodes,
  scoreEmReview,
  type EmAnswer,
  type EmOutcome,
  type EmReview,
} from '@/lib/emReview'

interface PostBody {
  caseId?: unknown
  answers?: unknown
}

function parseAnswers(raw: unknown): Array<{ questionId: string; optionIndex: number }> | null {
  if (!Array.isArray(raw)) return null
  const parsed: Array<{ questionId: string; optionIndex: number }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const record = item as Record<string, unknown>
    const questionId = record.questionId
    const optionIndex = record.optionIndex
    if (typeof questionId !== 'string' || typeof optionIndex !== 'number') return null
    parsed.push({ questionId, optionIndex })
  }
  return parsed
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    // Beta: auth gate removed. `user` may be null; downstream user_id filters
    // are skipped when it is.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const body = (await request.json().catch(() => ({}))) as PostBody
    const caseId = typeof body.caseId === 'string' ? body.caseId : null
    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }

    const inputs = parseAnswers(body.answers)
    if (!inputs || inputs.length !== EM_QUESTIONS.length) {
      return NextResponse.json(
        { error: `Expected ${EM_QUESTIONS.length} answers` },
        { status: 400 }
      )
    }

    // Defensive user_id filter in addition to RLS — only when authenticated.
    let caseQuery = supabase
      .from('cases')
      .select('id, bill_data, errors_found')
      .eq('id', caseId)
    if (user) caseQuery = caseQuery.eq('user_id', user.id)
    const { data: caseRow, error: caseErr } = await caseQuery.single()

    if (caseErr || !caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const scored = scoreEmReview(inputs)
    const flaggedCodes = getEmFlaggedCodes(
      Array.isArray(caseRow.errors_found) ? caseRow.errors_found : []
    )
    const review: EmReview = {
      answers: scored.answers as EmAnswer[],
      score: scored.score,
      outcome: scored.outcome as EmOutcome,
      submitted_at: new Date().toISOString(),
      flagged_codes: flaggedCodes,
    }

    const existingBillData =
      caseRow.bill_data && typeof caseRow.bill_data === 'object'
        ? (caseRow.bill_data as Record<string, unknown>)
        : {}
    const nextBillData = { ...existingBillData, em_review: review }

    let updateQuery = supabase
      .from('cases')
      .update({ bill_data: nextBillData })
      .eq('id', caseId)
    if (user) updateQuery = updateQuery.eq('user_id', user.id)
    const { error: updateErr } = await updateQuery

    if (updateErr) {
      console.error('em-review save failed:', updateErr)
      Sentry.captureException(updateErr, {
        tags: { route: 'em-review' },
        extra: { caseId },
      })
      return NextResponse.json(
        { error: 'Failed to save E&M review' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      outcome: review.outcome,
      score: review.score,
      review,
    })
  } catch (error) {
    console.error('em-review error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
