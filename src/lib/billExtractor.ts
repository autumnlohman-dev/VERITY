import type Anthropic from '@anthropic-ai/sdk'
import { boundedMessage } from './ai/phiBoundary'

export interface ExtractedLineItem {
  cpt_code: string
  /**
   * Code as it appeared on the bill, before description-based CPT mapping.
   * Differs from cpt_code when a proprietary facility/revenue code was
   * resolved to a standard CPT via DESCRIPTION_TO_CPT.
   */
  raw_code: string
  description: string
  date_of_service: string
  units: number
  billed_amount: number
  modifiers: string[]
}

export interface ExtractedBillMetadata {
  provider_name: string
  provider_npi: string
  provider_address: string
  bill_date: string
  patient_name: string
  patient_address_street: string
  patient_address_city: string
  patient_address_state: string
  patient_address_zip: string
  account_number: string
}

export interface ExtractionWarning {
  code: string
  description: string
  billed_amount: number
  date_of_service: string
  reason: string
}

export interface ExtractionResult {
  lineItems: ExtractedLineItem[]
  billMetadata: ExtractedBillMetadata
  warnings: ExtractionWarning[]
  rawToolInput: unknown
}

export const CPT_CODE_PATTERN = /^(?:\d{5}|\d{4}[A-Z]|[A-Z]\d{4})$/

/**
 * Facility bills often list proprietary internal charge codes (e.g.
 * "401000018") alongside a human-readable service description. The internal
 * code doesn't match any PFS/CLFS entry, so the audit can't price it. When
 * we see a non-CPT code whose description matches a well-known service, swap
 * in the canonical CPT so the audit has something to work with.
 *
 * Patterns are case-insensitive and allow common variations in phrasing. Add
 * new entries here as bills surface new descriptions — keep it conservative:
 * only map services where the description is unambiguous.
 */
export const DESCRIPTION_TO_CPT: Array<{ pattern: RegExp; cpt: string }> = [
  { pattern: /comprehensive\s+metabolic\s+panel|^\s*cmp\s*$|\bcmp[-\s]*14\b/i, cpt: '80053' },
  { pattern: /\bcbc\b[^\n]*?(?:auto\s*)?diff|complete\s+blood\s+count[^\n]*?diff/i, cpt: '85025' },
  { pattern: /\blipase\b/i, cpt: '83690' },
  { pattern: /c[-\s]?reactive\s+protein|\bcrp\b/i, cpt: '86140' },
  { pattern: /\bvenipuncture\b|routine\s+venipuncture/i, cpt: '36415' },
  { pattern: /gram\s+stain/i, cpt: '87205' },
  // Stool culture for Salmonella and Shigella species (either order, with or
  // without a slash) → 87045.
  { pattern: /(salmonell\w*\s*\/?\s*shigell\w*)|(shigell\w*\s*\/?\s*salmonell\w*)/i, cpt: '87045' },
  // Multiplex GI / stool pathogen panel (nucleic acid, 12–25 targets) → 87507.
  { pattern: /stool\s+pathogens?\b[^\n]*\bpanel\b/i, cpt: '87507' },
  // Professional emergency-department E&M, moderate medical decision-making.
  // Only the moderate level is mapped (conservative); 99284 per 2023 ED MDM.
  { pattern: /\bed\s+visit\b[^\n]*\bmod(?:erate)?\s+mdm\b/i, cpt: '99284' },
  // Type A emergency-department facility levels: "Emergency Class I–V" map to
  // the ED E&M code range 99281–99285. The trailing \b keeps the roman numerals
  // mutually exclusive (e.g. "class i" never matches "class iii"). These share
  // the professional E&M codes but are facility fees, so the audit routes them
  // to the E&M complexity review rather than a blunt PFS overcharge check.
  { pattern: /emergency\s+class\s+iii\b/i, cpt: '99283' },
  { pattern: /emergency\s+class\s+iv\b/i, cpt: '99284' },
  { pattern: /emergency\s+class\s+v\b/i, cpt: '99285' },
  { pattern: /emergency\s+class\s+ii\b/i, cpt: '99282' },
  { pattern: /emergency\s+class\s+i\b/i, cpt: '99281' },
  // Thyroid-stimulating hormone.
  { pattern: /^\s*tsh\s*$|thyroid[\s-]*stimulating\s+hormone/i, cpt: '84443' },
  // Free thyroxine (Free T4). Anchored/word-bounded so it doesn't catch "T4 free"
  // inside an unrelated phrase or the total-T4 assay (84436).
  { pattern: /^\s*t4[\s,-]*free\s*$|free\s*t4\b|\bt4\b[\s,-]+free\b|free\s+thyroxine/i, cpt: '84439' },
  // Immunoglobulin A, quantitative. Whole-token "IGA" only (avoid matching it
  // as a substring of other words).
  { pattern: /^\s*iga\s*$|immunoglobulin\s+a\b/i, cpt: '82784' },
  // Tissue transglutaminase (tTG) antibody.
  { pattern: /tissue\s+transglutaminase|\bttg\b/i, cpt: '83516' }
]

