import type {
  CanonicalBillingSchema,
  CBSLineItem,
  DocumentType,
} from './schema'

// This module is PURE and client-safe: regex/transform helpers with no external
// SDKs. It is imported by client-reachable code (deadlines/forCase → the case and
// letter pages), so it must NEVER import @anthropic-ai/sdk. The multimodal EOB
// extraction that needs Anthropic lives in the server-only sibling
// ./eobExtractor, which imports extractToCBS + EOB_MEDIA_TYPES from here.

// ─── Document type detection ──────────────────────────────────────────────────

export function detectDocumentType(text: string): DocumentType {
  const lower = text.toLowerCase()
  if (lower.includes('explanation of benefits') || lower.includes('eob') || lower.includes('remittance')) return 'eob'
  if (lower.includes('denial') || lower.includes('denied') || lower.includes('not covered')) return 'denial_letter'
  if (lower.includes('authorization') || lower.includes('prior auth') || lower.includes('pre-authorization')) return 'prior_authorization'
  if (lower.includes('collection') || lower.includes('past due') || lower.includes('debt') || lower.includes('collections')) return 'collection_notice'
  if (lower.includes('good faith estimate') || lower.includes('gfe')) return 'good_faith_estimate'
  if (lower.includes('credit report') || lower.includes('credit bureau') || lower.includes('equifax') || lower.includes('transunion') || lower.includes('experian')) return 'credit_notice'
  if (lower.includes('medical record') || lower.includes('discharge summary') || lower.includes('operative report')) return 'medical_record'
  // Default: itemized bill if it has dollar amounts and procedure-like content
  if (/\$[\d,]+/.test(text) || lower.includes('charge') || lower.includes('billed')) return 'itemized_bill'
  return 'unknown'
}

// ─── Regex helpers ────────────────────────────────────────────────────────────

function extractFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m) return m[1]?.trim() || m[0]?.trim()
  }
  return undefined
}

function extractDate(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(
      label + '[:\\s]+([\\d]{1,2}[/\\-][\\d]{1,2}[/\\-][\\d]{2,4}|[\\d]{4}-[\\d]{2}-[\\d]{2})',
      'i'
    )
    const m = text.match(re)
    if (m) return normalizeDate(m[1])
  }
  // generic date pattern near label
  return undefined
}

function normalizeDate(raw: string): string {
  if (!raw) return ''
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // MM/DD/YYYY or MM-DD-YYYY
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return raw
}

function extractDollarAmount(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const re = new RegExp(label + '[:\\s]*\\$?([\\d,]+\\.?\\d*)', 'i')
    const m = text.match(re)
    if (m) return parseFloat(m[1].replace(/,/g, ''))
  }
  return undefined
}

// ─── EOB-specific extraction ──────────────────────────────────────────────────
// Real commercial EOBs are NOT bills. Most lines carry a plain service
// description ("Laboratory Services", "Medical Visits") and dollar columns —
// NOT a CPT/HCPCS code. Requiring a code is the bug that made the matcher find
// zero overlap with the itemized bill and falsely report every bill code as
// "not adjudicated". This parser therefore captures, per line: service
// description, service date, amount_billed, allowed_amount (the "Amount
// Covered/Allowed" column), patient_responsibility (the "Your Total Costs"
// column), note flags (e.g. "not payable with the diagnosis billed"), and an
// OPTIONAL cpt_code when the payer happens to print one. A missing code is
// expected and never treated as an error. (Lives here in the pure module so the
// server-only ./eobExtractor vision layer can reuse it via extractToCBS.)
//
// It captures EVERY row of EVERY claim — including each line inside a multi-line
// claim, whose rows inherit the date of service printed once on the claim header
// — and maps columns by the header order so a "Discounts and Reductions" column
// is never mistaken for the allowed amount. Claim/page totals are skipped.

// Phrases that, on or below a line, mean the service was denied or written off —
// the patient should owe nothing for it.
const DENIAL_NOTE_PATTERNS: RegExp[] = [
  /not\s+payable/i,
  /not\s+covered/i,
  /non-?covered/i,
  /\bdenied\b/i,
  /\bdenial\b/i,
  /excluded/i,
]

