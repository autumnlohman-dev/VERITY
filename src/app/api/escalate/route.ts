import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  buildSecondLevelAppeal,
  buildDoiComplaint,
  buildCreditBureauDisputes,
  buildCollectorValidation,
  type EscalationFacts,
  type EscalationFinding,
} from '@/lib/letters/escalationTemplates'
import { auditSnapshotFingerprint } from '@/lib/letters/staleness'
import { AUDIT_LOGIC_VERSION } from '@/lib/audit/version'

export const runtime = 'nodejs'

// Escalation letter generation (step 4). Deterministic templates, no LLM.
// Gates are enforced HERE, not just in the UI:
//   second_level_appeal    → outcome denied, or no_response with its response
//                            window elapsed (an escalation_window deadline
//                            exists or the response_window is expired)
//   doi_complaint          → cases.patient_state set and in the routing table
//   credit_bureau_dispute  → cases.on_credit_report = true
//   collector_dispute      → cases.in_collections = true
// Every letter lands in dispute_letters with its letter_type and stays behind
// the human review gate: nothing here files or mails anything.
const PATHWAYS = new Set(['second_level_appeal', 'doi_complaint', 'credit_bureau_dispute', 'collector_dispute'])

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = (await request.json().catch(() => ({}))) as { outcomeId?: unknown; pathway?: unknown }
    const outcomeId = typeof body.outcomeId === 'string' ? body.outcomeId : ''
    const pathway = typeof body.pathway === 'string' ? body.pathway : ''
    if (!outcomeId || !PATHWAYS.has(pathway)) {
      return NextResponse.json({ error: 'Missing outcomeId or unknown pathway' }, { status: 400 })
    }

    const rl = await checkRateLimit({ bucket: `escalate:${user.id}`, limit: 30, windowSeconds: 3600 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many letters generated in a short period. Please wait and retry.' }, { status: 429 })
    }

    const { data: outcome } = await supabase
      .from('dispute_outcomes')
      .select('id, case_id, status, sent_at, lob_letter_id, response_received_at, response_summary')
      .eq('id', outcomeId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!outcome || !outcome.case_id) {
      return NextResponse.json({ error: 'Outcome not found' }, { status: 404 })
    }
    if (!outcome.sent_at) {
      return NextResponse.json({ error: 'Only dispatched letters can be escalated' }, { status: 422 })
    }

    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, provider_name, potential_savings, errors_found, bill_data, patient_state, in_collections, on_credit_report')
      .eq('id', outcome.case_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

    // Escalation readiness: denied outright, or documented silence after the
    // response window (the deadline engine opened/expired the windows).
    const { data: dls } = await supabase
      .from('deadlines')
      .select('deadline_type, status')
      .eq('outcome_id', outcomeId)
    const windowElapsed = (dls ?? []).some(
      (d) =>
        (d.deadline_type === 'response_window' && d.status === 'expired') ||
        d.deadline_type === 'escalation_window'
    )
    const escalatable = outcome.status === 'denied' || (outcome.status === 'no_response' && windowElapsed)
    if (!escalatable) {
      return NextResponse.json(
        { error: 'Escalation opens after a denial, or after the response window passes with no response.', code: 'not_escalatable' },
        { status: 422 }
      )
    }

    // Pathway-specific intake gates (Part B facts).
    if (pathway === 'credit_bureau_dispute' && caseRow.on_credit_report !== true) {
      return NextResponse.json({ error: 'Credit bureau disputes apply only when the debt appears on your credit report.', code: 'gate_failed' }, { status: 422 })
    }
    if (pathway === 'collector_dispute' && caseRow.in_collections !== true) {
      return NextResponse.json({ error: 'Collection disputes apply only when the bill has been sent to a collection agency.', code: 'gate_failed' }, { status: 422 })
    }

    // Unresolved findings, post quality rules: audit errors are already
    // deduped/justification-marked when persisted; disputable only.
    const MANUAL_REVIEW_TYPES = new Set(['rate_unavailable', 'reference_data_missing', 'coding_observation'])
    const findings: EscalationFinding[] = (Array.isArray(caseRow.errors_found) ? caseRow.errors_found : [])
      .map((e) => (e ?? {}) as Record<string, unknown>)
      .filter((e) => !MANUAL_REVIEW_TYPES.has(String(e.error_type)))
      .slice(0, 100)
      .map((e) => ({
        cptCode: String(e.cpt_code ?? '').slice(0, 20),
        description: String(e.description ?? '').slice(0, 200),
        errorType: String(e.error_type ?? '').slice(0, 40),
        correctionAmount:
          e.justification_only === true ? 0 : Math.max(0, (Number(e.billed_amount) || 0) - (Number(e.expected_amount) || 0)),
        ruleViolated: String(e.rule_violated ?? '').slice(0, 400),
      }))

    const billData = (caseRow.bill_data ?? {}) as Record<string, unknown>
    const facts: EscalationFacts = {
      providerName: caseRow.provider_name ?? 'the provider',
      dateOfService: typeof billData.date_of_service === 'string' ? billData.date_of_service : '',
      amountInDispute: Number(caseRow.potential_savings) || findings.reduce((s, f) => s + f.correctionAmount, 0),
      patientState: caseRow.patient_state as string | null,
      firstLetterDate: outcome.sent_at as string,
      lobLetterId: outcome.lob_letter_id as string | null,
      responseReceivedAt: outcome.response_received_at as string | null,
      responseSummary: outcome.response_summary as string | null,
      findings,
      collectorName: null,
    }

    let letters: Array<{ label: string; letterType: string; content: string }>
    if (pathway === 'second_level_appeal') {
      letters = [{ label: 'Second-level appeal', letterType: 'appeal', content: buildSecondLevelAppeal(facts) }]
    } else if (pathway === 'doi_complaint') {
      const built = buildDoiComplaint(facts)
      if ('error' in built) return NextResponse.json({ error: built.error, code: 'state_unsupported' }, { status: 422 })
      letters = [{ label: `${built.agency.agencyName} complaint`, letterType: 'regulator_complaint', content: built.letter }]
    } else if (pathway === 'credit_bureau_dispute') {
      letters = buildCreditBureauDisputes(facts).map((b) => ({
        label: `${b.bureau} dispute (FCRA § 611)`,
        letterType: 'credit_bureau_dispute',
        content: b.letter,
      }))
    } else {
      letters = [{ label: 'Collection agency validation (FDCPA § 809)', letterType: 'collector_dispute', content: buildCollectorValidation(facts) }]
    }

    // Persist each letter as a DRAFT with its escalation rung, stamped with the
    // audit snapshot it restates (D3): an audit version bump or recompute marks
    // unsent escalation drafts stale exactly like first letters — and without a
    // stamp the legacy-null rule would treat them as permanently stale.
    const fingerprint = auditSnapshotFingerprint(caseRow)
    const inserted: Array<{ id: string; label: string; letterType: string; content: string }> = []
    for (const l of letters) {
      const { data: row, error } = await supabase
        .from('dispute_letters')
        .insert({
          case_id: outcome.case_id,
          letter_content: l.content,
          letter_type: l.letterType,
          audit_logic_version: AUDIT_LOGIC_VERSION,
          audit_fingerprint: fingerprint,
        })
        .select('id')
        .single()
      if (error) {
        console.error(`escalate[${outcomeId}]: dispute_letters insert failed (${l.letterType}):`, error)
        return NextResponse.json({ error: 'Failed to save the generated letter' }, { status: 500 })
      }
      inserted.push({ id: row.id as string, ...l })
    }

    return NextResponse.json({ success: true, letters: inserted })
  } catch (err) {
    console.error('escalate error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
