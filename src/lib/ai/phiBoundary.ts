import Anthropic from '@anthropic-ai/sdk'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'

// ─── PHI boundary: the ONLY path to the Anthropic API ──────────────────────────
//
// EquiAI principle 2 (de-identification by default): the model sees codes and
// amounts, not identities. VERITY has no BAA with Anthropic, so this module is
// the load-bearing compliance control. Every messages.create in the codebase
// MUST go through boundedMessage() — do not construct an Anthropic client
// anywhere else. New call sites declare an honest payload class:
//
//   'deidentified'  — structured/free text that has passed deidentifyFreeText()
//                     and carries no patient identifiers. This is the default
//                     expectation for every analysis/letter/copilot call.
//   'raw-document'  — a full bill/EOB image or PDF. Extraction cannot avoid
//                     showing the model the document, so these two edges
//                     (bill-extraction, eob-extraction) are declared, logged,
//                     and counted — never silent. Mitigations: the extraction
//                     prompts instruct the model NOT to transcribe patient
//                     name / member ID / mailing address into its output, so
//                     identifiers do not propagate into stored data. Closing
//                     this residual exposure entirely requires either local
//                     OCR+redaction before the vision call or a BAA — an open
//                     product decision, tracked on the launch checklist.
//
// Logging rule (same principle): log structure and lengths, never content.
// logAnthropicError() exists because a raw APIError object can echo request
// content into logs — log status/name/message only, never the whole object.

export type PhiPayloadClass = 'deidentified' | 'raw-document'

