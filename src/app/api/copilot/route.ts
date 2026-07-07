import Anthropic from '@anthropic-ai/sdk'
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { boundedMessage, deidentifyFreeText } from '@/lib/ai/phiBoundary'
import { createClient } from '@/lib/supabase/server'
import { cbsSetForCase } from '@/lib/deadlines/forCase'
import { calculateDeadlines } from '@/lib/deadlines/calculator'
import { isSelfPay } from '@/lib/insuranceMapping'
import type { FinancialHarmScore } from '@/lib/scores/financialHarmScore'

// The Anthropic SDK needs the Node runtime (never edge). Copilot guidance is a
// short structured response (~1500 tokens), so a tight timeout keeps the live
// call snappy while the client shows the instant static fallback.
export const runtime = 'nodejs'
export const maxDuration = 60

// All Anthropic access goes through lib/ai/phiBoundary (EquiAI principle 2).
// The 55s SDK timeout is passed per-request via the boundary.

// ─── Guidance card shape (mirrors the client's GuidanceCard) ──────────────────
type CardKind = 'response' | 'citation' | 'escalation' | 'documentation' | 'warning'
const CARD_KINDS: CardKind[] = ['response', 'citation', 'escalation', 'documentation', 'warning']

interface GuidanceCard {
  kind: CardKind
  title: string
  body: string
  citation?: string
}

const cap = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

// Pull the first JSON object out of the model's text, tolerating ```json fences
// or stray prose around it. Returns null when nothing parseable is found.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

