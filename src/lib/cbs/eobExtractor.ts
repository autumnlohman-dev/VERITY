import Anthropic from '@anthropic-ai/sdk'
import type { CanonicalBillingSchema } from './schema'
import { extractToCBS, EOB_MEDIA_TYPES } from './extractor'

// ─── Multimodal EOB extraction (Component I → CBS) ─────────────────────────────
// SERVER-ONLY. Reads an Explanation of Benefits image/PDF with the Anthropic
// multimodal API, transcribing it verbatim to text, then runs the EOB-aware text
// parser (extractToCBS, in the pure ./extractor module) to produce a
// CanonicalBillingSchema.
//
// This module is the ONLY part of the CBS extractor that touches the Anthropic
// SDK, so it lives apart from ./extractor — which is imported by client-reachable
// code (deadlines/forCase → case + letter pages). Importing this file pulls in
// @anthropic-ai/sdk; import it only from server code (runFullAudit / API routes).
//
// The SDK client is constructed LAZILY inside the handler, never at module scope:
// a module-scope `new Anthropic()` evaluates on import and throws in a browser
// bundle ("running in a browser-like environment …").

let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const EOB_TRANSCRIBE_SYSTEM = `You transcribe Explanation of Benefits (EOB) / remittance documents to plain text.
Transcribe EVERYTHING you can read VERBATIM — never summarize, interpret, round, or invent values.
Preserve every labeled field on its own line so it can be parsed, for example:
  Claim Number: ...
  Provider: ...   NPI: ...
  Member ID: ...
  Date of Service: MM/DD/YYYY
  Processed/EOB Date: MM/DD/YYYY
  Total Billed: $...   Total Allowed: $...   Plan Paid: $...   Patient Responsibility: $...
  Appeal by: MM/DD/YYYY
Then transcribe each service line on its own line with its CPT/HCPCS code followed by the
billed, allowed, paid, and patient-responsibility dollar amounts as printed.
Return ONLY the transcribed text, no commentary.`

// Extract an EOB document (base64 image or PDF) into CBS via the multimodal API.
export async function extractEOBToCBS(
  base64: string,
  ext: string,
  documentId: string
): Promise<CanonicalBillingSchema> {
  let documentBlock: Anthropic.ContentBlockParam
  if (ext === 'pdf') {
    documentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
  } else if (EOB_MEDIA_TYPES[ext]) {
    documentBlock = { type: 'image', source: { type: 'base64', media_type: EOB_MEDIA_TYPES[ext], data: base64 } }
  } else {
    throw new Error(`Unsupported EOB file type: .${ext}. Upload a PDF, PNG, JPG, or WEBP.`)
  }

  const message = await anthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: EOB_TRANSCRIBE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [documentBlock, { type: 'text', text: 'Transcribe this Explanation of Benefits document verbatim.' }],
      },
    ],
  })

  const textOut = message.content.find((b) => b.type === 'text')
  const rawText = textOut && textOut.type === 'text' ? textOut.text : ''
  return extractToCBS(rawText, documentId, 'eob')
}
