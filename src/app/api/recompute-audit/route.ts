import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { LineItem } from '@/lib/errorDetection'
import type { BillingError } from '@/lib/errorDetection'
import { runDeterministicAudit } from '@/lib/audit/deterministicCore'
import { AUDIT_LOGIC_VERSION, auditVersionOf, classifyAuditFreshness } from '@/lib/audit/version'
import { normalizeInsuranceType } from '@/lib/insuranceMapping'
import { checkRateLimit } from '@/lib/rateLimit'
import { auditSnapshotFingerprint, markLettersStaleIfChanged } from '@/lib/letters/staleness'
import type { CanonicalBillingSchema, NormalizedCBSSet } from '@/lib/cbs/schema'

export const runtime = 'nodejs'

// Deterministic only (rules tables + math, no vision/LLM) — cheap, but still
// throttled so a client loop can't hammer the reference tables.
const RECOMPUTE_RATE_LIMIT = 30
const RECOMPUTE_RATE_WINDOW_SECONDS = 600

// ─── Bring a stale-version audit current WITHOUT re-running vision ────────────
// The vision outputs are persisted independently of the computed findings:
// bill line items in bill_data.lineItems, and the EOB's CBS document inside
// bill_data.normalizedCbs.documents. Re-running the deterministic core
// (normalize → detect → dedup → honest totals) over those inputs replaces the
// stale findings and stamps the current AUDIT_LOGIC_VERSION.
//
// Idempotent: same persisted inputs → same outputs, and a current-version case
// short-circuits before any work. Never touches the original documents, page
// refs, user notes, FHS state, or outcome history — only the computed layers.

