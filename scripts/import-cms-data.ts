/**
 * Ingest CMS reference data (PFS, NCCI PTP, NCCI MUE) into Supabase.
 *
 * Run once per year after CMS publishes the annual PFS, and quarterly for
 * NCCI PTP / MUE refreshes. See README-DATA-SETUP.md for source URLs and
 * schema prerequisites.
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Env optional (override sources):
 *   PFS_SOURCE        URL or local path to PFS rates (CSV / JSON)
 *   NCCI_PTP_SOURCE   URL or local path to NCCI PTP edits (CSV)
 *   NCCI_MUE_SOURCE   URL or local path to NCCI MUE edits (CSV)
 *   PFS_CONVERSION_FACTOR  (default 32.7442 — CMS 2024 final rule)
 *
 * Each source can also be passed via CLI flag:
 *   --pfs=<url|path> --ncci-ptp=<url|path> --ncci-mue=<url|path>
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// ─── Config ───────────────────────────────────────────────────────────────────

const CMS_CONVERSION_FACTOR_2024 = 32.7442

const NATIONAL_LOCALITY = '00'

const BATCH_SIZE = 500

// CMS publishes the PFS Relative Value Files and NCCI edit files at stable
// index pages. The actual file URLs rotate each year/quarter. Override these
// env vars (or CLI flags) with the current download URL. The README documents
// how to find them.
const DEFAULT_SOURCES = {
  pfs:
    process.env.PFS_SOURCE ||
    'https://www.cms.gov/medicare/payment/fee-schedules/physician',
  ncciPtp:
    process.env.NCCI_PTP_SOURCE ||
    'https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits',
  ncciMue:
    process.env.NCCI_MUE_SOURCE ||
    'https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits'
}

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([a-z0-9-]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const args = parseArgs(process.argv)

// ─── Env helpers ──────────────────────────────────────────────────────────────

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

// ─── Source loading (URL or local file, CSV or JSON) ──────────────────────────

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

async function loadSourceText(source: string): Promise<string> {
  if (isUrl(source)) {
    console.log(`  → fetching ${source}`)
    const res = await fetch(source)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${source}`)
    }
    return await res.text()
  }
  const abs = path.resolve(source)
  console.log(`  → reading ${abs}`)
  return await fs.readFile(abs, 'utf8')
}

// ─── Simple CSV parser (quoted fields, commas, CRLF) ──────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field)
        field = ''
      } else if (c === '\n' || c === '\r') {
        if (field.length > 0 || row.length > 0) {
          row.push(field)
          rows.push(row)
          row = []
          field = ''
        }
        if (c === '\r' && text[i + 1] === '\n') i++
      } else {
        field += c
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim()
    })
    return obj
  })
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

/**
 * Map a PFS source row to the fee-schedule shape. Tolerant to column naming
 * variations between the PFS Relative Value File and the data.cms.gov JSON API:
 *   - HCPCS / HCPCS_Cd / CPT code
 *   - Description / DESCRIPTION / HCPCS_DESC
 *   - Work RVU / WORK_RVU / Tot_RVUs
 *   - Non-Facility Total / Non_Fac_PE_RVU / non_facility_amount
 *   - Facility Total / Fac_PE_RVU / facility_amount
 *
 * If only RVUs are present, derive the dollar amount as RVU × conversion factor.
 */
