import Anthropic from '@anthropic-ai/sdk'
import type { CanonicalBillingSchema } from './schema'
import { extractToCBS, EOB_MEDIA_TYPES } from './extractor'
import { normalizeForExtraction } from '../heic'

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
  Member ID: ...
  Processed/EOB Date: MM/DD/YYYY
  Appeal by: MM/DD/YYYY

CRITICAL — capture EVERY service line of EVERY claim, across EVERY page:
- An EOB contains one or more claims. A claim may be a single service line or
  many (e.g. a "CLAIM DETAIL (3 of 5)" with several "Laboratory Services" rows).
- Output EVERY individual service row of EVERY claim. NEVER collapse a claim to
  its total, and NEVER skip rows because a claim has many of them. A claim with
  four lab rows must produce four rows here.
- Begin each claim with a header line carrying its identity and date, e.g.:
    Claim 3 of 5   Claim Number: ...   Date of Service: MM/DD/YYYY
- Immediately under each claim, print the column header EXACTLY in this order so
  the columns can be told apart, then one line per service row:
    Service Description    Amount Billed    Discounts and Reductions    Amount Covered (Allowed)    Your Total Costs
  Each service row: the description (and CPT/HCPCS code if printed — many EOBs
  omit it), then ALL FOUR dollar columns in that order, exactly as printed:
    Laboratory Services    $268.00    $252.55    $15.45    $15.45
- Keep the "Amount Covered (Allowed)" column distinct from "Discounts and
  Reductions" — they are different columns; do not merge or reorder them.
- Append any per-row remark verbatim after the amounts (e.g. "Not payable with
  the diagnosis billed").
- You may transcribe claim/page total rows too, but label them "Total" /
  "Subtotal" so they are not mistaken for service lines.

Return ONLY the transcribed text, no commentary.`

// Extract an EOB document (base64 image or PDF) into CBS via the multimodal API.
export async function extractEOBToCBS(
  base64: string,
  ext: string,
  documentId: string
): Promise<CanonicalBillingSchema> {
  // Single shared HEIC boundary: iPhone HEIC/HEIF (by content OR extension) →
  // JPEG before the vision call (the API rejects HEIC). After this the file is
  // treated as jpeg downstream.
  const { base64: data, ext: mediaExt } = await normalizeForExtraction(base64, ext)

  let documentBlock: Anthropic.ContentBlockParam
  if (mediaExt === 'pdf') {
    documentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  } else if (EOB_MEDIA_TYPES[mediaExt]) {
    documentBlock = { type: 'image', source: { type: 'base64', media_type: EOB_MEDIA_TYPES[mediaExt], data } }
  } else {
    throw new Error(`Unsupported EOB file type: .${ext}. Upload a PDF, PNG, JPG, WEBP, or HEIC.`)
  }

  const message = await anthropic().messages.create({
    model: 'claude-sonnet-4-6',
    // A multi-claim EOB (every service row of every claim, across pages) far
    // exceeds the old 2000-token cap, which truncated transcription mid-document.
    max_tokens: 8000,
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
