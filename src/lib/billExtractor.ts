import Anthropic from '@anthropic-ai/sdk'

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
  { pattern: /gram\s+stain/i, cpt: '87205' }
]

export function mapDescriptionToCpt(description: string): string | null {
  const text = description.trim()
  if (!text) return null
  for (const entry of DESCRIPTION_TO_CPT) {
    if (entry.pattern.test(text)) return entry.cpt
  }
  return null
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
              'Patient name as shown on the bill. Empty string if not visible.'
          },
          account_number: {
            type: 'string',
            description:
              'Patient account number or statement number if visible. Empty string otherwise.'
          }
        },
        required: [
          'provider_name',
          'provider_npi',
          'provider_address',
          'bill_date',
          'patient_name',
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
                'The 5-character CPT or HCPCS code (e.g. "99213", "G0438"). Omit the row if no code is visible.'
            },
            description: {
              type: 'string',
              description: 'Service description as it appears on the bill.'
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
            'cpt_code',
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

For the bill metadata, record the provider/facility name, NPI, address, bill date, patient name, and account number. Use empty strings for any field that is not visible.

For each line item, identify:
- CPT or HCPCS code (5 alphanumeric characters)
- Service description as shown
- Date of service, normalized to YYYY-MM-DD
- Units billed (default 1 if not shown)
- Billed amount in dollars as a number
- Any CPT modifiers

Only extract actual charge lines. Skip payments, adjustments, insurance discounts, subtotals, taxes, and summary/total rows. If a row has no CPT or HCPCS code, omit it entirely. Return the result via the record_bill tool.`

function emptyMetadata(): ExtractedBillMetadata {
  return {
    provider_name: '',
    provider_npi: '',
    provider_address: '',
    bill_date: '',
    patient_name: '',
    account_number: ''
  }
}

export async function extractBillContent(
  file: File,
  anthropic?: Anthropic
): Promise<ExtractionResult> {
  const client =
    anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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

  const message = await client.messages.create({
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
  })

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
    patient_name: String(metaRaw.patient_name ?? '').trim(),
    account_number: String(metaRaw.account_number ?? '').trim()
  }

  const rawItems = Array.isArray(input.line_items) ? input.line_items : []
  const candidates: ExtractedLineItem[] = rawItems
    .map((raw) => {
      const r = raw as Record<string, unknown>
      const extractedCode = String(r.cpt_code ?? '').trim().toUpperCase()
      const description = typeof r.description === 'string' ? r.description : ''

      // If Claude pulled a non-CPT-format code (common on facility bills that
      // list internal chargemaster IDs), try to resolve it from the service
      // description. Don't override valid CPT codes.
      let cptCode = extractedCode
      if (extractedCode && !CPT_CODE_PATTERN.test(extractedCode)) {
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
    .filter((item) => item.cpt_code && item.date_of_service)

  const lineItems: ExtractedLineItem[] = candidates
  const warnings: ExtractionWarning[] = []
  for (const item of candidates) {
    if (!CPT_CODE_PATTERN.test(item.cpt_code)) {
      warnings.push({
        code: item.raw_code,
        description: item.description,
        date_of_service: item.date_of_service,
        billed_amount: item.billed_amount,
        reason: `"${item.raw_code}" does not match standard CPT/HCPCS format and no description-based CPT mapping was available. Excluded from rule-based audit; still reviewed for patient-reported disputes.`
      })
    }
  }

  return {
    lineItems,
    billMetadata: billMetadata ?? emptyMetadata(),
    warnings,
    rawToolInput
  }
}
