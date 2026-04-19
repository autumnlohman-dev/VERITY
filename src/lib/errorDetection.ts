import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export interface LineItem {
  cpt_code: string
  description?: string
  date_of_service: string
  units: number
  billed_amount: number
  modifiers?: string[]
}

export type ErrorType = 'overcharge' | 'unbundling' | 'duplicate' | 'mue' | 'coverage'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface BillingError {
  cpt_code: string
  description: string
  error_type: ErrorType
  billed_amount: number
  expected_amount: number
  confidence: Confidence
  explanation: string
  rule_violated: string
}

export type InsuranceType =
  | 'commercial'
  | 'medicare'
  | 'medicaid'
  | 'self-pay'
  | 'tricare'
  | 'other'

interface FeeScheduleRow {
  cpt_code: string
  allowed_amount: number
  locality: string | null
}

interface PtpEditRow {
  code_1: string
  code_2: string
  edit_type: string
}

interface MueEditRow {
  cpt_code: string
  max_units: number
}

const OVERCHARGE_THRESHOLD = 1.2
const UNBUNDLING_OVERRIDE_MODIFIERS = new Set(['59', 'XE', 'XS', 'XP', 'XU'])
const DUPLICATE_OVERRIDE_MODIFIERS = new Set(['59', '76', '77', '91', 'XE', 'XS', 'XP', 'XU'])

const PREVENTIVE_CPT_CODES = new Set([
  '99381', '99382', '99383', '99384', '99385', '99386', '99387',
  '99391', '99392', '99393', '99394', '99395', '99396', '99397',
  'G0438', 'G0439'
])

