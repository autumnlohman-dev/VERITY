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

const EOB_TRANSCRIBE_SYSTEM = `You read an Explanation of Benefits (EOB) / remittance document and output a NORMALIZED transcription. Never invent, round, or omit values.

First, transcribe these labeled header fields, each on its own line, when present:
  Claim Number: ...
  Provider: ...   NPI: ...
  Member ID: ...
  Date of Service: MM/DD/YYYY
  Processed/EOB Date: MM/DD/YYYY
  Appeal by: MM/DD/YYYY

Then output ALL service lines as ONE pipe-delimited table. Emit this header row
EXACTLY ONCE, then one row per service line:
  claim_ref | service_description | service_date | amount_billed | allowed_amount | patient_responsibility | flag

Rules for the table:
- Output EVERY service line of EVERY claim, across EVERY page. An EOB contains one
  or more claims, and a claim may have many rows (e.g. a "CLAIM DETAIL (3 of 5)"
  with four "Laboratory Services" rows must produce four rows here). NEVER collapse
  a claim to its total, and NEVER emit claim/page/grand total rows.
- Map the EOB's native columns into these by MEANING — regardless of what the
  payer labels them or how many money columns it prints (commercial EOBs often
  print nine: Amount Billed, Discounts and Reductions, Amount Covered (Allowed),
  Health Plan Responsibility, Deductible, Copay, Coinsurance, Amount Not Covered,
  Your Total Costs):
    amount_billed          = what the provider billed/charged for the line.
    allowed_amount         = the plan's allowed / "Amount Covered" / contracted
                             amount for the line — NOT the discount or reduction.
    patient_responsibility = what the patient owes for the line: the "Your Total
                             Costs" / "Patient Responsibility" / "You Owe" figure —
                             NOT a deductible/copay/coinsurance sub-column alone.
- claim_ref = the claim number the line belongs to (repeat it on every row of that
  claim). service_date = that line's date of service; if the date is printed once
  on the claim header, repeat it on each of that claim's rows.
- Numbers only — no "$" and no thousands separators (write 268.00, not $268.00).
- Leave a field blank (nothing between the pipes) when it is genuinely absent.
- flag = a short verbatim note when the line was denied, written off, or "not
  payable" (e.g. "Not payable with the diagnosis billed"); otherwise leave it blank.

Return ONLY the header fields followed by the table. No commentary.`

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