// Canonical EOB table. The server-only vision transcription (./eobExtractor)
// NORMALIZES every real EOB — whatever its native layout — into one pipe-
// delimited table with this fixed header, emitted exactly once:
//
//   claim_ref | service_description | service_date | amount_billed | allowed_amount | patient_responsibility | flag
//
// The vision model does the semantic column mapping. A commercial EOB commonly
// prints NINE money columns (Amount Billed | Discounts and Reductions | Amount
// Covered (Allowed) | Health Plan Responsibility | Deductible | Copay |
// Coinsurance | Amount Not Covered | Your Total Costs) — of those only billed /
// allowed / your-total-costs matter here, and the model collapses the rest. This
// parser then resolves columns STRICTLY BY HEADER NAME and never positionally,
// so a "Discounts and Reductions" column can never be misread as the allowed
// amount (the bug that mis-mapped every line on a wide multi-column EOB).
type CanonicalField =
  | 'claimRef'
  | 'description'
  | 'serviceDate'
  | 'billed'
  | 'allowed'
  | 'patientResp'
  | 'flag'

const CANONICAL_COLUMNS: Record<string, CanonicalField> = {
  claim_ref: 'claimRef',
  service_description: 'description',
  service_date: 'serviceDate',
  amount_billed: 'billed',
  allowed_amount: 'allowed',
  patient_responsibility: 'patientResp',
  flag: 'flag',
}

const EOB_SUMMARY_ROW = /\b(total|subtotal|grand\s+total|balance\s+forward)\b/i
const EOB_DATE_RE = /\b(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/
const EOB_MONEY_RE = /\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})/g
// CPT (5 digits) or HCPCS (letter + 4 digits). Optional — most EOBs omit it.
const EOB_CODE_RE = /\b(\d{5}|[A-Z]\d{4})\b/

function eobMoneyAmounts(line: string): number[] {
  return [...line.matchAll(EOB_MONEY_RE)].map((m) => parseFloat(m[1].replace(/,/g, '')))
}

function eobNoteFlags(line: string): string[] {
  const flags: string[] = []
  for (const re of DENIAL_NOTE_PATTERNS) {
    const m = line.match(re)
    if (!m) continue
    // Capture the surrounding clause, not just the keyword, so the note reads
    // naturally in the dispute ("not payable with the diagnosis billed").
    const clause = line
      .slice(Math.max(0, (m.index ?? 0) - 4))
      .replace(/\s+/g, ' ')
      .trim()
    flags.push(clause.length > 90 ? clause.slice(0, 90).trim() : clause)
  }
  return flags
}

function canonicalKey(cell: string): string {
  return cell.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function splitRow(line: string): string[] {
  return line.split('|').map((c) => c.trim())
}

function parseMoney(cell: string | undefined): number | undefined {
  if (cell === undefined) return undefined
  const cleaned = cell.replace(/[$,\s]/g, '')
  if (cleaned === '') return undefined
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : undefined
}

// Locate the canonical header row and map each field to its column index,
// STRICTLY by header name. Requires amount_billed plus at least one adjudication
// column — otherwise this isn't the canonical table and we return null so the
// caller can fall back (and never positionally guess a wide layout's columns).
function resolveCanonicalColumns(text: string): Map<CanonicalField, number> | null {
  for (const raw of text.split('\n')) {
    if (!raw.includes('|')) continue
    const cells = splitRow(raw)
    const map = new Map<CanonicalField, number>()
    cells.forEach((cell, i) => {
      const field = CANONICAL_COLUMNS[canonicalKey(cell)]
      if (field && !map.has(field)) map.set(field, i)
    })
    if (map.has('billed') && (map.has('allowed') || map.has('patientResp'))) {
      return map
    }
  }
  return null
}

// Parse the canonical pipe-delimited table. Every money column is read by its
// resolved header index — the match key is "amount_billed", "allowed_amount" is
// the allowed amount, and "patient_responsibility" is what the patient owes.
function parseCanonicalEOBTable(text: string): CBSLineItem[] | null {
  const cols = resolveCanonicalColumns(text)
  if (!cols) return null

  const billedIdx = cols.get('billed')!
  const items: CBSLineItem[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line.includes('|')) continue
    const cells = splitRow(line)

    // Skip the header row itself (and any repeated header on later pages).
    if (canonicalKey(cells[billedIdx] ?? '') === 'amount_billed') continue

    const at = (field: CanonicalField): string | undefined => {
      const idx = cols.get(field)
      return idx === undefined ? undefined : cells[idx]
    }

    const billed = parseMoney(at('billed'))
    const description = (at('description') ?? '').replace(/\s{2,}/g, ' ').trim().slice(0, 80)
    const flagCell = (at('flag') ?? '').trim()

    // A service row needs a billed amount or a description; totals are excluded
    // (the transcription is told not to emit them, but guard anyway).
    if (billed === undefined && !description) continue
    if (EOB_SUMMARY_ROW.test(description) || EOB_SUMMARY_ROW.test(flagCell)) continue

    const serviceDateCell = at('serviceDate')
    const serviceDate = serviceDateCell ? normalizeDate(serviceDateCell) : undefined
    const codeMatch = description.match(EOB_CODE_RE)
    const noteFlags = eobNoteFlags(flagCell || description)

    items.push({
      lineItemId: crypto.randomUUID(),
      cptCode: codeMatch ? codeMatch[1] : undefined, // optional — usually absent
      description: description || undefined,
      serviceDate,
      billedAmount: billed,
      allowedAmount: parseMoney(at('allowed')),
      patientResponsibility: parseMoney(at('patientResp')),
      status: noteFlags.length > 0 ? 'denied' : 'unknown',
      noteFlags: noteFlags.length > 0 ? noteFlags : undefined,
    })
  }

  return items
}

