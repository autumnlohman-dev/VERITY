import type Anthropic from '@anthropic-ai/sdk'
import type { CanonicalBillingSchema } from './schema'
import { extractToCBS, EOB_MEDIA_TYPES, eobCanonicalHeaderPresent } from './extractor'
import { normalizeForExtraction } from '../heic'
import { boundedMessage } from '../ai/phiBoundary'

// Thrown when the vision transcription yields no usable EOB line items — i.e. the
// output was blank or could not be parsed into a single billed line. It is an
// extraction FAILURE, not a valid empty EOB: runFullAudit's catch maps any throw
// here to eobError=true, which surfaces the "couldn't read your EOB" notice
// instead of a silently bill-only audit whose every bill line shows up as a
// low-confidence non-match against an empty EOB.
export class EOBExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EOBExtractionError'
  }
}

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
// PHI boundary: this is the second declared 'raw-document' edge — the vision
// call must see the EOB to transcribe it. The system prompt forbids
// transcribing patient identifiers (name, member ID, mailing address) into the
// OUTPUT, so identifiers do not propagate into the stored transcription/CBS.
// All API access goes through lib/ai/phiBoundary — never construct an
// Anthropic client here.

const EOB_TRANSCRIBE_SYSTEM = `You read an Explanation of Benefits (EOB) / remittance document and output a NORMALIZED transcription. Never invent, round, or omit values.

First, transcribe these labeled header fields, each on its own line, when present
(omit a line entirely when the document does not print that field — never leave
a label with an empty value):
  Claim Number: ...
  Provider: ...
  NPI: ...
  Member ID: [REDACTED]
  Date of Service: MM/DD/YYYY
  Processed/EOB Date: MM/DD/YYYY
  Appeal by: MM/DD/YYYY
  Total You Owe: ...   (the EOB's total patient responsibility across all claims —
  the "You Owe" / "Your Total Costs" / "Patient Responsibility" TOTAL, numbers only)

PRIVACY — never transcribe patient identifiers: write the literal text
[REDACTED] for the Member ID value, and NEVER output the patient's name,
mailing address, phone, email, or SSN anywhere, even where the document prints
them. Claim numbers, provider names, NPIs, dates, and amounts are required and
are NOT redacted.

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

  const message = await boundedMessage('eob-extraction', 'raw-document', {
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
  const cbs = extractToCBS(rawText, documentId, 'eob')

  // PHI-SAFE diagnostics. NEVER log the transcription itself — an EOB is PHI and
  // we have no BAA covering log storage. Log only shape metrics, which are enough
  // to tell a blank vision response (length≈0) from a present-but-unparseable one
  // (non-zero length, header missing or zero parsed rows): transcription length,
  // line count, whether the canonical header was found, parsed row count, and the
  // cell count of the first pipe row (structure only, no cell contents).
  const headerFound = eobCanonicalHeaderPresent(rawText)
  const transcriptionLines = rawText.split('\n')
  const firstPipeLine = transcriptionLines.map((l) => l.trim()).find((l) => l.includes('|'))
  const firstPipeRowCells = firstPipeLine ? firstPipeLine.split('|').length : 0
  console.info(
    `extractEOBToCBS[${documentId}]: transcriptionLength=${rawText.length}, ` +
      `transcriptionLines=${transcriptionLines.length}, canonicalHeaderFound=${headerFound}, ` +
      `parsedLineItems=${cbs.lineItems.length}, firstPipeRowCells=${firstPipeRowCells}`
  )

  // A transcription that yields zero usable line items is an extraction failure,
  // not a valid empty EOB. Throw so runFullAudit degrades to a FLAGGED bill-only
  // audit (eobError=true) rather than feeding the matcher an empty EOB that turns
  // every bill line into a low-confidence non-match.
  if (cbs.lineItems.length === 0) {
    throw new EOBExtractionError(
      `EOB transcription produced no line items ` +
        `(transcriptionLength=${rawText.length}, canonicalHeaderFound=${headerFound}).`
    )
  }

  return cbs
}