export function mapDescriptionToCpt(description: string): string | null {
  const text = description.trim()
  if (!text) return null
  for (const entry of DESCRIPTION_TO_CPT) {
    if (entry.pattern.test(text)) return entry.cpt
  }
  return null
}

/**
 * Encounter-organized facility bills interleave non-charge rows among the
 * actual charges: insurance payments, contractual allowance adjustments, and
 * credit/refund adjustments — typically carrying negative amounts (e.g.
 * "COMMERCIAL INSURANCE PAYMENT", "CONTRACTUAL ALLOWANCE ADJUST", "OTHER CREDIT
 * ADJUSTMENT"). These are not billable line items: counting them would corrupt
 * totals, skew duplicate detection, and surface false overcharges. Exclude any
 * row whose amount is negative or whose description reads as a payment,
 * adjustment, allowance, credit, refund, or write-off.
 */
const NON_CHARGE_PATTERN =
  /\b(payment|adjust(?:ment|ed)?|allowance|credit|refund|write[-\s]?off|contractual)\b/i

export function isNonChargeRow(description: string, billedAmount: number): boolean {
  if (billedAmount < 0) return true
  return NON_CHARGE_PATTERN.test(description)
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])

export function isAllowedMediaType(mediaType: string): boolean {
  return mediaType === 'application/pdf' || ALLOWED_IMAGE_TYPES.has(mediaType)
}

const EXTRACT_BILL_TOOL = {
  name: 'record_bill' as const,
  description:
    'Record the contents of a medical bill: provider metadata plus the itemized line items.',
  input_schema: {
    type: 'object' as const,
    properties: {
      bill_metadata: {
        type: 'object',
        properties: {
          provider_name: {
            type: 'string',
            description:
              'Provider or facility name as shown on the bill. Empty string if not visible.'
          },
          provider_npi: {
            type: 'string',
            description:
              '10-digit National Provider Identifier (NPI) if visible. Empty string if not visible.'
          },
          provider_address: {
            type: 'string',
            description:
              'Provider address or location. Empty string if not visible.'
          },
          bill_date: {
            type: 'string',
            description:
              'Bill or statement date in YYYY-MM-DD. Empty string if not visible.'
          },
          patient_name: {
            type: 'string',
            description:
              'Always return an empty string. Patient identifiers are not extracted (de-identification default).'
          },
          patient_address_street: {
            type: 'string',
            description:
              'Always return an empty string. Patient identifiers are not extracted.'
          },
          patient_address_city: {
            type: 'string',
            description:
              'Always return an empty string. Patient identifiers are not extracted.'
          },
          patient_address_state: {
            type: 'string',
            description:
              'Always return an empty string. Patient identifiers are not extracted.'
          },
          patient_address_zip: {
            type: 'string',
            description:
              'Always return an empty string. Patient identifiers are not extracted.'
          },
          account_number: {
            type: 'string',
            description:
              'Always return an empty string. Patient identifiers are not extracted.'
          }
        },
        required: [
          'provider_name',
          'provider_npi',
          'provider_address',
          'bill_date',
          'patient_name',
          'patient_address_street',
          'patient_address_city',
          'patient_address_state',
          'patient_address_zip',
          'account_number'
        ]
      },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cpt_code: {
              type: 'string',
              description:
                'The 5-character CPT or HCPCS code (e.g. "99213", "G0438") if one is printed for this row. Many bills list only a service description with no code — in that case return an empty string and still record the row. Do NOT invent a code.'
            },
            description: {
              type: 'string',
              description:
                'Service description exactly as it appears on the bill (e.g. "CMP", "TSH", "CBC DIFF", "VENIPUNCTURE", "XR BONE AGE STUDY"). Always required — this is how a row with no code is identified.'
            },
            date_of_service: {
              type: 'string',
              description:
                'Date of service in YYYY-MM-DD. If only month/year is visible, use the first day of that period.'
            },
            units: {
              type: 'number',
              description: 'Number of units billed. Use 1 if not shown.'
            },
            billed_amount: {
              type: 'number',
              description:
                'Amount billed in dollars as a plain number (no currency symbol).'
            },
            modifiers: {
              type: 'array',
              items: { type: 'string' },
              description:
                'CPT modifiers for this line (e.g. "59", "25"). Empty array if none.'
            }
          },
          required: [
            'description',
            'date_of_service',
            'units',
            'billed_amount'
          ]
        }
      }
    },
    required: ['bill_metadata', 'line_items']
  }
}

