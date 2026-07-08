import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillingError, InsuranceType, LineItem } from '@/lib/errorDetection'
import { analyzeDisputedProcedures } from '@/lib/patientDisputes'
import { isExtractableExt } from '@/lib/cbs/extractor'
import { extractEOBToCBS } from '@/lib/cbs/eobExtractor'
import { isHeicBuffer } from '@/lib/heic'
import type { CanonicalBillingSchema } from '@/lib/cbs/schema'
import { logAnthropicError } from '../ai/phiBoundary'
import { runDeterministicAudit, type FullAuditResult } from './deterministicCore'

// ─── The one audit pipeline ──────────────────────────────────────────────────
// Every audit — the guest preview (/api/audit-guest), the signed-in audit
// (/api/extract), and the carry-through-signup import (/api/claim-guest-audit)
// — funnels through runFullAudit so an identical bill produces an IDENTICAL
// result everywhere: same errors, same CBS, and the same headline math.
//
// This module owns only the NON-deterministic stages: the vision EOB
// extraction and the LLM patient-dispute analysis. Everything downstream
// (normalize → detect → dedup → honest totals) lives in ./deterministicCore,
// shared with /api/recompute-audit so stale-version cases can be brought
// current from persisted extraction data without re-spending vision tokens.

// Findings the audit could not price are NOT overcharges — see the definition
// (moved to a dependency-free module so the client-bundled letterPdf can share
// it without pulling this file's server-only graph). Re-exported here so
// existing server-side imports are unchanged.
import { MANUAL_REVIEW_ERROR_TYPES } from './manualReview'
export { MANUAL_REVIEW_ERROR_TYPES }

// Savings math lives in the dependency-light ./savings module (tests and
// client code import it without this file's server-only graph); re-exported
// here so existing server imports are unchanged. Same for the result type.
import { computeRecoverable, capPotentialSavings, markJustificationOnly } from './savings'
export { computeRecoverable, capPotentialSavings, markJustificationOnly }
export type { FullAuditResult }

export interface FullAuditInput {
  lineItems: LineItem[]
  insuranceType: InsuranceType
  /** Provider/date/confidence from vision extraction (absent on the re-audit path). */
  provider?: string | null
  dateOfService?: string | null
  /** Field names the vision extractor flagged as low-confidence (string[], not a flag). */
  lowConfidence?: string[]
  /** Namespaces the CBS document ids: `bill_${docIdBase}` / `eob_${docIdBase}`. */
  docIdBase: string
  /** Patient's free-text note. When present, an LLM flags line items the patient
   *  reports as not-rendered / disputed (error_type 'patient_disputed'). */
  userNotes?: string
  /** Stamped onto the bill CBS metadata (the case id when persisting, else ''). */
  accountNumber?: string
  /** Optional EOB to drive the cross-document (bill vs EOB) comparison. */
  eob?: { base64: string; ext: string } | null
  /** The bill's own stated summary figures from vision extraction:
   *  patientResponsibility = the bottom-line the patient is asked to pay (the
   *  honest ceiling on potential savings); statedTotalBilled powers the
   *  partial-read guard. */
  billTotals?: {
    statedTotalBilled?: number | null
    patientResponsibility?: number | null
  }
  supabase?: SupabaseClient
}

export async function runFullAudit(input: FullAuditInput): Promise<FullAuditResult> {
  const {
    lineItems,
    insuranceType,
    provider = null,
    dateOfService = null,
    lowConfidence = [],
    docIdBase,
    accountNumber = '',
    eob = null,
    billTotals,
    userNotes,
    supabase,
  } = input

  // ── Vision stage: EOB extraction ────────────────────────────────────────────
  // Gate on extension OR content: an iPhone HEIC EOB often arrives with no
  // extension or an image/heic mimetype, so the .heic ext check alone would skip
  // it and (wrongly) set eobError. Detect HEIC by magic bytes too; the shared
  // boundary in extractEOBToCBS then transcodes it to JPEG before the vision call.
  let eobCbs: CanonicalBillingSchema | null = null
  if (eob && eob.base64) {
    const eobIsExtractable =
      isExtractableExt(eob.ext) || isHeicBuffer(Buffer.from(eob.base64, 'base64'))
    if (!eobIsExtractable) {
      // An EOB was supplied but we can't process its file type — log so a silent
      // bill-only result is traceable, then fall through to eobError downstream.
      console.warn(
        `runFullAudit[${docIdBase}]: EOB supplied but ext "${eob.ext}" is not extractable (and not HEIC by content), skipping; audit will be bill-only.`
      )
    } else {
      try {
        eobCbs = await extractEOBToCBS(eob.base64, eob.ext, `eob_${docIdBase}`)
        console.info(`runFullAudit[${docIdBase}]: EOB extracted, cross-document comparison enabled.`)
      } catch (eobErr) {
        // EOB unreadable — degrade gracefully to a bill-only audit.
        // PHI-safe: an APIError can echo request content (the EOB itself) into logs.
        console.error(`runFullAudit[${docIdBase}]: EOB extraction error: ${eobErr instanceof Error ? `${eobErr.name}: ${eobErr.message}` : 'unknown'}`)
        eobCbs = null
      }
    }
  }

  // ── LLM stage: patient-reported disputes (Component: patient_disputed) ─────
  // When the patient wrote a note, an LLM flags line items they say weren't
  // rendered / are wrong. Best-effort: a failure here (e.g. Anthropic rate
  // limit) must not sink the whole audit, so we log and continue with the
  // rules findings only.
  const disputeErrors: BillingError[] = []
  if (userNotes && userNotes.trim()) {
    try {
      // Pass the identifiers this pipeline knows so their literal values are
      // scrubbed from the note (accountNumber is the case/account reference —
      // the only identifier stored server-side under the de-id default).
      const found = await analyzeDisputedProcedures(lineItems, userNotes, { accountNumber })
      disputeErrors.push(...found)
    } catch (err) {
      logAnthropicError('dispute-analysis', err) // PHI-safe: never log the raw error object
    }
  }

  // ── Deterministic core (shared with /api/recompute-audit) ──────────────────
  return runDeterministicAudit({
    lineItems,
    insuranceType,
    provider,
    dateOfService,
    lowConfidence,
    docIdBase,
    accountNumber,
    eobCbs,
    eobSupplied: !!(eob && eob.base64),
    billTotals,
    extraErrors: disputeErrors,
    supabase,
  })
}
