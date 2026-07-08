// Minimal server-side Lob client (https://docs.lob.com). Uses fetch + Basic auth
// so we add no dependency. ONLY import from server code — it reads LOB_API_KEY
// and must never reach the browser bundle.
//
// Test mode: a `test_` key creates letters that are NEVER physically mailed. We
// expose isLobTestKey() so the product can label such sends "TEST MODE" and we
// never believe real mail went out.

import { BRAND_NAME } from './brand'

const LOB_BASE = 'https://api.lob.com/v1'

export interface LobAddress {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  zip: string
}

// Lob's hard field limits (https://docs.lob.com/#tag/Letters). Exceeding any of
// these is a 422 from Lob — most commonly `name` (40), since a provider is often
// stored as one long "Name, Street, City, ST ZIP" blob.
export const LOB_LIMITS = { name: 40, line1: 64, line2: 64, city: 200 } as const

function clamp(s: string, n: number): string {
  const t = s.trim()
  return t.length > n ? t.slice(0, n) : t
}

// Truncate every field to Lob's limit so a slightly-too-long name/street can't
// fail the whole send. Deliverability depends on the street/city/state/ZIP, so a
// clipped recipient *name* still delivers.
export function clampAddress(a: LobAddress): LobAddress {
  return {
    name: clamp(a.name, LOB_LIMITS.name),
    line1: clamp(a.line1, LOB_LIMITS.line1),
    line2: a.line2 ? clamp(a.line2, LOB_LIMITS.line2) : undefined,
    city: clamp(a.city, LOB_LIMITS.city),
    state: a.state.trim().slice(0, 2).toUpperCase(),
    zip: a.zip.trim(),
  }
}

// Thrown when Lob rejects a request. Carries the HTTP status (4xx = our payload
// is bad → surface a specific reason; 5xx = Lob outage → generic retry) and Lob's
// own descriptive message, which the route sanitizes for the UI + logs to Sentry.
export class LobError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'LobError'
    this.statusCode = statusCode
  }
}

export function lobApiKey(): string | null {
  const key = process.env.LOB_API_KEY
  return key && key.trim() ? key.trim() : null
}

export function lobConfigured(): boolean {
  return lobApiKey() !== null
}

export function isLobTestKey(): boolean {
  const key = lobApiKey()
  return !!key && key.startsWith('test_')
}

function authHeader(): string {
  // Lob uses HTTP Basic with the API key as the username and an empty password.
  return 'Basic ' + Buffer.from(`${lobApiKey()}:`).toString('base64')
}

export type Deliverability =
  | 'deliverable'
  | 'deliverable_unnecessary_unit'
  | 'deliverable_incorrect_unit'
  | 'deliverable_missing_unit'
  | 'undeliverable'
  | 'unverified'

export interface AddressVerification {
  deliverability: Deliverability
  deliverable: boolean
  // Lob's normalized/corrected components, surfaced to the user as a fix-it suggestion.
  normalized?: LobAddress
}

// Run a US address through Lob verification. Network/key failures resolve to
// `unverified` + deliverable:true so a transient verifier outage never blocks a
// send (the caller can still decide). Only a definitive 'undeliverable' blocks.
export async function verifyUsAddress(addr: LobAddress): Promise<AddressVerification> {
  try {
    const res = await fetch(`${LOB_BASE}/us_verifications`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primary_line: addr.line1,
        secondary_line: addr.line2 || undefined,
        city: addr.city,
        state: addr.state,
        zip_code: addr.zip,
      }),
    })
    if (!res.ok) return { deliverability: 'unverified', deliverable: true }
    const data = (await res.json()) as {
      deliverability?: Deliverability
      primary_line?: string
      secondary_line?: string
      components?: { city?: string; state?: string; zip_code?: string }
    }
    const deliverability = data.deliverability ?? 'unverified'
    const deliverable = deliverability !== 'undeliverable'
    const normalized: LobAddress | undefined = data.primary_line
      ? {
          name: addr.name,
          line1: data.primary_line,
          line2: data.secondary_line || undefined,
          city: data.components?.city ?? addr.city,
          state: data.components?.state ?? addr.state,
          zip: data.components?.zip_code ?? addr.zip,
        }
      : undefined
    return { deliverability, deliverable, normalized }
  } catch {
    return { deliverability: 'unverified', deliverable: true }
  }
}

export interface CreatedLetter {
  id: string
  expectedDeliveryDate: string | null
  carrier: string | null
}

function toLobAddress(a: LobAddress) {
  return {
    name: a.name,
    address_line1: a.line1,
    address_line2: a.line2 || undefined,
    address_city: a.city,
    address_state: a.state,
    address_zip: a.zip,
    address_country: 'US',
  }
}

// Create a Lob letter from an HTML string. color:false per spec; certified maps
// to Lob's certified extra_service. `addressPlacement: top_first_page` lets Lob
// print the recipient block into the reserved blank area at the top of page 1.
export async function createLetter(args: {
  to: LobAddress
  from: LobAddress
  html: string
  certified: boolean
  description?: string
  idempotencyKey?: string
}): Promise<CreatedLetter> {
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    'Content-Type': 'application/json',
  }
  if (args.idempotencyKey) headers['Idempotency-Key'] = args.idempotencyKey

  const body: Record<string, unknown> = {
    description: args.description ?? `${BRAND_NAME} dispute letter`,
    // Clamp to Lob's field limits as a server-side safety net (the panel also
    // splits the provider blob into clean name/street/city/state/zip fields).
    to: toLobAddress(clampAddress(args.to)),
    from: toLobAddress(clampAddress(args.from)),
    file: args.html,
    color: false,
    address_placement: 'top_first_page',
    // Dispute letters are transactional mail tied to the user's own bill — never
    // marketing. Lob requires use_type to be 'operational' or 'marketing'.
    use_type: 'operational',
  }
  if (args.certified) body.extra_service = 'certified'

  const res = await fetch(`${LOB_BASE}/letters`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => ({}))) as {
    id?: string
    expected_delivery_date?: string
    carrier?: string
    error?: { message?: string; status_code?: number }
  }
  if (!res.ok || !data.id) {
    throw new LobError(
      data.error?.message || `Lob letter creation failed (${res.status})`,
      data.error?.status_code ?? res.status
    )
  }
  return {
    id: data.id,
    expectedDeliveryDate: data.expected_delivery_date ?? null,
    carrier: data.carrier ?? null,
  }
}