function mapPfsRow(
  raw: Record<string, string>,
  conversionFactor: number
): {
  cpt_code: string
  description: string | null
  work_rvu: number | null
  facility_amount: number | null
  non_facility_amount: number | null
  allowed_amount: number | null
  locality: string
} | null {
  const code = (
    raw.HCPCS ||
    raw.HCPCS_Cd ||
    raw.hcpcs ||
    raw['HCPCS Code'] ||
    raw.CPT ||
    raw.cpt_code ||
    ''
  )
    .trim()
    .toUpperCase()
  if (!code) return null

  const description =
    raw.Description ||
    raw.DESCRIPTION ||
    raw.HCPCS_DESC ||
    raw.hcpcs_description ||
    raw.description ||
    null

  const workRvuRaw = raw['Work RVU'] || raw.WORK_RVU || raw.work_rvu
  const workRvu =
    workRvuRaw !== undefined && workRvuRaw !== '' ? Number(workRvuRaw) : null

  const facAmountRaw =
    raw.facility_amount ||
    raw['Facility Total'] ||
    raw.FAC_AMT ||
    raw.facility_total
  const nonFacAmountRaw =
    raw.non_facility_amount ||
    raw['Non-Facility Total'] ||
    raw['Non-facility Total'] ||
    raw.NON_FAC_AMT ||
    raw.non_facility_total

  let facilityAmount =
    facAmountRaw !== undefined && facAmountRaw !== ''
      ? Number(facAmountRaw)
      : null
  let nonFacilityAmount =
    nonFacAmountRaw !== undefined && nonFacAmountRaw !== ''
      ? Number(nonFacAmountRaw)
      : null

  // Derive from RVUs if explicit amounts weren't provided.
  if (facilityAmount == null || nonFacilityAmount == null) {
    const facTotalRvuRaw =
      raw['Facility Total RVU'] || raw.FAC_TOT_RVU || raw.tot_facility_rvu
    const nonFacTotalRvuRaw =
      raw['Non-Facility Total RVU'] ||
      raw.NON_FAC_TOT_RVU ||
      raw.tot_non_facility_rvu
    if (facilityAmount == null && facTotalRvuRaw) {
      const n = Number(facTotalRvuRaw)
      if (Number.isFinite(n)) facilityAmount = round2(n * conversionFactor)
    }
    if (nonFacilityAmount == null && nonFacTotalRvuRaw) {
      const n = Number(nonFacTotalRvuRaw)
      if (Number.isFinite(n)) nonFacilityAmount = round2(n * conversionFactor)
    }
  }

  const allowedAmount = nonFacilityAmount ?? facilityAmount ?? null

  return {
    cpt_code: code,
    description,
    work_rvu: Number.isFinite(workRvu as number) ? (workRvu as number) : null,
    facility_amount: toFiniteOrNull(facilityAmount),
    non_facility_amount: toFiniteOrNull(nonFacilityAmount),
    allowed_amount: toFiniteOrNull(allowedAmount),
    locality: NATIONAL_LOCALITY
  }
}

function mapPtpRow(raw: Record<string, string>): {
  code_1: string
  code_2: string
  edit_type: number
} | null {
  const code1 = (
    raw['Column 1'] ||
    raw.Column_1 ||
    raw.column_1 ||
    raw.code_1 ||
    raw.ColumnOne ||
    ''
  )
    .trim()
    .toUpperCase()
  const code2 = (
    raw['Column 2'] ||
    raw.Column_2 ||
    raw.column_2 ||
    raw.code_2 ||
    raw.ColumnTwo ||
    ''
  )
    .trim()
    .toUpperCase()
  if (!code1 || !code2) return null

  const indicatorRaw =
    raw['Modifier Indicator'] ||
    raw.Modifier_Indicator ||
    raw.modifier_indicator ||
    raw.PTP_Modifier_Indicator ||
    raw.edit_type ||
    '1'
  const editType = Number(String(indicatorRaw).trim())
  return {
    code_1: code1,
    code_2: code2,
    edit_type: Number.isFinite(editType) ? editType : 1
  }
}

function mapMueRow(raw: Record<string, string>): {
  cpt_code: string
  max_units: number
} | null {
  const code = (
    raw.HCPCS ||
    raw.hcpcs ||
    raw['HCPCS Code'] ||
    raw.CPT ||
    raw.cpt_code ||
    ''
  )
    .trim()
    .toUpperCase()
  if (!code) return null
  const limitRaw =
    raw['Practitioner Services MUE Values'] ||
    raw['MUE Value'] ||
    raw['Outpatient Hospital Services MUE Values'] ||
    raw.mue_value ||
    raw.max_units ||
    ''
  const n = Number(String(limitRaw).trim())
  if (!Number.isFinite(n)) return null
  return { cpt_code: code, max_units: n }
}

function toFiniteOrNull(n: number | null): number | null {
  if (n == null) return null
  return Number.isFinite(n) ? round2(n) : null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

async function upsertInBatches<T>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  conflictColumns: string
): Promise<void> {
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: conflictColumns })
    if (error) {
      throw new Error(`${table} upsert failed at offset ${i}: ${error.message}`)
    }
    inserted += chunk.length
    process.stdout.write(`    upserted ${inserted}/${rows.length}\r`)
  }
  process.stdout.write(`    upserted ${inserted}/${rows.length}\n`)
}

// ─── Ingestion steps ──────────────────────────────────────────────────────────

