import type Anthropic from '@anthropic-ai/sdk'
import type { LineItem } from './errorDetection'
import { CPT_CODE_PATTERN, isNonChargeRow, mapDescriptionToCpt } from './billExtractor'
import { isHeicExt, normalizeForExtraction } from './heic'
import { boundedMessage } from './ai/phiBoundary'

// Component I: multimodal unstructured → structured extraction (proprietary).
// Shared by the authenticated case pipeline (/api/extract) and the public
// guest audit (/api/audit-guest).
//
// PHI boundary: this is one of the two declared 'raw-document' edges — the
// vision call must see the document to extract it. The system prompt forbids
// transcribing patient identifiers into the OUTPUT, so identifiers do not
// propagate into stored data. All API access goes through lib/ai/phiBoundary.

const EXTRACTION_SYSTEM = `You are a medical-billing document parser. You receive an image or PDF of a
medical bill, itemized statement, or Explanation of Benefits (EOB). Extract every billable line item and
the financial summary EXACTLY as printed.
Rules:
- Transcribe numbers verbatim; never round or compute new values.
- If a field is absent or unreadable, return null and lower its confidence.
- Distinguish CPT/HCPCS codes (5 characters) from revenue codes and ICD diagnoses.
- MANY bills list only a service description with NO CPT/HCPCS code (e.g. "CMP", "TSH", "CBC DIFF",
  "VENIPUNCTURE", "XR BONE AGE STUDY"). Still capture these rows — set "cpt_code" to null and record the
  description. Never invent a code.
- The document may be organized into multiple encounters/visits, each under its own Encounter Number
  (or claim/visit id). Capture charge lines from every encounter, and tag each line with the "encounter"
  id of the encounter it appears under, copied verbatim. Use null when the bill has no encounter grouping.
- EXCLUDE non-charge rows interleaved among the charges: insurance payments, contractual allowance
  adjustments, credit/refund adjustments, write-offs, and any row with a negative amount (e.g.
  "COMMERCIAL INSURANCE PAYMENT", "CONTRACTUAL ALLOWANCE ADJUST", "OTHER CREDIT ADJUSTMENT"). Also skip
  subtotals, taxes, and summary/total rows.
- Capture modifiers attached to a CPT (e.g. 59, 25, XU).
- In "totals", transcribe the bill's own stated summary figures when printed:
  "billed" = total charges (the gross sum of services), and
  "patient_responsibility" = the bottom-line amount the PATIENT is asked to pay
  after insurance payments and adjustments (labels like "Patient Responsibility",
  "Amount Due", "Please Pay This Amount", "Patient Balance", "Balance Due").
  These are different numbers on an insured bill — never substitute one for the
  other, and use null when the bill does not print the figure.
- NEVER transcribe patient identifiers into your output: no patient name, no
  member/subscriber ID, no mailing address, no phone, no email, no SSN. These
  fields are not part of the schema below — do not add them anywhere.
Return ONLY a JSON object, no prose, matching exactly:
{
  "document_kind": "bill" | "eob",
  "provider": string | null,
  "date_of_service": string | null,
  "line_items": [
    { "cpt_code": string | null, "description": string | null, "date_of_service": string | null,
      "encounter": string | null, "units": number, "billed_amount": number, "modifiers": string[],
      "field_confidence": "high" | "medium" | "low" }
  ],
  "totals": { "billed": number | null, "patient_responsibility": number | null }
}`

const IMAGE_TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}

// Pull the first balanced JSON object out of the model's reply.
function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object in extraction response')
  return JSON.parse(text.slice(start, end + 1))
}

// Thrown when the vision response was cut off at the token cap — a truncated
// JSON payload either fails to parse or silently DROPS charge rows, and a
// partial audit is worse than a failed one. Mirrors EOBExtractionError's
// style: structural-only message (lengths/counts), never document content.
export class BillExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillExtractionError'
  }
}

export type ExtractionResult = {
  lineItems: LineItem[]
  provider: string | null
  dateOfService: string | null
  lowConfidence: string[]
  // True when the model recognized a billing document (a kind, a provider, a
  // total, or any rows) even if no billable charge lines survived. Lets callers
  // tell an unreadable file apart from a readable document with no charge lines.
  sawContent: boolean
  // The bill's own stated summary figures, transcribed (not computed):
  // statedTotalBilled = printed total charges; patientResponsibility = the
  // bottom-line the patient is asked to pay after insurance. Null when the bill
  // doesn't print the figure. patientResponsibility is the honest ceiling on
  // any "potential savings" claim, and statedTotalBilled powers the partial-
  // read guard (extracted lines summing well below the printed total).
  statedTotalBilled: number | null
  patientResponsibility: number | null
}

export function isSupportedExt(ext: string): boolean {
  return ext === 'pdf' || isHeicExt(ext) || ext in IMAGE_TYPES
}

