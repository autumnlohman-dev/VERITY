import type { NormalizedCBSSet } from '@/lib/cbs/schema'
import { normalizeCBSSet } from '@/lib/cbs/normalizer'
import { billExtractionToCBS } from '@/lib/cbs/extractor'
import { calculateDeadlines, type DeadlineResult } from './calculator'

// ─── Single source of truth for a case's deadlines (L2) ───────────────────────
// Both the case detail page (DeadlineTracker) and the dispute-letter page need
// the same submission/appeal deadlines. They previously diverged: the letter
// page hardcoded "letter date + 30 days" while the tracker used the per-rule
// calculator. These helpers are the one place a stored case row is turned into a
// CBS set and run through calculateDeadlines, so both surfaces agree.

// Prefer the server-persisted cross-document set; otherwise rebuild a
// single-document set from the stored line items. Returns null when neither is
// available.
export function cbsSetForCase(
  billData: Record<string, unknown> | null | undefined,
  providerName: string | null | undefined,
  caseId: string
): NormalizedCBSSet | null {
  const bd = (billData ?? {}) as Record<string, unknown>

  const persisted = bd.normalizedCbs as NormalizedCBSSet | undefined
  if (persisted && Array.isArray(persisted.documents) && persisted.documents.length > 0) {
    return persisted
  }

  const lineItems = (bd.lineItems as Array<Record<string, unknown>>) || []
  if (lineItems.length === 0) return null

  const cbsDoc = billExtractionToCBS(
    {
      lineItems: lineItems.map((li) => ({
        cpt_code: String(li.cpt_code || ''),
        description: String(li.description || ''),
        date_of_service: String(li.date_of_service || ''),
        units: Number(li.units) || 1,
        billed_amount: Number(li.billed_amount) || 0,
        modifiers: Array.isArray(li.modifiers) ? li.modifiers.map(String) : [],
      })),
      billMetadata: {
        provider_name: String(providerName || ''),
        provider_npi: '',
        bill_date: String(bd.date_of_service || ''),
        patient_name: '',
        account_number: String(caseId || ''),
      },
    },
    `bill_${caseId}`
  )
  return normalizeCBSSet([cbsDoc])
}

// All appeal/dispute deadlines for a case, from the one calculator the
// DeadlineTracker renders. Sorted missed-first, then soonest.
export function deadlinesForCase(
  billData: Record<string, unknown> | null | undefined,
  providerName: string | null | undefined,
  caseId: string
): DeadlineResult[] {
  const set = cbsSetForCase(billData, providerName, caseId)
  return set ? calculateDeadlines(set) : []
}
