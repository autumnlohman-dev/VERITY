import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import {
  batchFeeSchedule,
  batchMueEdits,
  batchPtpEdits,
  effectiveAllowedAmount,
  ptpAllowsModifier,
  type FeeScheduleRow,
  type MueEditRow,
  type PtpEditRow
} from '@/lib/mockFeeSchedule'
import { EM_CPT_CODES } from '@/lib/emReview'

export interface LineItem {
  cpt_code: string
  description?: string
  date_of_service: string
  units: number
  billed_amount: number
  modifiers?: string[]
  /** Encounter / claim / visit id this charge appears under, when the bill groups
   *  charges by encounter. Scopes duplicate detection so the same code recurring
   *  in different encounters isn't flagged as a duplicate. */
  encounter?: string
  /** Set by runFullAudit when this line matched a line the patient's EOB
   *  adjudicated. The payer has already repriced the line and set the patient's
   *  share: CMS benchmark overcharges are suppressed for it, and NCCI/MUE
   *  findings demote to informational coding observations. */
  eobAdjudicated?: boolean
}

export type ErrorType =
  | 'overcharge'
  | 'unbundling'
  | 'duplicate'
  | 'mue'
  | 'coverage'
  | 'patient_disputed'
  | 'rate_unavailable'
  | 'reference_data_missing'
  // Informational only: a coding pattern (NCCI pair / MUE units) the payer's
  // own adjudication already accepted. Never in letters, never in dollar
  // totals — kept visible in the audit UI pending expert policy review.
  | 'coding_observation'
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
  /** Set when the EOB adjudicated the claim in full ("You Owe" total): this
   *  finding stays visible as a justification request but contributes $0 to
   *  potential savings and to a letter's demanded correction. */
  justification_only?: boolean
}

export type InsuranceType =
  | 'commercial'
  | 'medicare'
  | 'medicaid'
  | 'self-pay'
  | 'tricare'
  | 'other'

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