export async function extractFromBase64(base64: string, ext: string): Promise<ExtractionResult> {
  // Single shared HEIC boundary: iPhone HEIC/HEIF (by content OR extension) →
  // JPEG before the vision call (the API rejects HEIC). After this the file is
  // treated as jpeg downstream.
  const { base64: data, ext: mediaExt } = await normalizeForExtraction(base64, ext)

  let documentBlock: Anthropic.ContentBlockParam
  if (mediaExt === 'pdf') {
    documentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  } else if (IMAGE_TYPES[mediaExt]) {
    documentBlock = { type: 'image', source: { type: 'base64', media_type: IMAGE_TYPES[mediaExt], data } }
  } else {
    throw new Error(`Unsupported file type: .${ext}. Upload a PDF, PNG, JPG, WEBP, or HEIC.`)
  }

  const message = await boundedMessage('bill-extraction', 'raw-document', {
    model: 'claude-sonnet-4-6',
    // A multi-page merged bill (up to 10 files in one PDF) far exceeds the old
    // 1500-token cap, which truncated the JSON mid-array — a parse throw at
    // best, silently dropped charge rows at worst. Matches eobExtractor's cap.
    max_tokens: 8000,
    system: EXTRACTION_SYSTEM,
    messages: [
      { role: 'user', content: [documentBlock, { type: 'text', text: 'Extract the structured data from this document.' }] },
    ],
  })

  const textOut = message.content.find((b) => b.type === 'text')
  const raw = textOut && textOut.type === 'text' ? textOut.text : ''

  // Truncation is an extraction FAILURE, never a partial result: a cut-off
  // JSON array parses as fewer rows than the bill has, and an audit over a
  // subset of charges asserts wrong totals with full confidence.
  if (message.stop_reason === 'max_tokens') {
    throw new BillExtractionError(
      `Bill extraction hit the token cap and was truncated (responseChars=${raw.length}).`
    )
  }
  const parsed = parseJsonObject(raw) as {
    line_items?: Array<Record<string, unknown>>
    provider?: unknown
    date_of_service?: unknown
    document_kind?: unknown
    totals?: Record<string, unknown>
  }

  const rawItems = Array.isArray(parsed.line_items) ? parsed.line_items : []
  const lineItems: LineItem[] = rawItems
    .map((li) => {
      const description = typeof li.description === 'string' ? li.description : ''
      const extractedCode =
        typeof li.cpt_code === 'string' ? li.cpt_code.trim().toUpperCase() : ''
      const billedAmount = Number(li.billed_amount) || 0

      // Capture rows even when the bill prints only a description (no code at
      // all) or a proprietary chargemaster ID: resolve an unambiguous
      // description to its canonical CPT via the shared billExtractor mapping,
      // otherwise leave the code empty so the audit flags it as rate-unavailable
      // / manual review rather than discarding it.
      let cptCode = extractedCode
      if (!CPT_CODE_PATTERN.test(extractedCode)) {
        cptCode = mapDescriptionToCpt(description) ?? extractedCode
      }

      const encounter =
        typeof li.encounter === 'string' && li.encounter.trim() ? li.encounter.trim() : undefined

      return {
        cpt_code: cptCode,
        description: description || undefined,
        date_of_service: typeof li.date_of_service === 'string' ? li.date_of_service : '',
        units: Number(li.units) || 1,
        billed_amount: billedAmount,
        modifiers: Array.isArray(li.modifiers) ? li.modifiers.map((m) => String(m)) : undefined,
        encounter,
      }
    })
    // Drop interleaved payment/adjustment/credit rows; keep anything with a
    // code or a description to anchor on.
    .filter((li) => !isNonChargeRow(li.description ?? '', li.billed_amount))
    .filter((li) => li.cpt_code !== '' || (li.description ?? '') !== '')

  const lowConfidence = rawItems
    .filter((li) => li?.field_confidence === 'low')
    .map((li) =>
      String(li.cpt_code ?? (typeof li.description === 'string' ? li.description : 'unknown'))
    )

  const provider = typeof parsed.provider === 'string' ? parsed.provider : null
  const totalBilled = Number(parsed.totals?.billed)
  const patientResp = Number(parsed.totals?.patient_responsibility)
  // The model returned a recognizable billing document even if every row was
  // filtered out — a kind, a provider, a billed total, or at least one raw row.
  const sawContent =
    parsed.document_kind === 'bill' ||
    parsed.document_kind === 'eob' ||
    (provider !== null && provider.trim() !== '') ||
    rawItems.length > 0 ||
    Number.isFinite(totalBilled)

  return {
    lineItems,
    provider,
    dateOfService: typeof parsed.date_of_service === 'string' ? parsed.date_of_service : null,
    lowConfidence,
    sawContent,
    statedTotalBilled: Number.isFinite(totalBilled) && totalBilled > 0 ? totalBilled : null,
    patientResponsibility: Number.isFinite(patientResp) && patientResp >= 0 ? patientResp : null,
  }
}
