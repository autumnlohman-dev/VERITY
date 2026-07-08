/**
 * Bedrock smoke test: verifies AWS keys, region, quota, and the inference-
 * profile model ID BEFORE production ever flips ANTHROPIC_BACKEND=bedrock.
 *
 *   npm run bedrock:smoke
 *
 * Reads the five env vars from the environment (plus .env.local / .env when
 * present), validates them with the same fail-fast rules the phiBoundary
 * enforces, then sends ONE tiny non-PHI message ("Reply with OK") through the
 * phiBoundary transport with the Bedrock client and reports the outcome.
 *
 * This script forces ANTHROPIC_BACKEND=bedrock for ITS OWN process only; it
 * never writes or changes any stored configuration.
 */
import { config as loadDotenv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

for (const file of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), file)
  if (existsSync(p)) loadDotenv({ path: p })
}

const REQUIRED = [
  'ANTHROPIC_BACKEND',
  'AWS_REGION',
  'BEDROCK_MODEL_ID',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const

async function main(): Promise<void> {
  console.log('Bedrock smoke test')
  console.log('------------------')

  // Presence report: names only, never values.
  for (const name of REQUIRED) {
    const present = !!process.env[name]?.trim()
    console.log(`  ${name}: ${present ? 'present' : 'MISSING'}`)
  }
  const missingCreds = !process.env.AWS_ACCESS_KEY_ID?.trim() || !process.env.AWS_SECRET_ACCESS_KEY?.trim()

  // The smoke test exercises the Bedrock path regardless of whether the
  // backend flag is set in this shell (that is the point: verify BEFORE the
  // flip). In-process only.
  process.env.ANTHROPIC_BACKEND = 'bedrock'

  // Import AFTER the env is settled: the boundary's client is a lazy
  // singleton that reads the env on first use.
  const { boundedMessage, validateBedrockEnv } = await import('../src/lib/ai/phiBoundary')

  const problems = validateBedrockEnv(process.env)
  if (missingCreds) {
    problems.push('AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not both set (IAM user scoped to bedrock:InvokeModel).')
  }
  if (problems.length > 0) {
    console.error('\nFAIL: configuration problems:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  const modelId = process.env.BEDROCK_MODEL_ID!.trim()
  console.log(`\nSending one non-PHI test message via Bedrock (${process.env.AWS_REGION}) ...`)
  try {
    const message = await boundedMessage(
      'bedrock-smoke',
      'deidentified',
      {
        model: 'claude-sonnet-4-6', // rewritten to BEDROCK_MODEL_ID by the boundary
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with OK' }],
      },
      { timeoutMs: 30_000 }
    )
    const text = message.content.find((b) => b.type === 'text')
    console.log(`\nSUCCESS: Bedrock responded via model ${modelId}`)
    console.log(`  stop_reason=${message.stop_reason}, reply="${text && text.type === 'text' ? text.text.trim().slice(0, 40) : '(no text)'}"`)
    process.exit(0)
  } catch (err) {
    const e = err as { status?: unknown; name?: unknown; message?: unknown }
    console.error(`\nFAIL: Bedrock invocation error using model ${modelId}`)
    console.error(
      `  ${typeof e?.status === 'number' ? `status=${e.status}, ` : ''}${typeof e?.name === 'string' ? e.name : 'Error'}: ${typeof e?.message === 'string' ? e.message.slice(0, 400) : 'unknown'}`
    )
    console.error('  Common causes: IAM key lacks bedrock:InvokeModel, wrong AWS_REGION for the profile, model access not granted in the Bedrock console, or a bare model ID instead of the us.anthropic... inference-profile ID.')
    process.exit(1)
  }
}

void main()