// ─── Backend selection: direct Anthropic API vs Claude on AWS Bedrock ─────────
// With ANTHROPIC_BACKEND=bedrock, inference runs on AWS Bedrock under the AWS
// BAA (counsel-confirmed for our configuration, July 2026): requests never
// egress to Anthropic, which closes the raw-document residual exposure for
// bill/EOB extraction. Bedrock needs three more env vars in Vercel:
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (an IAM user scoped to
//     bedrock:InvokeModel only)
//   AWS_REGION            e.g. us-east-1
//   BEDROCK_MODEL_ID      the Bedrock inference-profile ID for the model
//     (Bedrock uses its own dated IDs, e.g. us.anthropic.claude-…-v1:0 —
//     copy the exact Sonnet profile ID from the Bedrock console; on-demand
//     throughput requires the inference-profile form, not the bare model ID)
// Any other value (or unset) keeps the direct Anthropic API, so local dev and
// preview deploys work unchanged until the switch is flipped.
//
// Constructed lazily inside the handler, never at module scope — a module-scope
// SDK client evaluates on import and throws in a browser bundle. This module is
// server-only.
type BoundaryClient = Pick<Anthropic, 'messages'>

function bedrockEnabled(): boolean {
  return process.env.ANTHROPIC_BACKEND === 'bedrock'
}

let _client: BoundaryClient | null = null
function client(): BoundaryClient {
  if (!_client) {
    _client = bedrockEnabled()
      ? (new AnthropicBedrock({ awsRegion: process.env.AWS_REGION }) as unknown as BoundaryClient)
      : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

// Bedrock addresses models by its own IDs; the codebase keeps writing the
// canonical Anthropic model name and the boundary rewrites it at the edge.
function resolveModel(model: string): string {
  if (!bedrockEnabled()) return model
  const id = process.env.BEDROCK_MODEL_ID
  if (!id) {
    throw new Error(
      'ANTHROPIC_BACKEND=bedrock requires BEDROCK_MODEL_ID (the Bedrock inference-profile ID)'
    )
  }
  return id
}

// Structural size of an outbound message: counts and character totals only —
// safe to log, useful for diagnosing truncation/timeout patterns per stage.
function payloadShape(params: Anthropic.MessageCreateParamsNonStreaming): {
  blocks: number
  textChars: number
  documentBlocks: number
} {
  let blocks = 0
  let textChars = 0
  let documentBlocks = 0
  for (const m of params.messages) {
    if (typeof m.content === 'string') {
      blocks += 1
      textChars += m.content.length
      continue
    }
    for (const b of m.content) {
      blocks += 1
      if (b.type === 'text') textChars += b.text.length
      if (b.type === 'image' || b.type === 'document') documentBlocks += 1
    }
  }
  if (typeof params.system === 'string') textChars += params.system.length
  return { blocks, textChars, documentBlocks }
}

// The single choke point. `stage` names the pipeline step for the log line
// (e.g. 'bill-extraction', 'letter-generation'); `payloadClass` is the caller's
// declaration of what crosses the boundary. `timeoutMs` replaces the per-site
// client timeouts (letter 290s, copilot 55s) via the SDK's per-request option.
export async function boundedMessage(
  stage: string,
  payloadClass: PhiPayloadClass,
  params: Anthropic.MessageCreateParamsNonStreaming,
  opts?: { timeoutMs?: number; injectedClient?: Anthropic }
): Promise<Anthropic.Message> {
  const shape = payloadShape(params)
  const backend = opts?.injectedClient ? 'injected' : bedrockEnabled() ? 'bedrock' : 'direct'
  // PHI-SAFE: stage, class, backend, and shape only — never content.
  console.info(
    `phiBoundary[${stage}]: class=${payloadClass}, backend=${backend}, blocks=${shape.blocks}, ` +
      `documentBlocks=${shape.documentBlocks}, textChars=${shape.textChars}, ` +
      `maxTokens=${params.max_tokens}`
  )
  // Injected clients (tests) bypass model rewriting; live traffic resolves the
  // model per backend.
  const finalParams = opts?.injectedClient ? params : { ...params, model: resolveModel(params.model) }
  const c: BoundaryClient = opts?.injectedClient ?? client()
  return c.messages.create(finalParams, opts?.timeoutMs ? { timeout: opts.timeoutMs } : undefined)
}

// ─── Free-text de-identification ────────────────────────────────────────────────
// Scrubs identifiers from free text (patient notes, quoted rep statements)
// before it crosses the boundary. Two layers:
//   1. Pattern scrub: emails, phone-like and SSN-like number shapes. A 10-digit
//      run is redacted even when it is "only" an account number — an account
//      number is an identifier too.
//   2. Literal scrub: any known identifiers for this case (patient name,
//      account number, member ID) passed by the caller, replaced verbatim,
//      case-insensitively.
// The output keeps bracketed tokens so downstream prompts read naturally
// ("[PHONE]" etc.). Returns the scrubbed text and a redaction count for the
// caller's structural logging.

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g
// A date is only PHI-shaped when the text SAYS it's a birth date — redacting
// every date would destroy service dates, which the dispute analysis needs.
const DOB_PATTERN =
  /\b(?:dob|date of birth|born)\b[\s:.\-]{0,6}(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/gi
// US street addresses: house number + street name + a street-type suffix.
const ADDRESS_PATTERN =
  /\d+\s+\w+(\s\w+)*\s(st|street|ave|avenue|rd|road|dr|drive|ln|lane|trl|trail|blvd|way|ct|court)\b/gi

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type KnownIdentifiers = {
  patientName?: string | null
  accountNumber?: string | null
  memberId?: string | null
}

export function deidentifyFreeText(
  text: string,
  known?: KnownIdentifiers
): { text: string; redactions: number } {
  let redactions = 0
  let out = text

  // Known literals FIRST: an account number like "F00010479293" contains a
  // 10-digit run that the phone pattern would otherwise partially consume,
  // leaving a mangled remainder instead of a clean [ACCOUNT NUMBER] token.
  const literals: Array<[string | null | undefined, string]> = [
    [known?.patientName, '[PATIENT NAME]'],
    [known?.accountNumber, '[ACCOUNT NUMBER]'],
    [known?.memberId, '[MEMBER ID]'],
  ]
  for (const [value, token] of literals) {
    const v = typeof value === 'string' ? value.trim() : ''
    // Length guard: replacing 1–3 character "identifiers" would shred normal
    // prose (e.g. a patient named "Al" appearing inside "already").
    if (v.length < 4) continue
    out = out.replace(new RegExp(escapeRegExp(v), 'gi'), () => {
      redactions += 1
      return token
    })
  }

  out = out.replace(EMAIL_PATTERN, () => {
    redactions += 1
    return '[EMAIL]'
  })
  out = out.replace(SSN_PATTERN, () => {
    redactions += 1
    return '[SSN]'
  })
  out = out.replace(PHONE_PATTERN, () => {
    redactions += 1
    return '[PHONE]'
  })
  out = out.replace(DOB_PATTERN, () => {
    redactions += 1
    return '[REDACTED]'
  })
  out = out.replace(ADDRESS_PATTERN, () => {
    redactions += 1
    return '[REDACTED]'
  })

  return { text: out, redactions }
}

// PHI-safe error logging: an Anthropic APIError (and some transport errors) can
// echo request content. Log identity-free fields only, never the object.
export function logAnthropicError(stage: string, error: unknown): void {
  if (error instanceof Anthropic.APIError) {
    console.error(`phiBoundary[${stage}] Anthropic error: status=${error.status}, ${error.name}: ${error.message}`)
    return
  }
  const e = error as { name?: unknown; message?: unknown }
  console.error(
    `phiBoundary[${stage}] error: ${typeof e?.name === 'string' ? e.name : 'Error'}: ` +
      `${typeof e?.message === 'string' ? e.message.slice(0, 300) : 'unknown'}`
  )
}