async function ingestPfs(supabase: SupabaseClient, source: string): Promise<number> {
  console.log('\n[PFS] Ingesting Medicare Physician Fee Schedule')
  const conversionFactor = Number(
    process.env.PFS_CONVERSION_FACTOR || CMS_CONVERSION_FACTOR_2024
  )

  const text = await loadSourceText(source)
  // Try JSON first (data.cms.gov API), fall back to CSV.
  let raw: Record<string, string>[]
  const trimmed = text.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed)
    const arr = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.results ?? []
    raw = arr.map((o: Record<string, unknown>) => {
      const coerced: Record<string, string> = {}
      for (const [k, v] of Object.entries(o)) coerced[k] = String(v ?? '')
      return coerced
    })
  } else {
    raw = parseCsv(text)
  }

  const mapped = raw
    .map((r) => mapPfsRow(r, conversionFactor))
    .filter((r): r is NonNullable<ReturnType<typeof mapPfsRow>> => r !== null)

  console.log(`  parsed ${raw.length} rows → ${mapped.length} mappable PFS entries`)
  if (mapped.length === 0) {
    console.log('  skipping upsert (no rows)')
    return 0
  }

  await upsertInBatches(supabase, 'pfs_fee_schedule', mapped, 'cpt_code,locality')
  return mapped.length
}

async function ingestPtp(supabase: SupabaseClient, source: string): Promise<number> {
  console.log('\n[NCCI-PTP] Ingesting Procedure-to-Procedure edits')
  const text = await loadSourceText(source)
  const raw = parseCsv(text)
  const mapped = raw
    .map(mapPtpRow)
    .filter((r): r is NonNullable<ReturnType<typeof mapPtpRow>> => r !== null)

  console.log(`  parsed ${raw.length} rows → ${mapped.length} PTP edits`)
  if (mapped.length === 0) {
    console.log('  skipping upsert (no rows)')
    return 0
  }

  await upsertInBatches(supabase, 'ncci_ptp_edits', mapped, 'code_1,code_2')
  return mapped.length
}

async function ingestMue(supabase: SupabaseClient, source: string): Promise<number> {
  console.log('\n[NCCI-MUE] Ingesting Medically Unlikely Edit limits')
  const text = await loadSourceText(source)
  const raw = parseCsv(text)
  const mapped = raw
    .map(mapMueRow)
    .filter((r): r is NonNullable<ReturnType<typeof mapMueRow>> => r !== null)

  console.log(`  parsed ${raw.length} rows → ${mapped.length} MUE entries`)
  if (mapped.length === 0) {
    console.log('  skipping upsert (no rows)')
    return 0
  }

  await upsertInBatches(supabase, 'ncci_mue_edits', mapped, 'cpt_code')
  return mapped.length
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const pfsSrc = args.pfs || DEFAULT_SOURCES.pfs
  const ptpSrc = args['ncci-ptp'] || DEFAULT_SOURCES.ncciPtp
  const mueSrc = args['ncci-mue'] || DEFAULT_SOURCES.ncciMue

  console.log('CMS data ingestion starting')
  console.log(`  PFS source:      ${pfsSrc}`)
  console.log(`  NCCI PTP source: ${ptpSrc}`)
  console.log(`  NCCI MUE source: ${mueSrc}`)

  const results: Record<string, number> = {}

  try {
    results.pfs = await ingestPfs(supabase, pfsSrc)
  } catch (err) {
    console.error('PFS ingestion failed:', err instanceof Error ? err.message : err)
  }

  try {
    results.ncci_ptp = await ingestPtp(supabase, ptpSrc)
  } catch (err) {
    console.error('NCCI PTP ingestion failed:', err instanceof Error ? err.message : err)
  }

  try {
    results.ncci_mue = await ingestMue(supabase, mueSrc)
  } catch (err) {
    console.error('NCCI MUE ingestion failed:', err instanceof Error ? err.message : err)
  }

  console.log('\n─── Summary ──────────────────────────────────────────')
  console.log(`  pfs_fee_schedule rows:  ${results.pfs ?? 0}`)
  console.log(`  ncci_ptp_edits rows:    ${results.ncci_ptp ?? 0}`)
  console.log(`  ncci_mue_edits rows:    ${results.ncci_mue ?? 0}`)

  const anyFailed =
    !results.pfs || !results.ncci_ptp || !results.ncci_mue
  if (anyFailed) {
    console.log(
      '\nOne or more tables received 0 rows. If the default CMS URLs returned an HTML landing page (not the CSV),\n' +
        'download the file manually from CMS and re-run with --pfs=<path>, --ncci-ptp=<path>, --ncci-mue=<path>.\n' +
        'See README-DATA-SETUP.md.'
    )
    process.exit(anyFailed ? 1 : 0)
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