// Fallback for a malformed transcription that lacks the canonical header. It
// captures each line's billed amount (the match key) but DOES NOT positionally
// guess which wide column is the allowed/responsibility figure: only the
// near-universal billed-first / cost-last convention for 2–3 amount rows is
// trusted; anything wider is left at billed-only (low confidence) rather than
// risk the mis-map this whole rewrite exists to prevent.
function parseLooseEOBLines(text: string): CBSLineItem[] {
  const items: CBSLineItem[] = []
  // Multi-line claims print the date of service once on the claim header; carry
  // it down so detail rows beneath it are still captured and dated.
  let claimDate: string | undefined

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const amounts = eobMoneyAmounts(line)
    const dateMatch = line.match(EOB_DATE_RE)

    if (dateMatch && amounts.length === 0) {
      claimDate = normalizeDate(dateMatch[1])
      continue
    }
    if (EOB_SUMMARY_ROW.test(line)) continue
    if (amounts.length === 0) continue
    if (!dateMatch && !claimDate && amounts.length < 2) continue

    let allowed: number | undefined
    let patientResp: number | undefined
    if (amounts.length === 2) {
      allowed = amounts[1]
    } else if (amounts.length === 3) {
      allowed = amounts[1]
      patientResp = amounts[2]
    }
    // 4+ amounts: ambiguous without a header — keep billed only.

    const serviceDate = dateMatch ? normalizeDate(dateMatch[1]) : claimDate
    const codeMatch = line.match(EOB_CODE_RE)
    const description = line
      .replace(EOB_DATE_RE, '')
      .replace(EOB_MONEY_RE, '')
      .replace(EOB_CODE_RE, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[|·•]/g, ' ')
      .trim()
      .slice(0, 80)
    if (!codeMatch && !description) continue

    const noteFlags = eobNoteFlags(line)

    items.push({
      lineItemId: crypto.randomUUID(),
      cptCode: codeMatch ? codeMatch[1] : undefined,
      description: description || undefined,
      serviceDate,
      billedAmount: amounts[0],
      allowedAmount: allowed,
      patientResponsibility: patientResp,
      status: noteFlags.length > 0 ? 'denied' : 'unknown',
      noteFlags: noteFlags.length > 0 ? noteFlags : undefined,
    })
  }

  return items
}

