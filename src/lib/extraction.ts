import Anthropic from '@anthropic-ai/sdk'
import type { LineItem } from './errorDetection'
import { CPT_CODE_PATTERN, isNonChargeRow, mapDescriptionToCpt } from './billExtractor'

// Component I: multimodal unstructured → structured extraction (proprietary).
// Shared by the authenticated case pipeline (/api/extract) and the public
// guest audit (/api/audit-guest).

// Constructed lazily inside the handler, never at module scope — a module-scope
// `new Anthropic()` evaluates on import and throws in a browser bundle. This
// module is server-only (imported by /api/extract + /api/audit-guest).
let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

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
- The document may be organized into multiple encounters; capture charge lines from every encounter.
- EXCLUDE non-charge rows interleaved among the charges: insurance payments, contractual allowance
  adjustments, credit/refund adjustments, write-offs, and any row with a negative amount (e.g.
  "COMMERCIAL INSURANCE PAYMENT", "CONTRACTUAL ALLOWANCE ADJUST", "OTHER CREDIT ADJUSTMENT"). Also skip
  subtotals, taxes, and summary/total rows.
- Capture modifiers attached to a CPT (e.g. 59, 25, XU).
Return ONLY a JSON object, no prose, matching exactly:
{
  "document_kind": "bill" | "eob",
  "provider": string | null,
  "date_of_service": string | null,
  "line_items": [
    { "cpt_code": string | null, "description": string | null, "date_of_service": string | null,
      "units": number, "billed_amount": number, "modifiers": string[],
      "field_confidence": "high" | "medium" | "low" }
  ],
  "totals": { "billed": number | null }
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

export type ExtractionResult = {
  lineItems: LineItem[]
  provider: string | null
  dateOfService: string | null
  lowConfidence: string[]
}

export function isSupportedExt(ext: string): boolean {
  return ext === 'pdf' || ext in IMAGE_TYPES
}

export async function extractFromBase64(base64: string, ext: string): Promise<ExtractionResult> {
  let documentBlock: Anthropic.ContentBlockParam
  if (ext === 'pdf') {
    documentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
  } else if (IMAGE_TYPES[ext]) {
    documentBlock = { type: 'image', source: { type: 'base64', media_type: IMAGE_TYPES[ext], data: base64 } }
  } else {
    throw new Error(`Unsupported file type: .${ext}. Upload a PDF, PNG, JPG, or WEBP.`)
  }

  const message = await anthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: EXTRACTION_SYSTEM,
    messages: [
      { role: 'user', content: [documentBlock, { type: 'text', text: 'Extract the structured data from this document.' }] },
    ],
  })

  const textOut = message.content.find((b) => b.type === 'text')
  const raw = textOut && textOut.type === 'text' ? textOut.text : ''
  const parsed = parseJsonObject(raw) as {
    line_items?: Array<Record<string, unknown>>
    provider?: unknown
    date_of_service?: unknown
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

      return {
        cpt_code: cptCode,
        description: description || undefined,
        date_of_service: typeof li.date_of_service === 'string' ? li.date_of_service : '',
        units: Number(li.units) || 1,
        billed_amount: billedAmount,
        modifiers: Array.isArray(li.modifiers) ? li.modifiers.map((m) => String(m)) : undefined,
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

  return {
    lineItems,
    provider: typeof parsed.provider === 'string' ? parsed.provider : null,
    dateOfService: typeof parsed.date_of_service === 'string' ? parsed.date_of_service : null,
    lowConfidence,
  }
}
