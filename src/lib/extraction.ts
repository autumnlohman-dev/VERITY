import Anthropic from '@anthropic-ai/sdk'
import type { LineItem } from './errorDetection'
import { CPT_CODE_PATTERN, mapDescriptionToCpt } from './billExtractor'

// Component I: multimodal unstructured → structured extraction (proprietary).
// Shared by the authenticated case pipeline (/api/extract) and the public
// guest audit (/api/audit-guest).

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACTION_SYSTEM = `You are a medical-billing document parser. You receive an image or PDF of a
medical bill, itemized statement, or Explanation of Benefits (EOB). Extract every billable line item and
the financial summary EXACTLY as printed.
Rules:
- Transcribe numbers verbatim; never round or compute new values.
- If a field is absent or unreadable, return null and lower its confidence.
- Distinguish CPT/HCPCS codes (5 characters) from revenue codes and ICD diagnoses.
- Capture modifiers attached to a CPT (e.g. 59, 25, XU).
Return ONLY a JSON object, no prose, matching exactly:
{
  "document_kind": "bill" | "eob",
  "provider": string | null,
  "date_of_service": string | null,
  "line_items": [
    { "cpt_code": string, "description": string | null, "date_of_service": string | null,
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

  const message = await anthropic.messages.create({
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
    .filter((li) => li && typeof li.cpt_code === 'string')
    .map((li) => {
      const description = typeof li.description === 'string' ? li.description : undefined
      const extractedCode = String(li.cpt_code).trim().toUpperCase()

      // Facility bills list proprietary chargemaster IDs (e.g. "401000018")
      // that match no PFS/CLFS/NCCI entry, so every lookup misses and the audit
      // falls back to its "reference data unavailable" path. When the code isn't
      // in standard CPT/HCPCS format, resolve it from the service description so
      // the downstream Supabase lookups have a real code to price. Same mapping
      // used by /api/extract-line-items — kept in one place in billExtractor.
      let cptCode = extractedCode
      if (extractedCode && !CPT_CODE_PATTERN.test(extractedCode)) {
        const mapped = mapDescriptionToCpt(description ?? '')
        if (mapped) cptCode = mapped
      }

      return {
        cpt_code: cptCode,
        description,
        date_of_service: typeof li.date_of_service === 'string' ? li.date_of_service : '',
        units: Number(li.units) || 1,
        billed_amount: Number(li.billed_amount) || 0,
        modifiers: Array.isArray(li.modifiers) ? li.modifiers.map((m) => String(m)) : undefined,
      }
    })

  const lowConfidence = rawItems
    .filter((li) => li?.field_confidence === 'low')
    .map((li) => String(li.cpt_code ?? 'unknown'))

  return {
    lineItems,
    provider: typeof parsed.provider === 'string' ? parsed.provider : null,
    dateOfService: typeof parsed.date_of_service === 'string' ? parsed.date_of_service : null,
    lowConfidence,
  }
}