// GET /api/copilot?caseId=… → owner-verified case summary for the "Advising on
// your case" banner. The page used to read this with the browser Supabase client,
// which fails on RLS/session timing even for the owner; loading it here with the
// server client (same ownership check the POST uses) makes the banner reliable.
export async function GET(request: Request) {
  try {
    const caseId = new URL(request.url).searchParams.get('caseId')
    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: caseRow, error } = await supabase
      .from('cases')
      .select('id, provider_name, insurance_type, errors_found, bill_data')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Copilot case summary lookup error:', error)
      return NextResponse.json({ error: 'Failed to load case' }, { status: 500 })
    }
    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const billData = (caseRow.bill_data ?? {}) as Record<string, unknown>
    const cbsSet = cbsSetForCase(billData, caseRow.provider_name, String(caseRow.id))
    const fhs = (billData.fhs_score as FinancialHarmScore | undefined) ?? null

    return NextResponse.json({
      providerName: cap(caseRow.provider_name, 200) || 'Your provider',
      insurer: cap(caseRow.insurance_type, 100) || cap(billData.insuranceType, 100) || 'Insurance on file',
      errorCount: Array.isArray(caseRow.errors_found) ? caseRow.errors_found.length : 0,
      discrepancyCount: cbsSet?.crossDocumentDiscrepancies?.length ?? 0,
      fhs: fhs ? { score: fhs.score, tier: fhs.tier } : null,
    })
  } catch (error) {
    console.error('Copilot case summary error:', error)
    return NextResponse.json({ error: 'Failed to load case summary' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      statement?: unknown
      caseId?: unknown
    }
    // PHI boundary: the patient types what a live rep just said — it routinely
    // quotes the patient's own name, phone, or account number back at them.
    // Scrub before it crosses to the API (lib/ai/phiBoundary); coaching needs
    // the substance of the statement, not the identifiers.
    const statement = deidentifyFreeText(cap(body.statement, 2000).trim()).text
    if (!statement) {
      return NextResponse.json({ error: 'Missing statement' }, { status: 400 })
    }
    const caseId = typeof body.caseId === 'string' ? body.caseId : null

    // ── Load this case's context (owner-scoped). Case context is optional: a
    // signed-out guest, or a request with no caseId, still gets general guidance.
    let contextSection = ''
    let caseLoaded = false
    if (caseId) {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: caseRow } = await supabase
          .from('cases')
          .select('*')
          .eq('id', caseId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (caseRow) {
          caseLoaded = true
          const billData = (caseRow.bill_data ?? {}) as Record<string, unknown>
          const selfPay = isSelfPay(caseRow.insurance_type ?? billData.insuranceType)

          const cbsSet = cbsSetForCase(billData, caseRow.provider_name, String(caseRow.id))
          const deadlines = cbsSet
            ? calculateDeadlines(cbsSet, {
                selfPay,
                insuranceType: String(caseRow.insurance_type ?? billData.insuranceType ?? ''),
              })
            : []
          const fhs = (billData.fhs_score as FinancialHarmScore | undefined) ?? null

          // Documented dollar errors from the audit (negotiation ammunition).
          const errors = (Array.isArray(caseRow.errors_found) ? caseRow.errors_found : [])
            .slice(0, 40)
            .map((e: unknown) => {
              const o = (e ?? {}) as Record<string, unknown>
              return {
                cpt_code: cap(o.cpt_code, 20),
                error_type: cap(o.error_type, 40),
                description: cap(o.description, 200),
                billed_amount: Number(o.billed_amount) || 0,
                expected_amount: Number(o.expected_amount) || 0,
                rule_violated: cap(o.rule_violated, 300),
              }
            })

          const discrepancies = (cbsSet?.crossDocumentDiscrepancies ?? []).slice(0, 20).map((d) => ({
            type: d.type,
            severity: d.severity,
            estimatedDollarImpact: d.estimatedDollarImpact,
            description: cap(d.description, 300),
            applicableRegulations: (d.applicableRegulations ?? []).slice(0, 5).map((r) => cap(r, 160)),
          }))

          const deadlineSummary = deadlines.slice(0, 6).map((d) => ({
            type: d.deadlineType,
            deadlineDate: d.deadlineDate,
            daysRemaining: d.daysRemaining,
            urgency: d.urgencyLevel,
            regulation: cap(d.applicableRegulation, 160),
          }))

          const fhsSummary = fhs
            ? {
                score: fhs.score,
                tier: fhs.tier,
                totalDollarAtRisk: fhs.totalDollarAtRisk,
                topRisks: (fhs.topRisks ?? []).slice(0, 4).map((r) => cap(r, 160)),
              }
            : null

          contextSection = `
You are advising on a SPECIFIC, already-audited case. Ground every citation,
escalation, and number in the facts below — do not invent regulations or dollar
figures that are not supported here.

PROVIDER: ${cap(caseRow.provider_name, 200) || 'Unknown provider'}
INSURANCE: ${cap(caseRow.insurance_type, 100) || cap(billData.insuranceType, 100) || 'Unknown'}${selfPay ? ' (SELF-PAY / uninsured)' : ''}
AMOUNT BILLED: $${Number(caseRow.amount_billed) || 0}
AMOUNT EXPECTED: $${Number(caseRow.amount_expected) || 0}
POTENTIAL SAVINGS (documented overbilling): $${Number(caseRow.potential_savings) || 0}

FINANCIAL HARM SCORE: ${fhsSummary ? `${fhsSummary.score}/1000 (${fhsSummary.tier}) · $${fhsSummary.totalDollarAtRisk} at risk · top risks: ${fhsSummary.topRisks.join('; ') || 'n/a'}` : 'not yet computed'}

DOCUMENTED BILLING ERRORS (from the audit):
${errors.length ? JSON.stringify(errors, null, 2) : 'None recorded.'}

CROSS-DOCUMENT DISCREPANCIES (bill vs. EOB / other documents):
${discrepancies.length ? JSON.stringify(discrepancies, null, 2) : 'None recorded.'}

REGULATORY DEADLINES:
${deadlineSummary.length ? JSON.stringify(deadlineSummary, null, 2) : 'None computed.'}
`
        }
      }
    }

    const system = `You are Verity's Real-Time Advocacy Copilot. The patient is on a live phone
call with a provider, insurer, or debt collector and has just typed what the
representative said. Coach the patient: tell them exactly what to say back, which
law protects them, what to document, and how to negotiate — using THIS case's
actual findings when they are provided.

Rules:
- Draw every citation from the case's documented discrepancies, errors, and
  deadlines below. If no case context is provided, give sound general guidance
  and clearly grounded federal citations (No Surprises Act, FDCPA, FCRA, ACA §2719).
- Set "escalation" true when the representative's statement CONTRADICTS a
  documented case finding (e.g. they deny an overcharge the audit found, claim a
  balance the audit disputes, or assert a policy that a cited regulation overrides).
- For negotiation, anchor on the case's documented dollar errors / potential
  savings — give a concrete counter-number when the data supports one.
- This is administrative guidance, not legal advice. Never threaten litigation.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{
  "escalation": boolean,
  "cards": [
    {
      "kind": "response" | "citation" | "escalation" | "documentation" | "warning",
      "title": "short label (2-4 words)",
      "body": "what to say or do, in the second person",
      "citation": "optional — the specific statute/rule, only on citation/escalation cards"
    }
  ]
}
Return 2 to 4 cards, ordered most useful first. "response" = exact words to say.
"citation" = the right/law that protects them. "escalation" = who/what to escalate
to and why. "documentation" = what to write down. "warning" = what NOT to say.`

    const userContent = `The representative just said:
"""
${statement}
"""
${contextSection}
Coach the patient now. Return only the JSON object.`

    const message = await boundedMessage('call-copilot', 'deidentified', {
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: userContent }],
    }, { timeoutMs: 55_000 })

    const textBlock = message.content.find((b) => b.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const parsed = extractJson(raw) as { escalation?: unknown; cards?: unknown } | null

    if (!parsed || !Array.isArray(parsed.cards)) {
      // No usable model output — the client keeps its instant static fallback.
      return NextResponse.json(
        { error: 'No guidance produced. Showing standard guidance instead.' },
        { status: 502 }
      )
    }

    const cards: GuidanceCard[] = parsed.cards
      .slice(0, 4)
      .map((c) => {
        const o = (c ?? {}) as Record<string, unknown>
        const kind = CARD_KINDS.includes(o.kind as CardKind) ? (o.kind as CardKind) : 'response'
        const citation = cap(o.citation, 400).trim()
        return {
          kind,
          title: cap(o.title, 80).trim() || 'Guidance',
          body: cap(o.body, 1200).trim(),
          ...(citation ? { citation } : {}),
        }
      })
      .filter((c) => c.body.length > 0)

    if (cards.length === 0) {
      return NextResponse.json(
        { error: 'No guidance produced. Showing standard guidance instead.' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      escalation: parsed.escalation === true,
      caseAware: caseLoaded,
      cards,
    })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error('Copilot (Anthropic) error:', error.status, error.message)
      Sentry.captureException(error, {
        tags: { route: 'copilot', stage: 'anthropic' },
        extra: { status: error.status },
      })
      return NextResponse.json(
        { error: 'Live guidance is temporarily unavailable. Showing standard guidance.' },
        { status: 503 }
      )
    }
    // PHI-safe: name/message only — a raw error object can echo request content
    // (the rep statement, case findings) into log storage.
    console.error(
      'Copilot error:',
      error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'
    )
    Sentry.captureException(error, { tags: { route: 'copilot', stage: 'handler' } })
    return NextResponse.json({ error: 'Failed to generate guidance' }, { status: 500 })
  }
}
