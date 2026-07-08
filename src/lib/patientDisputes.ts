import Anthropic from '@anthropic-ai/sdk'
import type { LineItem, BillingError } from './errorDetection'
import {
  boundedMessage,
  deidentifyFreeText,
  logAnthropicError,
  type KnownIdentifiers,
} from './ai/phiBoundary'

export async function analyzeDisputedProcedures(
  lineItems: LineItem[],
  userNotes: string,
  known?: KnownIdentifiers,
  anthropic?: Anthropic
): Promise<BillingError[]> {
  // PHI boundary: userNotes is patient-written free text and routinely contains
  // names ("my daughter…"), phone numbers, and account numbers. Scrub before it
  // crosses to the API — the dispute analysis needs the situation, not the
  // identity. (EquiAI principle 2; see lib/ai/phiBoundary.) The caller passes
  // the identifiers it knows (account/case reference) so their literal values
  // are stripped even where the shape patterns wouldn't catch them.
  const { text: scrubbedNotes } = deidentifyFreeText(userNotes.trim(), known)
  const trimmed = scrubbedNotes
  if (trimmed.length === 0 || lineItems.length === 0) return []

  const summary = lineItems.map((li, idx) => ({
    index: idx,
    cpt_code: li.cpt_code,
    description: li.description ?? '',
    date_of_service: li.date_of_service,
    billed_amount: li.billed_amount
  }))

  try {
    const message = await boundedMessage('dispute-analysis', 'deidentified', {
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      tools: [
        {
          name: 'record_disputed_procedures',
          description:
            'Record line items the patient disputes as not rendered, cancelled, or incorrectly billed.',
          input_schema: {
            type: 'object',
            properties: {
              disputed: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    line_item_index: {
                      type: 'number',
                      description:
                        '0-indexed position of the disputed line item in the provided list.'
                    },
                    reason: {
                      type: 'string',
                      description:
                        "One-sentence explanation of why the patient disputes this line, quoting or paraphrasing the patient's note."
                    }
                  },
                  required: ['line_item_index', 'reason']
                }
              }
            },
            required: ['disputed']
          }
        }
      ],
      tool_choice: { type: 'tool', name: 'record_disputed_procedures' },
      messages: [
        {
          role: 'user',
          content: `A patient has uploaded a medical bill for audit. Here are the itemized line items they were billed for:

${JSON.stringify(summary, null, 2)}

Here is a note the patient wrote describing issues with the bill:

"""
${trimmed}
"""

Identify which line items (by index) the patient is disputing — for example, a service that was not rendered, a procedure that was cancelled, a test never completed, a provider the patient never saw, or a charge the patient specifically calls out as wrong. Be conservative: only flag a line if the patient's note clearly implicates it. If no lines are implicated, return an empty disputed list. Respond via the record_disputed_procedures tool.`
        }
      ]
    }, { timeoutMs: 60_000, injectedClient: anthropic })

    const toolUse = message.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return []

    const input = toolUse.input as { disputed?: unknown }
    const disputed = Array.isArray(input.disputed) ? input.disputed : []

    const errors: BillingError[] = []
    for (const entry of disputed) {
      const e = entry as Record<string, unknown>
      const idx = Number(e.line_item_index)
      if (!Number.isInteger(idx) || idx < 0 || idx >= lineItems.length) continue
      const reason =
        typeof e.reason === 'string' && e.reason.trim()
          ? e.reason.trim()
          : 'The patient disputes this charge.'
      const item = lineItems[idx]
      const billed = Number(item.billed_amount) || 0

      errors.push({
        cpt_code: item.cpt_code,
        description: item.description ?? '',
        error_type: 'patient_disputed',
        billed_amount: billed,
        expected_amount: 0,
        confidence: 'HIGH',
        explanation: `${reason} Billing for services not actually rendered, or for procedures the patient reports were not performed, may violate federal rules prohibiting payment for services not provided.`,
        rule_violated:
          'Billing for services not rendered — 42 CFR § 1001.952 and CMS Claims Processing Manual prohibit billing for services not actually provided to the patient.'
      })
    }
    return errors
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw err
    }
    // PHI-safe: log name/message only — a raw error object can echo request
    // content (which includes the patient's note) into log storage.
    logAnthropicError('dispute-analysis', err)
    return []
  }
}
