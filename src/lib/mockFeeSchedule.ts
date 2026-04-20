import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

// CMS national locality. TODO: map patient ZIP → carrier/locality for
// geographically-adjusted PFS rates. For now every query uses '00'.
export const NATIONAL_LOCALITY = '00'

export interface FeeScheduleRow {
  cpt_code: string
  description: string | null
  work_rvu: number | null
  facility_amount: number | null
  non_facility_amount: number | null
  allowed_amount: number | null
  locality: string | null
}

export interface PtpEditRow {
  code_1: string
  code_2: string
  edit_type: string | number
}

export interface MueEditRow {
  cpt_code: string
  max_units: number
}

export function effectiveAllowedAmount(row: FeeScheduleRow | null | undefined): number {
  if (!row) return 0
  const primary =
    row.non_facility_amount ?? row.allowed_amount ?? row.facility_amount
  return primary != null ? Number(primary) || 0 : 0
}

/**
 * CMS PTP modifier indicator:
 *  0 → codes can never be billed together; modifier cannot override
 *  1 → modifier (59, X{E,S,P,U}) can override the bundling edit
 *  9 → edit deleted / not applicable
 * Legacy seed data stored 'PTP' as a string; treat that as indicator 1 for
 * backward compatibility.
 */
export function ptpAllowsModifier(editType: unknown): boolean {
  if (typeof editType === 'number') return editType === 1
  if (typeof editType === 'string') {
    const trimmed = editType.trim()
    const n = Number(trimmed)
    if (Number.isFinite(n)) return n === 1
    return true
  }
  return true
}

async function defaultClient(): Promise<SupabaseClient> {
  return (await createServerSupabase()) as unknown as SupabaseClient
}

function normalize(code: string): string {
  return code.trim().toUpperCase()
}

// ─── Public per-CPT API ───────────────────────────────────────────────────────

export async function getFeeScheduleRate(cptCode: string): Promise<number | null> {
  const supabase = await defaultClient()
  const { data, error } = await supabase
    .from('pfs_fee_schedule')
    .select('allowed_amount, non_facility_amount, facility_amount')
    .eq('cpt_code', normalize(cptCode))
    .eq('locality', NATIONAL_LOCALITY)
    .maybeSingle()

  if (error || !data) return null
  return effectiveAllowedAmount(data as FeeScheduleRow) || null
}

export async function getMUELimit(cptCode: string): Promise<number | null> {
  const supabase = await defaultClient()
  const { data, error } = await supabase
    .from('ncci_mue_edits')
    .select('max_units')
    .eq('cpt_code', normalize(cptCode))
    .maybeSingle()

  if (error || !data) return null
  const n = Number(data.max_units)
  return Number.isFinite(n) ? n : null
}

export async function getPTPEdits(
  cptCode: string
): Promise<Array<{ code2: string; editType: number }>> {
  const supabase = await defaultClient()
  const code = normalize(cptCode)
  const { data, error } = await supabase
    .from('ncci_ptp_edits')
    .select('code_1, code_2, edit_type')
    .or(`code_1.eq.${code},code_2.eq.${code}`)

  if (error || !data) return []
  return (data as PtpEditRow[]).map((row) => {
    const c1 = normalize(row.code_1)
    const c2 = normalize(row.code_2)
    const code2 = c1 === code ? c2 : c1
    const n = Number(row.edit_type)
    const editType = Number.isFinite(n) ? n : ptpAllowsModifier(row.edit_type) ? 1 : 0
    return { code2, editType }
  })
}

// ─── Batch API (used by runAudit for efficiency) ──────────────────────────────

export async function batchFeeSchedule(
  supabase: SupabaseClient,
  codes: string[]
): Promise<Map<string, FeeScheduleRow>> {
  const map = new Map<string, FeeScheduleRow>()
  if (codes.length === 0) return map

  const normalized = Array.from(new Set(codes.map(normalize)))
  const { data, error } = await supabase
    .from('pfs_fee_schedule')
    .select(
      'cpt_code, description, work_rvu, facility_amount, non_facility_amount, allowed_amount, locality'
    )
    .in('cpt_code', normalized)
    .eq('locality', NATIONAL_LOCALITY)

  if (error) throw new Error(`Fee schedule lookup failed: ${error.message}`)
  for (const row of (data ?? []) as FeeScheduleRow[]) {
    map.set(normalize(row.cpt_code), row)
  }
  return map
}

export async function batchPtpEdits(
  supabase: SupabaseClient,
  codes: string[]
): Promise<PtpEditRow[]> {
  if (codes.length === 0) return []
  const normalized = Array.from(new Set(codes.map(normalize)))
  const { data, error } = await supabase
    .from('ncci_ptp_edits')
    .select('code_1, code_2, edit_type')
    .or(
      `code_1.in.(${normalized.join(',')}),code_2.in.(${normalized.join(',')})`
    )

  if (error) throw new Error(`PTP edits lookup failed: ${error.message}`)
  return (data ?? []) as PtpEditRow[]
}

export async function batchMueEdits(
  supabase: SupabaseClient,
  codes: string[]
): Promise<Map<string, MueEditRow>> {
  const map = new Map<string, MueEditRow>()
  if (codes.length === 0) return map

  const normalized = Array.from(new Set(codes.map(normalize)))
  const { data, error } = await supabase
    .from('ncci_mue_edits')
    .select('cpt_code, max_units')
    .in('cpt_code', normalized)

  if (error) throw new Error(`MUE edits lookup failed: ${error.message}`)
  for (const row of (data ?? []) as MueEditRow[]) {
    map.set(normalize(row.cpt_code), row)
  }
  return map
}