const EXTRACT_BILL_PROMPT = `Extract the bill metadata and every itemized charge line from this medical bill.

For the bill metadata, record the provider/facility name, NPI, address, and bill date. Use empty strings for any field that is not visible.
PRIVACY — never extract patient identifiers: always return empty strings for patient_name, every patient_address_* field, and account_number, even when the document prints them (EquiAI de-identification default: identifiers must not cross into model output).

The bill may be organized into multiple encounters, each with its own block of charges. Capture charge lines from every encounter.

For each line item, identify:
- CPT or HCPCS code (5 alphanumeric characters) if printed — MANY bills list only a description with no code; in that case leave cpt_code as an empty string and still record the line keyed by its description. Never invent a code.
- Service description exactly as shown (e.g. "CMP", "TSH", "CBC DIFF", "VENIPUNCTURE", "XR BONE AGE STUDY")
- Date of service, normalized to YYYY-MM-DD (use the encounter's date if the row itself doesn't repeat it)
- Units billed (default 1 if not shown)
- Billed amount in dollars as a number
- Any CPT modifiers

Capture every actual charge line, with or without a code. EXCLUDE non-charge rows that are interleaved among the charges: insurance payments, contractual allowance adjustments, credit/refund adjustments, write-offs, and any row with a negative amount (these read as "COMMERCIAL INSURANCE PAYMENT", "CONTRACTUAL ALLOWANCE ADJUST", "OTHER CREDIT ADJUSTMENT", etc.). Also skip subtotals, taxes, and summary/total rows. Return the result via the record_bill tool.`

function emptyMetadata(): ExtractedBillMetadata {
  return {
    provider_name: '',
    provider_npi: '',
    provider_address: '',
    bill_date: '',
    patient_name: '',
    patient_address_street: '',
    patient_address_city: '',
    patient_address_state: '',
    patient_address_zip: '',
    account_number: ''
  }
}

// H1 NOTE: this tool-use extractor is more robust than the live text-JSON
// parser in extraction.ts (structured output, plus richer metadata — patient
// name/address and provider NPI for letter generation). It is currently UNUSED
// (its only caller, /api/extract-line-items, was removed). It is deliberately
// retained — not swapped into the live audit path yet — because that swap
// changes extraction behaviour for every upload, drops the lowConfidence signal
// the live path stores, and can only be validated against real bill uploads. It
// belongs in its own change, not bundled with a security/cleanup pass. The CPT
// mapping helpers below (DESCRIPTION_TO_CPT / mapDescriptionToCpt /
// CPT_CODE_PATTERN) ARE live — extraction.ts imports them.
export async function extractBillContent(
  file: File,
  anthropic?: Anthropic
): Promise<ExtractionResult> {
  const mediaType = file.type
  const isPdf = mediaType === 'application/pdf'
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const fileBlock = isPdf
    ? {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: base64
        }
      }
    : {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType as
            | 'image/jpeg'
            | 'image/png'
            | 'image/gif'
            | 'image/webp',
          data: base64
        }
      }

  // PHI boundary: legacy raw-document edge — kept consistent with the live
  // extractor. The identity fields in EXTRACT_BILL_TOOL are schema-retained for
  // type compatibility but are prompt-forbidden AND hard-blanked in
  // normalization below, so reviving this path cannot leak identifiers.
  const message = await boundedMessage('bill-extraction-legacy', 'raw-document', {
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    tools: [EXTRACT_BILL_TOOL],
    tool_choice: { type: 'tool', name: EXTRACT_BILL_TOOL.name },
    messages: [
      {
        role: 'user',
        content: [fileBlock, { type: 'text', text: EXTRACT_BILL_PROMPT }]
      }
    ]
  }, { timeoutMs: 60_000, injectedClient: anthropic })

  const toolUse = message.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return structured output')
  }

  const rawToolInput = toolUse.input
  const input = rawToolInput as {
    line_items?: unknown
    bill_metadata?: unknown
  }

  const metaRaw = (input.bill_metadata ?? {}) as Record<string, unknown>
  const billMetadata: ExtractedBillMetadata = {
    provider_name: String(metaRaw.provider_name ?? '').trim(),
    provider_npi: String(metaRaw.provider_npi ?? '').trim(),
    provider_address: String(metaRaw.provider_address ?? '').trim(),
    bill_date: String(metaRaw.bill_date ?? '').trim(),
    // Hard-blanked regardless of model output: patient identifiers never
    // propagate from a document into stored data (de-identification default).
    // The letter path supplies identity via [PATIENT NAME]/[ADDRESS]/[ACCOUNT
    // NUMBER] placeholders the patient fills in locally.
    patient_name: '',
    patient_address_street: '',
    patient_address_city: '',
    patient_address_state: '',
    patient_address_zip: '',
    account_number: ''
  }

  const { lineItems, warnings } = normalizeBillLineItems(input.line_items)

  return {
    lineItems,
    billMetadata: billMetadata ?? emptyMetadata(),
    warnings,
    rawToolInput
  }
}