function coerceLineItem(li: Record<string, unknown>): LineItem {
  return {
    cpt_code: String(li.cpt_code ?? ''),
    description: typeof li.description === 'string' ? li.description : '',
    date_of_service: String(li.date_of_service ?? ''),
    units: Number(li.units) || 1,
    billed_amount: Number(li.billed_amount) || 0,
    modifiers: Array.isArray(li.modifiers) ? li.modifiers.map(String) : [],
    encounter: typeof li.encounter === 'string' ? li.encounter : undefined,
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { caseId } = (await request.json()) as { caseId?: unknown }
    if (typeof caseId !== 'string' || !caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 })
    }

    const { data: caseRow, error: caseErr } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (caseErr) {
      console.error('recompute-audit case lookup error:', caseErr)
      return NextResponse.json({ error: 'Failed to load case' }, { status: 500 })
    }
    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const bd =
      caseRow.bill_data && typeof caseRow.bill_data === 'object' && !Array.isArray(caseRow.bill_data)
        ? (caseRow.bill_data as Record<string, unknown>)
        : {}

    // Abuse guard #1 — a current-version case returns early without running
    // the core (cheap 200); the stamp is the idempotency key.
    if (auditVersionOf(bd) >= AUDIT_LOGIC_VERSION) {
      return NextResponse.json({ current: true, case: caseRow })
    }
    if (classifyAuditFreshness(bd) !== 'recomputable') {
      // No persisted line items — bringing this current needs vision
      // re-extraction, which is the /api/extract re-run path, never a silent
      // recompute.
      return NextResponse.json(
        { error: 'This audit cannot be recomputed from stored data, re-run it.', code: 'rerun_required' },
        { status: 422 }
      )
    }

    // Abuse guard #2 — per-user throttle.
    const rl = await checkRateLimit({
      bucket: `recompute:${user.id}`,
      limit: RECOMPUTE_RATE_LIMIT,
      windowSeconds: RECOMPUTE_RATE_WINDOW_SECONDS,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many recomputes in a short period. Please wait a few minutes.' },
        { status: 429 }
      )
    }

    const fromVersion = auditVersionOf(bd)
    const lineItems = (bd.lineItems as Array<Record<string, unknown>>).map(coerceLineItem)

    // The persisted EOB CBS document (vision output stored by the normalizer).
    // Defensive clone: the core pins episode ids and the normalizer copies
    // adjudication values onto bill lines — never mutate the stored object.
    const storedCbs = bd.normalizedCbs as NormalizedCBSSet | undefined
    const storedEob = (storedCbs?.documents ?? []).find((d) => d.sourceDocumentType === 'eob')
    const eobCbs: CanonicalBillingSchema | null = storedEob
      ? {
          ...storedEob,
          lineItems: (storedEob.lineItems ?? []).map((l) => ({ ...l })),
          discrepancies: [],
          temporalInconsistencies: [],
        }
      : null

    // LLM-derived findings are carried over, not recomputed (the note analysis
    // is vision/LLM territory); dedup precedence still applies to them.
    const carryover = ((caseRow.errors_found as BillingError[] | null) ?? []).filter(
      (e) => e && e.error_type === 'patient_disputed'
    )

    const billPr = Number(bd.billPatientResponsibility)
    const result = await runDeterministicAudit({
      lineItems,
      insuranceType: normalizeInsuranceType(caseRow.insurance_type ?? bd.insuranceType),
      provider: caseRow.provider_name ?? null,
      dateOfService: typeof bd.date_of_service === 'string' ? bd.date_of_service : null,
      lowConfidence: Array.isArray(bd.lowConfidence) ? bd.lowConfidence.map(String) : [],
      docIdBase: caseId,
      accountNumber: caseId,
      eobCbs,
      eobSupplied: bd.hasEob === true || bd.eobError === true,
      billTotals: {
        statedTotalBilled: null, // not persisted pre-stamp; partial-read flag is preserved below
        patientResponsibility: Number.isFinite(billPr) && billPr >= 0 ? billPr : null,
      },
      extraErrors: carryover,
      supabase,
    })

    // Persist ONLY the computed layers + the stamp. Original documents, page
    // refs, notes, FHS answers, outcome ids, and provenance keys all survive.
    // A letter_ready status is preserved (that letter's provenance is handled
    // by the letter-generation version gate, not by demoting the case).
    const nextStatus =
      caseRow.status === 'error_found' || caseRow.status === 'no_errors'
        ? result.errorCount > 0
          ? 'error_found'
          : 'no_errors'
        : caseRow.status

    const { data: updated, error: updateErr } = await supabase
      .from('cases')
      .update({
        status: nextStatus,
        amount_billed: result.totalBilled,
        amount_expected: result.totalExpected,
        potential_savings: result.potentialSavings,
        errors_found: result.errors,
        bill_data: {
          ...bd,
          normalizedCbs: result.normalizedCbs,
          hasEob: result.hasEob,
          eobError: result.eobError,
          eobPatientResponsibility: result.eobPatientResponsibility,
          auditLogicVersion: AUDIT_LOGIC_VERSION,
        },
      })
      .eq('id', caseId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (updateErr) {
      console.error(`recompute-audit[${caseId}]: persist failed:`, updateErr)
      return NextResponse.json({ error: 'Failed to save recomputed audit' }, { status: 500 })
    }

    // Any letter written from the previous results now disagrees with the case
    // — mark it stale (view-only until regenerated). Letters whose snapshot
    // still matches are untouched, so a no-op recompute never invalidates.
    await markLettersStaleIfChanged(supabase, caseId, auditSnapshotFingerprint(updated))

    console.info(
      `recompute-audit[${caseId}]: recomputed v${fromVersion} → v${AUDIT_LOGIC_VERSION} ` +
        `(errors ${((caseRow.errors_found as unknown[]) ?? []).length} → ${result.errors.length}, ` +
        `savings ${Number(caseRow.potential_savings ?? 0)} → ${result.potentialSavings})`
    )

    return NextResponse.json({ recomputed: true, case: updated })
  } catch (error) {
    console.error(
      'recompute-audit error:',
      error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'
    )
    return NextResponse.json({ error: 'Recompute failed' }, { status: 500 })
  }
}