const EMERGENCY_CPT_CODES = new Set(['99281', '99282', '99283', '99284', '99285'])

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function hasAnyModifier(item: LineItem, modifiers: Set<string>): boolean {
  if (!item.modifiers || item.modifiers.length === 0) return false
  return item.modifiers.some((m) => modifiers.has(normalizeCode(m)))
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

async function loadFeeSchedule(
  supabase: SupabaseClient,
  codes: string[]
): Promise<Map<string, FeeScheduleRow>> {
  const map = new Map<string, FeeScheduleRow>()
  if (codes.length === 0) return map

  const { data, error } = await supabase
    .from('pfs_fee_schedule')
    .select('cpt_code, allowed_amount, locality')
    .in('cpt_code', codes)

  if (error) throw new Error(`Fee schedule lookup failed: ${error.message}`)
  for (const row of (data ?? []) as FeeScheduleRow[]) {
    map.set(normalizeCode(row.cpt_code), row)
  }
  return map
}

async function loadPtpEdits(
  supabase: SupabaseClient,
  codes: string[]
): Promise<PtpEditRow[]> {
  if (codes.length === 0) return []

  const { data, error } = await supabase
    .from('ncci_ptp_edits')
    .select('code_1, code_2, edit_type')
    .or(`code_1.in.(${codes.join(',')}),code_2.in.(${codes.join(',')})`)

  if (error) throw new Error(`PTP edits lookup failed: ${error.message}`)
  return (data ?? []) as PtpEditRow[]
}

async function loadMueEdits(
  supabase: SupabaseClient,
  codes: string[]
): Promise<Map<string, MueEditRow>> {
  const map = new Map<string, MueEditRow>()
  if (codes.length === 0) return map

  const { data, error } = await supabase
    .from('ncci_mue_edits')
    .select('cpt_code, max_units')
    .in('cpt_code', codes)

  if (error) throw new Error(`MUE edits lookup failed: ${error.message}`)
  for (const row of (data ?? []) as MueEditRow[]) {
    map.set(normalizeCode(row.cpt_code), row)
  }
  return map
}

function checkOvercharge(
  items: LineItem[],
  feeSchedule: Map<string, FeeScheduleRow>
): BillingError[] {
  const errors: BillingError[] = []
  for (const item of items) {
    const code = normalizeCode(item.cpt_code)
    const row = feeSchedule.get(code)
    if (!row) continue

    const expectedTotal = Number(row.allowed_amount) * Math.max(1, item.units)
    const billed = Number(item.billed_amount)
    if (expectedTotal <= 0) continue

    const ratio = billed / expectedTotal
    if (ratio <= OVERCHARGE_THRESHOLD) continue

    const overcharge = billed - expectedTotal
    const confidence: Confidence =
      ratio >= 2 ? 'HIGH' : ratio >= 1.5 ? 'MEDIUM' : 'LOW'

    errors.push({
      cpt_code: code,
      description: item.description ?? '',
      error_type: 'overcharge',
      billed_amount: billed,
      expected_amount: expectedTotal,
      confidence,
      explanation: `Provider billed $${billed.toFixed(2)} for CPT ${code}, which is ${((ratio - 1) * 100).toFixed(0)}% above the Medicare Physician Fee Schedule allowed amount of $${expectedTotal.toFixed(2)}. Overcharge of $${overcharge.toFixed(2)}.`,
      rule_violated:
        'Medicare Physician Fee Schedule (42 CFR § 414) — charges materially above the PFS allowed amount for the same CPT code and locality.'
    })
  }
  return errors
}

function checkUnbundling(
  items: LineItem[],
  ptpEdits: PtpEditRow[],
  feeSchedule: Map<string, FeeScheduleRow>
): BillingError[] {
  const errors: BillingError[] = []
  if (ptpEdits.length === 0) return errors

  const byDate = new Map<string, LineItem[]>()
  for (const item of items) {
    const list = byDate.get(item.date_of_service) ?? []
    list.push(item)
    byDate.set(item.date_of_service, list)
  }

  const seenPairs = new Set<string>()

  for (const [date, dateItems] of byDate) {
    const codeToItem = new Map<string, LineItem>()
    for (const item of dateItems) {
      codeToItem.set(normalizeCode(item.cpt_code), item)
    }

    for (const edit of ptpEdits) {
      const col1 = normalizeCode(edit.code_1)
      const col2 = normalizeCode(edit.code_2)
      const item1 = codeToItem.get(col1)
      const item2 = codeToItem.get(col2)
      if (!item1 || !item2) continue

      const key = `${date}|${pairKey(col1, col2)}`
      if (seenPairs.has(key)) continue
      seenPairs.add(key)

      const hasOverride =
        hasAnyModifier(item1, UNBUNDLING_OVERRIDE_MODIFIERS) ||
        hasAnyModifier(item2, UNBUNDLING_OVERRIDE_MODIFIERS)
      if (hasOverride) continue

      const bundledItem = item2
      const expected = feeSchedule.get(col1)?.allowed_amount ?? 0
      const billedPair = Number(item1.billed_amount) + Number(item2.billed_amount)

      errors.push({
        cpt_code: col2,
        description: bundledItem.description ?? '',
        error_type: 'unbundling',
        billed_amount: Number(bundledItem.billed_amount),
        expected_amount: Number(expected),
        confidence: 'HIGH',
        explanation: `CPT ${col2} was billed separately on ${date} alongside CPT ${col1}. NCCI ${edit.edit_type} edits bundle these codes: the column 2 code is a component of the column 1 code and is not separately reportable. Combined charges of $${billedPair.toFixed(2)} should collapse to the single primary procedure.`,
        rule_violated:
          'NCCI Procedure-to-Procedure (PTP) edits — CMS National Correct Coding Initiative Policy Manual, Chapter I.'
      })
    }
  }
  return errors
}

function checkDuplicates(items: LineItem[]): BillingError[] {
  const errors: BillingError[] = []
  const groups = new Map<string, LineItem[]>()

  for (const item of items) {
    const code = normalizeCode(item.cpt_code)
    const key = `${code}|${item.date_of_service}`
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const allJustified = group.every((g) =>
      hasAnyModifier(g, DUPLICATE_OVERRIDE_MODIFIERS)
    )
    if (allJustified) continue

    const [code, date] = key.split('|')
    const duplicates = group.slice(1)
    const duplicateBilled = duplicates.reduce(
      (sum, g) => sum + Number(g.billed_amount),
      0
    )
    const firstBilled = Number(group[0].billed_amount)

    errors.push({
      cpt_code: code,
      description: group[0].description ?? '',
      error_type: 'duplicate',
      billed_amount: duplicateBilled + firstBilled,
      expected_amount: firstBilled,
      confidence: 'HIGH',
      explanation: `CPT ${code} was billed ${group.length} times on ${date} without a distinct-procedural-service modifier (59, 76, 77, 91, or X{E,S,P,U}). Duplicate charges of $${duplicateBilled.toFixed(2)} appear to be double billing.`,
      rule_violated:
        'CMS Claims Processing Manual (Pub. 100-04), Ch. 23 — duplicate line items on the same date of service without an appropriate modifier are not separately reimbursable.'
    })
  }
  return errors
}

function checkMue(
  items: LineItem[],
  mueMap: Map<string, MueEditRow>,
  feeSchedule: Map<string, FeeScheduleRow>
): BillingError[] {
  const errors: BillingError[] = []
  for (const item of items) {
    const code = normalizeCode(item.cpt_code)
    const mue = mueMap.get(code)
    if (!mue) continue
    if (item.units <= mue.max_units) continue

    const unitPrice = Number(feeSchedule.get(code)?.allowed_amount ?? 0)
    const expected = unitPrice * mue.max_units
    const excessUnits = item.units - mue.max_units

    errors.push({
      cpt_code: code,
      description: item.description ?? '',
      error_type: 'mue',
      billed_amount: Number(item.billed_amount),
      expected_amount: expected,
      confidence: 'HIGH',
      explanation: `Provider billed ${item.units} units of CPT ${code}, but the CMS Medically Unlikely Edit caps this code at ${mue.max_units} unit(s) per day per beneficiary. ${excessUnits} unit(s) exceed the MUE limit.`,
      rule_violated:
        'CMS Medically Unlikely Edits (MUE) — NCCI Policy Manual, MUE adjudication indicator; units billed exceed the maximum reasonable per-day limit.'
    })
  }
  return errors
}

function checkCoverage(
  items: LineItem[],
  insuranceType: InsuranceType
): BillingError[] {
  const errors: BillingError[] = []

  for (const item of items) {
    const code = normalizeCode(item.cpt_code)
    const billed = Number(item.billed_amount)

    if (
      PREVENTIVE_CPT_CODES.has(code) &&
      (insuranceType === 'commercial' || insuranceType === 'medicare')
    ) {
      errors.push({
        cpt_code: code,
        description: item.description ?? 'Preventive service',
        error_type: 'coverage',
        billed_amount: billed,
        expected_amount: 0,
        confidence: 'HIGH',
        explanation: `Preventive service CPT ${code} was billed $${billed.toFixed(2)} to the patient. Under the ACA and Medicare Part B preventive benefits, this service must be covered without cost sharing when delivered in-network.`,
        rule_violated:
          'Affordable Care Act § 2713 (42 U.S.C. § 300gg-13) and 42 CFR § 410.152 — no cost sharing for preventive services.'
      })
      continue
    }

    if (EMERGENCY_CPT_CODES.has(code) && insuranceType === 'commercial') {
      errors.push({
        cpt_code: code,
        description: item.description ?? 'Emergency department visit',
        error_type: 'coverage',
        billed_amount: billed,
        expected_amount: billed,
        confidence: 'MEDIUM',
        explanation: `Emergency department CPT ${code} must be adjudicated at in-network cost sharing regardless of provider network status. Verify the patient was not balance-billed above the in-network rate.`,
        rule_violated:
          'No Surprises Act (42 U.S.C. § 300gg-111) — emergency services must be covered at in-network cost sharing without balance billing.'
      })
      continue
    }

    if (insuranceType === 'medicare' && code.startsWith('S')) {
      errors.push({
        cpt_code: code,
        description: item.description ?? '',
        error_type: 'coverage',
        billed_amount: billed,
        expected_amount: 0,
        confidence: 'MEDIUM',
        explanation: `HCPCS Level II S-code ${code} is a temporary national code used by private payers. Medicare does not recognize S-codes and the provider should have billed an appropriate CPT/HCPCS code recognized by Medicare.`,
        rule_violated:
          'Medicare Claims Processing Manual (Pub. 100-04), Ch. 23, § 20.7 — S-codes are not payable under Medicare.'
      })
    }
  }

  return errors
}

export interface RunAuditOptions {
  supabase?: SupabaseClient
}

export async function runAudit(
  lineItems: LineItem[],
  insuranceType: InsuranceType,
  options: RunAuditOptions = {}
): Promise<BillingError[]> {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return []

  const supabase = options.supabase ?? createClient()
  const uniqueCodes = Array.from(
    new Set(lineItems.map((li) => normalizeCode(li.cpt_code)))
  )

  const [feeSchedule, ptpEdits, mueMap] = await Promise.all([
    loadFeeSchedule(supabase, uniqueCodes),
    loadPtpEdits(supabase, uniqueCodes),
    loadMueEdits(supabase, uniqueCodes)
  ])

  const normalized: LineItem[] = lineItems.map((li) => ({
    ...li,
    cpt_code: normalizeCode(li.cpt_code),
    units: Number(li.units) || 1,
    billed_amount: Number(li.billed_amount) || 0,
    modifiers: (li.modifiers ?? []).map(normalizeCode)
  }))

  return [
    ...checkOvercharge(normalized, feeSchedule),
    ...checkUnbundling(normalized, ptpEdits, feeSchedule),
    ...checkDuplicates(normalized),
    ...checkMue(normalized, mueMap, feeSchedule),
    ...checkCoverage(normalized, insuranceType)
  ]
}