// Prefer the canonical header-mapped table; fall back to the conservative loose
// parse only when no canonical header is present.
export function extractEOBLineItems(text: string): CBSLineItem[] {
  return parseCanonicalEOBTable(text) ?? parseLooseEOBLines(text)
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export function extractToCBS(
  rawText: string,
  documentId: string,
  documentTypeHint?: DocumentType
): CanonicalBillingSchema {
  const docType = documentTypeHint || detectDocumentType(rawText)

  const claimNumber = extractFirstMatch(rawText, [
    /claim\s*(?:#|number|no\.?)[:\s]+([A-Z0-9\-]+)/i,
    /eob\s*(?:#|number)[:\s]+([A-Z0-9\-]+)/i,
    /reference\s*(?:#|number)[:\s]+([A-Z0-9\-]+)/i,
  ])

  const providerNPI = extractFirstMatch(rawText, [
    /npi[:\s#]+(\d{10})/i,
    /national provider[:\s]+(\d{10})/i,
  ])

  const providerName = extractFirstMatch(rawText, [
    /provider[:\s]+([A-Za-z\s,\.]+?)(?:\n|$|NPI)/i,
    /facility[:\s]+([A-Za-z\s,\.]+?)(?:\n|$)/i,
    /physician[:\s]+([A-Za-z\s,\.]+?)(?:\n|$)/i,
  ])

  const payerName = extractFirstMatch(rawText, [
    /insurance[:\s]+([A-Za-z\s,\.]+?)(?:\n|$)/i,
    /payer[:\s]+([A-Za-z\s,\.]+?)(?:\n|$)/i,
    /plan[:\s]+([A-Za-z\s,\.]+?)(?:\n|$)/i,
  ])

  const payerMemberId = extractFirstMatch(rawText, [
    /member\s*(?:id|#|number)[:\s]+([A-Z0-9\-]+)/i,
    /subscriber\s*(?:id|#)[:\s]+([A-Z0-9\-]+)/i,
    /policy\s*(?:#|number)[:\s]+([A-Z0-9\-]+)/i,
  ])

  const patientName = extractFirstMatch(rawText, [
    /patient[:\s]+([A-Za-z\s,\.]+?)(?:\n|$)/i,
    /insured[:\s]+([A-Za-z\s,\.]+?)(?:\n|$)/i,
    /member[:\s]+([A-Za-z\s,\.]+?)(?:\n|$)/i,
  ])

  const dateOfService = extractDate(rawText, ['date of service', 'dos', 'service date'])
  const billDate = extractDate(rawText, ['bill date', 'statement date', 'invoice date', 'date'])
  const eobDate = extractDate(rawText, ['processed', 'eob date', 'adjudication date', 'explanation date'])
  const denialDate = extractDate(rawText, ['denial date', 'denied on', 'date denied'])
  const collectionDate = extractDate(rawText, ['collection date', 'letter date', 'notice date'])
  const authorizationDate = extractDate(rawText, ['authorization date', 'auth date', 'approved on'])
  const appealDeadline = extractDate(rawText, ['appeal by', 'appeal deadline', 'file appeal within', 'deadline'])

  const totalBilled = extractDollarAmount(rawText, ['total billed', 'total charges', 'amount billed', 'total amount'])
  // EOBs label the contracted/allowed column variously: "Amount Covered" on
  // many commercial EOBs is the allowed amount after discounts and reductions.
  const totalAllowed = extractDollarAmount(rawText, ['total allowed', 'allowed amount', 'amount covered', 'contracted rate'])
  const totalPatientResponsibility = extractDollarAmount(rawText, ['patient responsibility', 'your responsibility', 'amount due', 'balance due', 'you owe'])
  const totalPaid = extractDollarAmount(rawText, ['amount paid', 'plan paid', 'insurance paid', 'benefit paid'])

  // Denial/auth
  const denialReason = extractFirstMatch(rawText, [
    /reason[:\s]+([^\n]{10,100})/i,
    /denied because[:\s]+([^\n]{10,100})/i,
    /not covered[:\s]+([^\n]{10,100})/i,
  ])
  const denialCode = extractFirstMatch(rawText, [
    /denial code[:\s]+([A-Z0-9]+)/i,
    /reason code[:\s]+([A-Z0-9]+)/i,
    /remark code[:\s]+([A-Z0-9]+)/i,
  ])
  const authorizationNumber = extractFirstMatch(rawText, [
    /auth(?:orization)?\s*(?:#|number|no\.?)[:\s]+([A-Z0-9\-]+)/i,
  ])

  // Adjudication status
  let adjudicationStatus: CanonicalBillingSchema['adjudicationStatus'] = 'unknown'
  const lower = rawText.toLowerCase()
  if (lower.includes('approved') || lower.includes('paid')) adjudicationStatus = 'approved'
  if (lower.includes('denied') || lower.includes('denial')) adjudicationStatus = 'denied'
  if (lower.includes('partial') || lower.includes('partially')) adjudicationStatus = 'partially_approved'
  if (lower.includes('pending') || lower.includes('in process')) adjudicationStatus = 'pending'

  // Authorization status
  let authorizationStatus: CanonicalBillingSchema['authorizationStatus'] = 'unknown'
  if (lower.includes('authorization approved') || lower.includes('auth approved')) authorizationStatus = 'approved'
  if (lower.includes('authorization denied') || lower.includes('auth denied')) authorizationStatus = 'denied'
  if (lower.includes('no authorization required') || lower.includes('auth not required')) authorizationStatus = 'not_required'

  // Line items — for EOBs use specialized parser, otherwise use billed items
  const lineItems: CBSLineItem[] = docType === 'eob'
    ? extractEOBLineItems(rawText)
    : [] // Bills get line items from the existing billExtractor

  // Derive episodeId from claimNumber or dateOfService
  const serviceEpisodeId = claimNumber || (dateOfService ? `episode_${dateOfService}` : undefined)

  return {
    sourceDocumentId: documentId,
    sourceDocumentType: docType,
    patientName: patientName?.substring(0, 80),
    dateOfService,
    serviceEpisodeId,
    claimNumber,
    providerName: providerName?.substring(0, 100),
    providerNPI,
    payerName: payerName?.substring(0, 100),
    payerMemberId,
    lineItems,
    totalBilled,
    totalAllowed,
    totalPatientResponsibility,
    totalPaid,
    adjudicationStatus,
    denialReason: denialReason?.substring(0, 200),
    denialCode,
    authorizationNumber,
    authorizationStatus,
    authorizationDate,
    billDate,
    eobDate,
    denialDate,
    collectionDate,
    appealDeadline,
    discrepancies: [],
    temporalInconsistencies: [],
  }
}

// ─── Convert existing bill extraction to CBS ──────────────────────────────────
// Takes the structured output from billExtractor and wraps it in CBS format

export function billExtractionToCBS(
  extraction: {
    lineItems: Array<{
      cpt_code: string
      raw_code?: string
      description: string
      date_of_service: string
      units: number
      billed_amount: number
      modifiers?: string[]
    }>
    billMetadata: {
      provider_name: string
      provider_npi: string
      bill_date: string
      patient_name: string
      account_number: string
    }
  },
  documentId: string
): CanonicalBillingSchema {
  const { lineItems, billMetadata } = extraction

  const cbsLineItems: CBSLineItem[] = lineItems.map(li => ({
    lineItemId: crypto.randomUUID(),
    cptCode: li.cpt_code,
    description: li.description,
    billedAmount: li.billed_amount,
    units: li.units,
    serviceDate: li.date_of_service,
    status: 'unknown' as const,
  }))

  const totalBilled = lineItems.reduce((sum, li) => sum + (li.billed_amount || 0), 0)
  const dateOfService = lineItems[0]?.date_of_service

  return {
    sourceDocumentId: documentId,
    sourceDocumentType: 'itemized_bill',
    patientName: billMetadata.patient_name || undefined,
    dateOfService,
    serviceEpisodeId: dateOfService ? `episode_${dateOfService}` : undefined,
    claimNumber: billMetadata.account_number || undefined,
    providerName: billMetadata.provider_name || undefined,
    providerNPI: billMetadata.provider_npi || undefined,
    lineItems: cbsLineItems,
    totalBilled,
    billDate: billMetadata.bill_date || undefined,
    discrepancies: [],
    temporalInconsistencies: [],
  }
}

// ─── Extractable file types ───────────────────────────────────────────────────
// Shared by isExtractableExt (here) and the server-only ./eobExtractor, which
// reuses this map for the multimodal media types.

export const EOB_MEDIA_TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}

export function isExtractableExt(ext: string): boolean {
  // heic/heif are accepted here; the server-only EOB extractor transcodes them
  // to JPEG (via lib/heic) before the vision call.
  return ext === 'pdf' || ext === 'heic' || ext === 'heif' || ext in EOB_MEDIA_TYPES
}