function checkOvercharge(
  items: LineItem[],
  feeSchedule: Map<string, FeeScheduleRow>
): BillingError[] {
  const errors: BillingError[] = []
  for (const item of items) {
    const code = normalizeCode(item.cpt_code)
    // E&M visit codes (99201–99215, 99281–99285) are not flagged on a blunt PFS
    // ratio. Level/complexity appropriateness is assessed by the dedicated E&M
    // review flow (emReview); and emergency-department FACILITY levels share
    // these codes but are paid under OPPS, not the professional fee schedule, so
    // a PFS comparison would manufacture large false overcharges.
    if (EM_CPT_CODES.has(code)) continue
    // EOB-adjudicated lines: the plan's allowed amount is the pricing reference,
    // not the CMS benchmark — the payer already repriced the line and the
    // patient's share is set. No overcharge finding, no demanded adjustment.
    if (item.eobAdjudicated) continue
    const row = feeSchedule.get(code)
    if (!row) continue

    const unitAllowed = effectiveAllowedAmount(row)
    const expectedTotal = unitAllowed * Math.max(1, item.units)
    const billed = Number(item.billed_amount)
    if (expectedTotal <= 0) continue

    const ratio = billed / expectedTotal
    if (ratio <= OVERCHARGE_THRESHOLD) continue

    const overcharge = billed - expectedTotal
    const confidence: Confidence =
      ratio >= 2 ? 'HIGH' : ratio >= 1.5 ? 'MEDIUM' : 'LOW'

    // Cite the schedule that actually priced the code. Lab codes resolve via the
    // CLFS fallback and must NOT be cited as the Physician Fee Schedule.
    const isClfs = row.schedule === 'CLFS'
    const scheduleName = isClfs
      ? 'Medicare Clinical Laboratory Fee Schedule'
      : 'Medicare Physician Fee Schedule'
    const ruleViolated = isClfs
      ? 'Medicare Clinical Laboratory Fee Schedule (Social Security Act § 1833(h), 42 U.S.C. § 1395l(h); 42 CFR Part 414, Subpart G), charges materially above the CLFS allowed amount for the same lab HCPCS/CPT code.'
      : 'Medicare Physician Fee Schedule (42 CFR § 414), charges materially above the PFS allowed amount for the same CPT code and locality.'

    // Benchmark findings are a request for justification, never an owed
    // amount: a CMS rate is a reference point, not this patient's contract.
    errors.push({
      cpt_code: code,
      description: item.description ?? row.description ?? '',
      error_type: 'overcharge',
      billed_amount: billed,
      expected_amount: expectedTotal,
      confidence,
      explanation: `Provider billed $${billed.toFixed(2)} for CPT ${code}, which is ${((ratio - 1) * 100).toFixed(0)}% above the ${scheduleName} benchmark of $${expectedTotal.toFixed(2)} (a difference of $${overcharge.toFixed(2)}). This benchmark comparison supports requesting that the provider justify the charge or reprice it; it does not by itself establish an amount owed.`,
      rule_violated: ruleViolated
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

      const modifierOverridable = ptpAllowsModifier(edit.edit_type)
      const hasOverride =
        hasAnyModifier(item1, UNBUNDLING_OVERRIDE_MODIFIERS) ||
        hasAnyModifier(item2, UNBUNDLING_OVERRIDE_MODIFIERS)
      if (modifierOverridable && hasOverride) continue

      const bundledItem = item2
      const expected = effectiveAllowedAmount(feeSchedule.get(col1))
      const billedPair = Number(item1.billed_amount) + Number(item2.billed_amount)

      // When the payer's own adjudication accepted BOTH lines of the pair,
      // asserting unbundling contradicts the EOB — the claim was processed
      // through the payer's edits and the patient's share is set. Demote to an
      // informational coding observation (visible in the audit UI, excluded
      // from letters and dollar totals) pending expert policy review.
      if (item1.eobAdjudicated && item2.eobAdjudicated) {
        errors.push({
          cpt_code: col2,
          description: bundledItem.description ?? '',
          error_type: 'coding_observation',
          billed_amount: Number(bundledItem.billed_amount),
          expected_amount: Number(bundledItem.billed_amount),
          confidence: 'LOW',
          explanation: `Coding observation: NCCI edits bundle CPT ${col2} with CPT ${col1}, but your insurer adjudicated both lines separately on this claim, so this does not affect what you owe. Noted for reference only.`,
          rule_violated:
            'NCCI Procedure-to-Procedure (PTP) edits, informational; superseded by the payer\'s adjudication of this claim.'
        })
        continue
      }

      const overrideNote = modifierOverridable
        ? 'A modifier (59, XE, XS, XP, or XU) can justify separate reporting, but none was applied.'
        : 'This edit has modifier indicator 0, no modifier may override it; the codes cannot be billed separately.'

      errors.push({
        cpt_code: col2,
        description: bundledItem.description ?? '',
        error_type: 'unbundling',
        billed_amount: Number(bundledItem.billed_amount),
        expected_amount: Number(expected),
        confidence: 'HIGH',
        explanation: `CPT ${col2} was billed separately on ${date} alongside CPT ${col1}. NCCI PTP edits bundle these codes: the column 2 code is a component of the column 1 code and is not separately reportable. ${overrideNote} Combined charges of $${billedPair.toFixed(2)} warrant justification for separate reporting or collapse to the single primary procedure.`,
        rule_violated:
          'NCCI Procedure-to-Procedure (PTP) edits, CMS National Correct Coding Initiative Policy Manual, Chapter I.'
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
    // Blank-code lines (e.g. an uncoded "OFFICE VISIT") can't be reliably
    // identified as the same service, so never group them together as duplicates.
    if (!code) continue
    // Scope duplicate detection within an encounter/claim. On a multi-encounter
    // statement the same code legitimately recurs once per encounter — three
    // office visits across three Encounter Numbers are distinct visits, not
    // duplicates — so two lines are duplicates only when they ALSO share the same
    // encounter id. When the bill has no encounter grouping, encounter is '' for
    // every line and this reduces to the prior same-code + same-date behavior.
    const encounter = item.encounter?.trim() ?? ''
    const key = `${code}|${item.date_of_service}|${encounter}`
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
        'CMS Claims Processing Manual (Pub. 100-04), Ch. 23, duplicate line items on the same date of service without an appropriate modifier are not separately reimbursable.'
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

    const unitPrice = effectiveAllowedAmount(feeSchedule.get(code))
    const expected = unitPrice * mue.max_units
    const excessUnits = item.units - mue.max_units

    // Payer adjudicated this line with these units — the MUE flag contradicts
    // the adjudication. Demote to an informational coding observation.
    if (item.eobAdjudicated) {
      errors.push({
        cpt_code: code,
        description: item.description ?? '',
        error_type: 'coding_observation',
        billed_amount: Number(item.billed_amount),
        expected_amount: Number(item.billed_amount),
        confidence: 'LOW',
        explanation: `Coding observation: ${item.units} units of CPT ${code} exceed the CMS Medically Unlikely Edit reference limit of ${mue.max_units}, but your insurer adjudicated this line as billed, so this does not affect what you owe. Noted for reference only.`,
        rule_violated:
          'CMS Medically Unlikely Edits (MUE), informational; superseded by the payer\'s adjudication of this claim.'
      })
      continue
    }

    errors.push({
      cpt_code: code,
      description: item.description ?? '',
      error_type: 'mue',
      billed_amount: Number(item.billed_amount),
      expected_amount: expected,
      confidence: 'HIGH',
      explanation: `Provider billed ${item.units} units of CPT ${code}, but the CMS Medically Unlikely Edit caps this code at ${mue.max_units} unit(s) per day per beneficiary. ${excessUnits} unit(s) exceed the MUE limit.`,
      rule_violated:
        'CMS Medically Unlikely Edits (MUE), NCCI Policy Manual, MUE adjudication indicator; units billed exceed the maximum reasonable per-day limit.'
    })
  }
  return errors
}

function checkRateUnavailable(
  items: LineItem[],
  feeSchedule: Map<string, FeeScheduleRow>
): BillingError[] {
  const errors: BillingError[] = []
  for (const item of items) {
    const code = normalizeCode(item.cpt_code)
    // An EOB-adjudicated line needs no CMS rate — the payer priced it.
    if (item.eobAdjudicated) continue
    const row = feeSchedule.get(code)
    if (row && effectiveAllowedAmount(row) > 0) continue

    const billed = Number(item.billed_amount) || 0
    // A line with NO code at all is a different situation from an unmatched
    // code: the document (often a summary statement or portal screenshot)
    // doesn't show billing codes, and the fix is to request an itemized bill.
    const uncoded = code.length === 0
    errors.push({
      cpt_code: code,
      description: item.description ?? '',
      error_type: 'rate_unavailable',
      billed_amount: billed,
      expected_amount: 0,
      confidence: 'LOW',
      explanation: uncoded
        ? `The line "${item.description || 'service'}" billed at $${billed.toFixed(2)} shows no CPT/HCPCS procedure code on the uploaded document, so it cannot be priced against CMS fee schedules. Request a fully itemized bill from the provider, they are required to supply one, and re-run the audit with it.`
        : `No published Medicare Physician Fee Schedule or Clinical Lab Fee Schedule rate was found for "${code}" billed at $${billed.toFixed(2)}. This is often a facility/revenue code, a proprietary internal charge code, or an OCR misread, it cannot be priced automatically and should be reviewed manually against the provider's chargemaster or explanation of benefits.`,
      rule_violated: uncoded
        ? 'No procedure code on document, line-level pricing requires the CPT/HCPCS code from an itemized bill. Not an overcharge finding; request an itemized statement.'
        : 'Fee schedule match unavailable, code could not be priced against CMS PFS or CLFS. Not presumptively an overcharge, but requires manual review to verify the billed amount is reasonable.'
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
          'Affordable Care Act § 2713 (42 U.S.C. § 300gg-13) and 42 CFR § 410.152, no cost sharing for preventive services.'
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
          'No Surprises Act (42 U.S.C. § 300gg-111), emergency services must be covered at in-network cost sharing without balance billing.'
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
          'Medicare Claims Processing Manual (Pub. 100-04), Ch. 23, § 20.7, S-codes are not payable under Medicare.'
      })
    }
  }

  return errors
}

export interface RunAuditOptions {
  supabase?: SupabaseClient
}

// True when the PFS reference table returns no rows AT ALL to the audit's role
// (RLS misconfiguration, wrong project, or an empty load). A filtered all-miss
// on a particular bill's codes is NOT unreachable and must not trip the alarm.
async function referenceTablesUnreachable(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('pfs_fee_schedule').select('cpt_code').limit(1)
    if (error) return true
    return !data || data.length === 0
  } catch {
    return true
  }
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
    batchFeeSchedule(supabase, uniqueCodes),
    batchPtpEdits(supabase, uniqueCodes),
    batchMueEdits(supabase, uniqueCodes)
  ])

  const normalized: LineItem[] = lineItems.map((li) => ({
    ...li,
    cpt_code: normalizeCode(li.cpt_code),
    units: Number(li.units) || 1,
    billed_amount: Number(li.billed_amount) || 0,
    modifiers: (li.modifiers ?? []).map(normalizeCode)
  }))

  // Blank codes (uncoded "OFFICE VISIT" lines, summary statements, portal
  // screenshots) match nothing in any reference table BY DESIGN - a bill whose
  // lines carry no CPT/HCPCS codes must never trip the reference-data alarm.
  const pricableCodes = uniqueCodes.filter((c) => c.length > 0)

  let referenceDataEmpty = false
  if (
    pricableCodes.length > 0 &&
    feeSchedule.size === 0 &&
    ptpEdits.length === 0 &&
    mueMap.size === 0
  ) {
    // Code-independent reachability probe: only report "reference data missing"
    // when the table itself returns nothing to this role (RLS misconfiguration,
    // wrong project, or a genuinely empty load) - not when this particular
    // bill's codes simply matched no rows (dental/foreign/revenue codes).
    referenceDataEmpty = await referenceTablesUnreachable(supabase)
    if (!referenceDataEmpty) {
      console.warn(
        `runAudit: no reference rows matched any of ${pricableCodes.length} billed codes, but tables are reachable - treating as unpriceable codes, not missing reference data.`
      )
    }
  }

  const preamble: BillingError[] = []
  if (referenceDataEmpty) {
    const message = `runAudit: all reference tables returned empty for ${uniqueCodes.length} codes, likely missing reference data`
    console.error(message, { uniqueCodes })
    Sentry.captureMessage(message, {
      level: 'error',
      tags: { module: 'runAudit' },
      extra: { uniqueCodes },
    })
    preamble.push({
      cpt_code: '-',
      description: 'Audit reference data unavailable',
      error_type: 'reference_data_missing',
      billed_amount: 0,
      expected_amount: 0,
      confidence: 'HIGH',
      explanation:
        'The CMS fee schedule, NCCI edits, and MUE limits used to price your bill were all unavailable at the time of this audit. Line-level pricing could not be verified, and this case requires manual review before any dispute is filed.',
      rule_violated:
        'Internal reference data integrity check, runAudit detected empty PFS/CLFS, NCCI PTP, and NCCI MUE tables.',
    })
  }

  return [
    ...preamble,
    ...checkOvercharge(normalized, feeSchedule),
    ...checkUnbundling(normalized, ptpEdits, feeSchedule),
    ...checkDuplicates(normalized),
    ...checkMue(normalized, mueMap, feeSchedule),
    ...checkCoverage(normalized, insuranceType),
    ...checkRateUnavailable(normalized, feeSchedule)
  ]
}