/**
 * Turn the model's raw `line_items` into billable {@link ExtractedLineItem}s
 * plus manual-review {@link ExtractionWarning}s. Pure (no I/O) so it can be
 * exercised against fixture bills.
 *
 * Three behaviors matter for real-world bills:
 *  1. Rows with no CPT/HCPCS code are still captured, keyed by description, and
 *     resolved to a canonical CPT via {@link DESCRIPTION_TO_CPT} where the
 *     description is unambiguous. Rows that can't be resolved keep an empty
 *     `cpt_code` and surface as a rate-unavailable warning rather than being
 *     dropped — never discard the whole document just because codes are absent.
 *  2. Non-charge rows (payments, contractual allowance adjustments, credits,
 *     refunds, negative amounts) are excluded — they aren't billable.
 *  3. A row needs *something* to key on: either a code or a description.
 */
export function normalizeBillLineItems(rawLineItems: unknown): {
  lineItems: ExtractedLineItem[]
  warnings: ExtractionWarning[]
} {
  const rawItems = Array.isArray(rawLineItems) ? rawLineItems : []
  const lineItems: ExtractedLineItem[] = rawItems
    .map((raw) => {
      const r = raw as Record<string, unknown>
      const extractedCode = String(r.cpt_code ?? '').trim().toUpperCase()
      const description = typeof r.description === 'string' ? r.description : ''

      // If Claude pulled a non-CPT-format code (common on facility bills that
      // list internal chargemaster IDs) or no code at all, try to resolve it
      // from the service description. Don't override valid CPT codes.
      let cptCode = extractedCode
      if (!CPT_CODE_PATTERN.test(extractedCode)) {
        const mapped = mapDescriptionToCpt(description)
        if (mapped) cptCode = mapped
      }

      return {
        cpt_code: cptCode,
        raw_code: extractedCode,
        description,
        date_of_service: String(r.date_of_service ?? '').trim(),
        units: Number(r.units) || 1,
        billed_amount: Number(r.billed_amount) || 0,
        modifiers: Array.isArray(r.modifiers)
          ? r.modifiers.map((m) => String(m))
          : []
      }
    })
    // Drop interleaved payment/adjustment/credit rows, then keep anything that
    // has a code or a description to anchor on.
    .filter((item) => !isNonChargeRow(item.description, item.billed_amount))
    .filter((item) => item.cpt_code !== '' || item.description !== '')

  const warnings: ExtractionWarning[] = []
  for (const item of lineItems) {
    if (!CPT_CODE_PATTERN.test(item.cpt_code)) {
      const label = item.raw_code || item.description || 'Unlabeled charge'
      warnings.push({
        code: item.raw_code,
        description: item.description,
        date_of_service: item.date_of_service,
        billed_amount: item.billed_amount,
        reason: `"${label}" has no standard CPT/HCPCS code and no description-based CPT mapping was available. Captured as a billable line for manual review (rate unavailable); excluded from the rule-based fee-schedule audit but still reviewed for patient-reported disputes.`
      })
    }
  }

  return { lineItems, warnings }
}
