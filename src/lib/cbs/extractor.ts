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

// Rows on a commercial EOB are laid out as
//   <service description> [CPT] | Amount Billed | Discounts and Reductions | Amount Covered | Your Responsibility
// CPT codes are frequently absent (the description is the only identifier), so
// we key on any row carrying at least two dollar amounts and map the columns by
// how many amounts are present.
const EOB_SUMMARY_ROW = /\b(total|subtotal|grand\s+total|balance\s+forward)\b/i

function extractEOBLineItems(text: string): CBSLineItem[] {
  const items: CBSLineItem[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    if (EOB_SUMMARY_ROW.test(line)) continue
    const amounts = [...line.matchAll(/\$?([\d,]+\.\d{2})/g)].map(m => parseFloat(m[1].replace(/,/g, '')))
    if (amounts.length < 2) continue

    const cptMatch = line.match(/\b(\d{5}|[A-Z]\d{4})\b/)
    const description = line
      .replace(/\$?[\d,]+\.\d{2}/g, '')
      .replace(/\b\d{5}\b/, '')
      .trim()
      .substring(0, 80)
    if (!cptMatch && !description) continue

    // Column mapping by amount count:
    //  4+: Billed | Discounts/Reductions | Amount Covered (allowed) | Your Responsibility
    //  3 : Billed | Amount Covered (allowed) | Your Responsibility
    //  2 : Billed | Amount Covered (allowed)
    const billedAmount = amounts[0]
    let allowedAmount: number | undefined
    let patientResponsibility: number | undefined
    if (amounts.length >= 4) {
      allowedAmount = amounts[2]
      patientResponsibility = amounts[3]
    } else if (amounts.length === 3) {
      allowedAmount = amounts[1]
      patientResponsibility = amounts[2]
    } else {
      allowedAmount = amounts[1]
    }

    items.push({
      lineItemId: crypto.randomUUID(),
      cptCode: cptMatch?.[1],
      description,
      billedAmount,
      allowedAmount,
      patientResponsibility,
    })
  }
  return items
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