// ─── One finding per line ──────────────────────────────────────────────────────
// A single CPT line must appear in at most ONE finding — 85025 flagged as
// overcharge + unbundling + balance billing triple-counts one charge. Precedence
// (strongest evidence wins): patient-reported dispute, then coding rules
// (unbundling / MUE / duplicate), then coverage rules, then the CMS benchmark
// note, then informational/manual-review flags. Blank-code lines dedupe by
// description so distinct uncoded lines are never collapsed together.
const ERROR_TYPE_PRECEDENCE: Record<ErrorType, number> = {
  patient_disputed: 0,
  unbundling: 1,
  mue: 1,
  duplicate: 1,
  coverage: 2,
  overcharge: 3,
  coding_observation: 4,
  rate_unavailable: 5,
  reference_data_missing: 6,
}

export function dedupeErrorsByLine(errors: BillingError[]): BillingError[] {
  const best = new Map<string, BillingError>()
  const secondary = new Map<string, Set<string>>()
  const order: string[] = []
  for (const e of errors) {
    const code = normalizeCode(e.cpt_code)
    const key = code ? `code:${code}` : `desc:${(e.description ?? '').trim().toLowerCase()}`
    const current = best.get(key)
    if (!current) {
      best.set(key, e)
      order.push(key)
      continue
    }
    const rank = ERROR_TYPE_PRECEDENCE[e.error_type] ?? 9
    const currentRank = ERROR_TYPE_PRECEDENCE[current.error_type] ?? 9
    // The losing finding is noted inside the kept one, never listed as its own
    // finding: one line = one finding, so counts and totals never inflate.
    const winner = rank < currentRank ? e : current
    const loser = rank < currentRank ? current : e
    if (rank < currentRank) best.set(key, e)
    if (loser.error_type !== winner.error_type) {
      if (!secondary.has(key)) secondary.set(key, new Set())
      secondary.get(key)!.add(loser.error_type)
    }
  }
  return order.map((k) => {
    const kept = best.get(k)!
    const extras = secondary.get(k)
    if (!extras || extras.size === 0) return kept
    const noted = [...extras].map((t) => t.replace(/_/g, ' ')).join(', ')
    return {
      ...kept,
      explanation: `${kept.explanation} (This line was also flagged for ${noted}; consolidated under the primary finding so it is not double-counted.)`,
    }
  })
}
