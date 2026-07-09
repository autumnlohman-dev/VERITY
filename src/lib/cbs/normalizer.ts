import type {
  CanonicalBillingSchema,
  CBSDiscrepancy,
  CBSLineItem,
  CBSTemporalFlag,
  EpisodeGroup,
  NormalizedCBSSet,
  TimelineEvent,
} from './schema'
import { normalizeDate } from './extractor'

const COLLECTION_NOTICE_PERIOD_DAYS = 30 // FDCPA § 1692g

// A charge to the patient this far above the EOB benchmark counts as balance
// billing (covers rounding / cents-level noise without firing on real ties).
const BALANCE_BILLING_TOLERANCE = 1.0
// Bill and EOB dollar amounts are considered the same line when within a cent.
const AMOUNT_MATCH_TOLERANCE = 0.01

function daysBetween(dateA: string, dateB: string): number {
  try {
    const a = new Date(dateA).getTime()
    const b = new Date(dateB).getTime()
    return Math.round((b - a) / (1000 * 60 * 60 * 24))
  } catch {
    return 0
  }
}

function daysUntil(dateStr: string): number {
  try {
    const target = new Date(dateStr).getTime()
    const now = Date.now()
    return Math.round((target - now) / (1000 * 60 * 60 * 24))
  } catch {
    return 999
  }
}

// ─── Episode grouping ─────────────────────────────────────────────────────────

function groupIntoEpisodes(docs: CanonicalBillingSchema[]): EpisodeGroup[] {
  const groups = new Map<string, EpisodeGroup>()

  for (const doc of docs) {
    const key = doc.serviceEpisodeId || doc.claimNumber || doc.dateOfService || doc.sourceDocumentId

    if (groups.has(key)) {
      groups.get(key)!.documents.push(doc.sourceDocumentId)
    } else {
      groups.set(key, {
        episodeId: key,
        documents: [doc.sourceDocumentId],
        dateOfService: doc.dateOfService,
        claimNumber: doc.claimNumber,
      })
    }
  }

  return Array.from(groups.values())
}

// ─── Bill ↔ EOB line matching ────────────────────────────────────────────────

function normCode(code: string | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

function descTokens(desc: string | undefined): Set<string> {
  return new Set(
    (desc ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  )
}

// Jaccard overlap of description tokens — a tiebreaker only, never a gate.
function descSimilarity(a: string | undefined, b: string | undefined): number {
  const sa = descTokens(a)
  const sb = descTokens(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let shared = 0
  for (const t of sa) if (sb.has(t)) shared++
  return shared / (sa.size + sb.size - shared)
}

function amountsMatch(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return false
  return Math.abs(a - b) <= AMOUNT_MATCH_TOLERANCE
}

// Exported for unit tests (cbsMatching.test.ts) — not part of the public API.
export function datesMatch(a: string | undefined, b: string | undefined): boolean {
  // Only a constraint when both sides carry a date; otherwise don't block.
  if (!a || !b) return true
  // Bill-side dates arrive verbatim from vision output (e.g. "03/14/2025")
  // while EOB-side dates are already ISO ("2025-03-14") — normalize both so
  // the amount+date pairing fallback isn't defeated by formatting.
  // normalizeDate returns its input unchanged when it can't parse, so this
  // degrades to raw equality for unparseable strings.
  return normalizeDate(a) === normalizeDate(b)
}

interface LinePair {
  billLine: CBSLineItem
  eobLine: CBSLineItem
}

interface MatchResult {
  pairs: LinePair[]
  unmatchedBill: CBSLineItem[]
  eobHasAnyCpt: boolean
}

// Match each bill line to at most one EOB line. Prefer CPT-code equality when —
// and only when — the EOB actually prints codes. Otherwise (the common case for
// commercial EOBs) fall back to amount_billed + service_date, breaking ties by
// service-description similarity. A missing code on the EOB is NOT a finding.
function matchBillToEOB(
  bill: CanonicalBillingSchema,
  eob: CanonicalBillingSchema
): MatchResult {
  const eobHasAnyCpt = eob.lineItems.some((l) => normCode(l.cptCode))
  const consumed = new Set<string>()
  const pairs: LinePair[] = []
  const unmatchedBill: CBSLineItem[] = []

  for (const billLine of bill.lineItems) {
    let match: CBSLineItem | undefined

    // 1) Code match — only meaningful if the EOB carries codes at all.
    if (eobHasAnyCpt && normCode(billLine.cptCode)) {
      match = eob.lineItems.find(
        (e) =>
          !consumed.has(e.lineItemId) &&
          normCode(e.cptCode) &&
          normCode(e.cptCode) === normCode(billLine.cptCode)
      )
    }

    // 2) Fallback — amount_billed + service_date, description as tiebreaker.
    if (!match) {
      const candidates = eob.lineItems.filter(
        (e) =>
          !consumed.has(e.lineItemId) &&
          amountsMatch(e.billedAmount, billLine.billedAmount) &&
          datesMatch(e.serviceDate, billLine.serviceDate)
      )
      if (candidates.length === 1) {
        match = candidates[0]
      } else if (candidates.length > 1) {
        match = candidates
          .map((e) => ({ e, sim: descSimilarity(e.description, billLine.description) }))
          .sort((x, y) => y.sim - x.sim)[0].e
      }
    }

    if (match) {
      consumed.add(match.lineItemId)
      pairs.push({ billLine, eobLine: match })
    } else {
      unmatchedBill.push(billLine)
    }
  }

  return { pairs, unmatchedBill, eobHasAnyCpt }
}

function isDeniedLine(eobLine: CBSLineItem): boolean {
  return eobLine.status === 'denied' || (eobLine.noteFlags?.length ?? 0) > 0
}

const NO_SURPRISES_REG =
  'No Surprises Act (42 U.S.C. § 300gg-111), protects against being billed above your plan-determined cost sharing for covered care.'
const ALLOWED_AMOUNT_REG =
  "Plan allowed-amount obligation, an in-network provider accepts the EOB's allowed amount as payment in full and may bill you only the patient-responsibility shown, not the difference."
const APPEAL_RIGHTS_REG =
  'ERISA § 503 / ACA § 2719 (29 U.S.C. § 1133; 42 U.S.C. § 300gg-19), right to appeal an adverse benefit determination.'

// Emergency-department E&M codes: the only context where the No Surprises Act
// citation is defensible without knowing network status. A routine in-network
// adjudicated claim is a contract/adjudication dispute, not an NSA violation.
const EMERGENCY_EM_CODES = new Set(['99281', '99282', '99283', '99284', '99285'])

// The EOB's total patient obligation: prefer the document's stated total,
// falling back to the sum of per-line patient responsibility.
function eobPatientObligation(eob: CanonicalBillingSchema): number | undefined {
  if (typeof eob.totalPatientResponsibility === 'number') return eob.totalPatientResponsibility
  const lines = eob.lineItems.filter((l) => typeof l.patientResponsibility === 'number')
  if (lines.length === 0) return undefined
  return Math.round(lines.reduce((s, l) => s + (l.patientResponsibility ?? 0), 0) * 100) / 100
}

function mismatchSeverity(diff: number): CBSDiscrepancy['severity'] {
  if (diff >= 1000) return 'critical'
  if (diff >= 100) return 'high'
  return 'medium'
}

// ─── Cross-document discrepancy detection ────────────────────────────────────

function detectDiscrepancies(
  bill: CanonicalBillingSchema | undefined,
  eob: CanonicalBillingSchema | undefined,
  denial: CanonicalBillingSchema | undefined,
  auth: CanonicalBillingSchema | undefined,
): CBSDiscrepancy[] {
  const discrepancies: CBSDiscrepancy[] = []

  // Bill vs EOB. CORE PRINCIPLE: a bill's line-item gross charges are LIST
  // PRICES, not the amount billed to the patient — on an adjudicated claim the
  // patient is billed the bottom-line Patient Responsibility AFTER insurance
  // adjustments and payments. So the PRIMARY finding here is total-level: the
  // bill's stated patient responsibility vs the EOB's "You Owe". Per-line
  // gross-charge-vs-patient-share comparisons are never balance billing on an
  // adjudicated claim (they manufactured false criticals) and are gone.
  // Per-line matching remains for: marking bill lines `eobBenchmarked` (so CMS
  // PFS/CLFS pricing defers to the payer's adjudication) and per-line patient-
  // share checks in the rare case the BILL itself states a per-line share.
  if (bill && eob) {
    const { pairs, unmatchedBill, eobHasAnyCpt } = matchBillToEOB(bill, eob)
    const deniedContext: string[] = []

    for (const { billLine, eobLine } of pairs) {
      const allowed = eobLine.allowedAmount
      const eobLineResp = eobLine.patientResponsibility
      // The bill's OWN stated per-line patient share, captured BEFORE the EOB
      // value is copied onto the line. Most itemized bills print none — then
      // there is no per-line comparison to make, and we don't infer one.
      const billStatedShare = billLine.patientResponsibility

      // Bind the bill line to the EOB benchmark so CLFS/PFS pricing won't re-flag it.
      billLine.eobBenchmarked = true
      if (allowed !== undefined) billLine.allowedAmount = allowed
      if (eobLineResp !== undefined) billLine.patientResponsibility = eobLineResp

      const codeLabel = normCode(billLine.cptCode)
        ? `CPT ${normCode(billLine.cptCode)}, `
        : ''
      const desc = eobLine.description || billLine.description || 'this service'

      // DENIED-BUT-BILLED — only when the BILL states a per-line patient share
      // above the EOB's $0 adjudication. A gross charge printed on an itemized
      // line is not evidence the patient is being charged for it; denied lines
      // without a bill-stated share become context on the total-level finding.
      if (isDeniedLine(eobLine) && (eobLineResp ?? 0) <= 0) {
        const note = eobLine.noteFlags?.[0]
        if (billStatedShare !== undefined && billStatedShare > BALANCE_BILLING_TOLERANCE) {
          discrepancies.push({
            discrepancyId: crypto.randomUUID(),
            type: 'denied_service_billed',
            severity: 'high',
            confidenceScore: 0.85,
            estimatedDollarImpact: Math.round(billStatedShare * 100) / 100,
            documentA: bill.sourceDocumentId,
            documentB: eob.sourceDocumentId,
            fieldName: 'patientResponsibility',
            valueA: `$${billStatedShare.toFixed(2)} patient share on bill`,
            valueB: '$0.00 patient responsibility (denied)',
            description:
              `${codeLabel}${desc}: your EOB adjudicated this line at $0.00 patient responsibility` +
              (note ? `, "${note}"` : '') +
              `, yet the bill assigns you a $${billStatedShare.toFixed(2)} share for it. A line the plan did not hold you responsible for cannot be billed to you; dispute it or appeal the denial.`,
            applicableRegulations: [ALLOWED_AMOUNT_REG, APPEAL_RIGHTS_REG],
          })
        } else {
          deniedContext.push(`${codeLabel}${desc}${note ? ` ("${note}")` : ''}`)
        }
        continue
      }

      // PER-LINE PATIENT-SHARE MISMATCH — only when the bill itself states a
      // per-line patient share and it exceeds the EOB's per-line figure.
      if (
        billStatedShare !== undefined &&
        eobLineResp !== undefined &&
        billStatedShare > eobLineResp + BALANCE_BILLING_TOLERANCE
      ) {
        const over = Math.round((billStatedShare - eobLineResp) * 100) / 100
        discrepancies.push({
          discrepancyId: crypto.randomUUID(),
          type: 'balance_billing_violation',
          severity: mismatchSeverity(over),
          confidenceScore: 0.85,
          estimatedDollarImpact: over,
          documentA: bill.sourceDocumentId,
          documentB: eob.sourceDocumentId,
          fieldName: 'patientResponsibility',
          valueA: `$${billStatedShare.toFixed(2)} patient share on bill`,
          valueB: `$${eobLineResp.toFixed(2)} patient responsibility per EOB`,
          description:
            `${codeLabel}${desc}: the bill assigns you a $${billStatedShare.toFixed(2)} share for this line, but your EOB adjudicated your responsibility at $${eobLineResp.toFixed(2)}` +
            (allowed !== undefined ? ` against an allowed amount of $${allowed.toFixed(2)}` : '') +
            `. You owe the EOB amount; the $${over.toFixed(2)} above it should be written off.`,
          applicableRegulations: [ALLOWED_AMOUNT_REG],
        })
      }
    }

    // ── PRIMARY CHECK: total patient responsibility, bill vs EOB ────────────
    // The one comparison that respects how adjudicated claims work: what the
    // bill asks the patient to pay vs what the payer says the patient owes.
    const billPatientResp = bill.totalPatientResponsibility
    const eobPatientResp = eobPatientObligation(eob)
    if (
      billPatientResp !== undefined &&
      eobPatientResp !== undefined &&
      billPatientResp > eobPatientResp + BALANCE_BILLING_TOLERANCE
    ) {
      const diff = Math.round((billPatientResp - eobPatientResp) * 100) / 100
      // NSA is cited only where the context supports it (emergency care);
      // otherwise this is a plan-adjudication dispute, not an NSA violation.
      const hasEmergencyContext = bill.lineItems.some((l) =>
        EMERGENCY_EM_CODES.has(normCode(l.cptCode))
      )
      const deniedNote =
        deniedContext.length > 0
          ? ` Note: the EOB shows ${deniedContext.length} line${deniedContext.length === 1 ? '' : 's'} adjudicated at $0.00 patient responsibility (${deniedContext.slice(0, 3).join('; ')}), verify none of them are folded into the amount you are asked to pay.`
          : ''
      discrepancies.push({
        discrepancyId: crypto.randomUUID(),
        type: 'patient_responsibility_mismatch',
        severity: mismatchSeverity(diff),
        confidenceScore: 0.9,
        estimatedDollarImpact: diff,
        documentA: bill.sourceDocumentId,
        documentB: eob.sourceDocumentId,
        fieldName: 'totalPatientResponsibility',
        valueA: `$${billPatientResp.toFixed(2)} patient responsibility per bill`,
        valueB: `$${eobPatientResp.toFixed(2)} you owe per EOB`,
        description:
          `The bill asks you to pay $${billPatientResp.toFixed(2)}, but your insurer's adjudication of this claim (your EOB) puts your total responsibility at $${eobPatientResp.toFixed(2)}, a difference of $${diff.toFixed(2)}. Your obligation is the EOB amount; request the provider reconcile the bill to the adjudication and write off the $${diff.toFixed(2)} difference.${deniedNote}`,
        applicableRegulations: hasEmergencyContext
          ? [ALLOWED_AMOUNT_REG, NO_SURPRISES_REG, APPEAL_RIGHTS_REG]
          : [ALLOWED_AMOUNT_REG, APPEAL_RIGHTS_REG],
      })
    }

    // Only treat a bill code as "not adjudicated" when the EOB genuinely lists
    // codes and a specific bill code is truly absent — never as a side effect of
    // an EOB simply lacking codes.
    if (eobHasAnyCpt) {
      const eobCodes = new Set(eob.lineItems.map((l) => normCode(l.cptCode)).filter(Boolean))
      for (const billLine of bill.lineItems) {
        const code = normCode(billLine.cptCode)
        if (code && !eobCodes.has(code)) {
          discrepancies.push({
            discrepancyId: crypto.randomUUID(),
            type: 'code_mismatch',
            severity: 'high',
            confidenceScore: 0.75,
            estimatedDollarImpact: billLine.billedAmount || 0,
            documentA: bill.sourceDocumentId,
            documentB: eob.sourceDocumentId,
            fieldName: 'cptCode',
            valueA: `CPT ${code} on bill ($${(billLine.billedAmount || 0).toFixed(2)})`,
            valueB: 'Not adjudicated on EOB',
            description: `CPT code ${code} appears on your itemized bill but was not adjudicated on your Explanation of Benefits, which does list other codes. This charge of $${(billLine.billedAmount || 0).toFixed(2)} may be a billing error or a code denied without explanation.`,
            applicableRegulations: [
              'CMS Claims Processing Manual (Pub. 100-04), Ch. 23, all billed codes must be reflected in adjudication.',
            ],
          })
        }
      }
    }

    // Genuinely unmatched bill lines: soften — do NOT assert non-adjudication.
    for (const billLine of unmatchedBill) {
      discrepancies.push({
        discrepancyId: crypto.randomUUID(),
        type: 'amount_mismatch',
        severity: 'low',
        confidenceScore: 0.3,
        estimatedDollarImpact: 0,
        documentA: bill.sourceDocumentId,
        documentB: eob.sourceDocumentId,
        fieldName: 'lineItem',
        valueA: `$${(billLine.billedAmount ?? 0).toFixed(2)} ${billLine.description || normCode(billLine.cptCode) || 'charge'}`,
        valueB: 'No clear matching EOB line',
        description: `We could not confidently match this charge of $${(billLine.billedAmount ?? 0).toFixed(2)} to a line on your EOB. This may simply reflect different formatting between the documents rather than a problem, worth a manual look before relying on it.`,
        applicableRegulations: [],
      })
    }
  }

  // Denial without corresponding authorization
  if (denial && !auth && bill) {
    discrepancies.push({
      discrepancyId: crypto.randomUUID(),
      type: 'denial_without_authorization',
      severity: 'high',
      confidenceScore: 0.65,
      estimatedDollarImpact: bill.totalBilled || 0,
      documentA: denial.sourceDocumentId,
      fieldName: 'authorizationStatus',
      valueA: 'Denied, no authorization record found',
      description: `A claim denial was found, but no prior authorization document was uploaded. If services required prior authorization, you have the right to appeal and request documentation of the authorization requirements.`,
      applicableRegulations: [
        'ACA § 2719 (42 U.S.C. § 300gg-19), right to internal and external appeal of denied claims',
        'ERISA § 502(a) (29 U.S.C. § 1132), right to appeal denied benefits claims',
      ],
    })
  }

  return discrepancies
}

// ─── Temporal inconsistency detection ────────────────────────────────────────

function detectTemporalInconsistencies(
  docs: CanonicalBillingSchema[]
): CBSTemporalFlag[] {
  const flags: CBSTemporalFlag[] = []

  const bill = docs.find(d => d.sourceDocumentType === 'itemized_bill')
  const eob = docs.find(d => d.sourceDocumentType === 'eob')
  const auth = docs.find(d => d.sourceDocumentType === 'prior_authorization')
  const collection = docs.find(d => d.sourceDocumentType === 'collection_notice')

  // EOB date before service date
  if (eob?.eobDate && eob?.dateOfService) {
    const days = daysBetween(eob.dateOfService, eob.eobDate)
    if (days < 0) {
      flags.push({
        flagId: crypto.randomUUID(),
        type: 'eob_before_service',
        description: `EOB issued on ${eob.eobDate} but service date is ${eob.dateOfService}, the explanation of benefits predates the service by ${Math.abs(days)} days.`,
        estimatedImpact: 'Possible data entry error or fraudulent billing',
        daysViolated: Math.abs(days),
      })
    }
  }

  // Service billed before authorization
  if (auth?.authorizationDate && bill?.dateOfService) {
    const days = daysBetween(auth.authorizationDate, bill.dateOfService)
    if (days < 0) {
      flags.push({
        flagId: crypto.randomUUID(),
        type: 'service_before_authorization',
        description: `Service date (${bill.dateOfService}) precedes authorization date (${auth.authorizationDate}) by ${Math.abs(days)} days.`,
        estimatedImpact: 'Service may have been rendered without valid authorization, insurer may be obligated to cover if emergency',
        daysViolated: Math.abs(days),
      })
    }
  }

  // Collection notice too soon after bill (FDCPA requires 30-day validation period)
  if (collection?.collectionDate && bill?.billDate) {
    const days = daysBetween(bill.billDate, collection.collectionDate)
    if (days < COLLECTION_NOTICE_PERIOD_DAYS) {
      flags.push({
        flagId: crypto.randomUUID(),
        type: 'collection_before_notice_period',
        description: `Collection activity started only ${days} days after billing. FDCPA § 1692g requires a 30-day debt validation period before collection can continue.`,
        estimatedImpact: `Potential FDCPA violation, collector must cease collection and provide debt validation`,
        daysViolated: COLLECTION_NOTICE_PERIOD_DAYS - days,
      })
    }
  }

  return flags
}

// ─── Timeline builder ─────────────────────────────────────────────────────────

function buildTimelineFromDocs(
  docs: CanonicalBillingSchema[],
  temporalFlags: CBSTemporalFlag[]
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const doc of docs) {
    const addEvent = (
      date: string | undefined,
      type: TimelineEvent['eventType'],
      title: string,
      description: string,
      amount?: number
    ) => {
      if (!date) return
      const flag = temporalFlags.find(f =>
        (f.type === 'eob_before_service' && type === 'adjudication') ||
        (f.type === 'service_before_authorization' && type === 'authorization') ||
        (f.type === 'collection_before_notice_period' && type === 'collection')
      )
      // A 0/undefined amount is a missing figure, not a $0.00 event — omit it
      // rather than render placeholder dollars. Entity names are shown only
      // when a real name was extracted (never residue like "NPI").
      const entityName = (doc.providerName || doc.payerName || '').trim() || undefined
      events.push({
        eventId: crypto.randomUUID(),
        date,
        eventType: type,
        title,
        description,
        sourceDocument: doc.sourceDocumentId,
        sourceDocumentType: doc.sourceDocumentType,
        financialAmount: typeof amount === 'number' && amount > 0 ? amount : undefined,
        entityName,
        hasInconsistency: !!flag,
        inconsistencyDescription: flag?.description,
      })
    }

    // Dollar clauses render only when the figure exists — "Bill issued for
    // $0.00" / "allowed $0.00" were placeholder artifacts, not data. Formatted
    // with thousands separators (the raw toFixed rendered "$20905.00").
    const money = (n: number | undefined) =>
      typeof n === 'number' && n > 0
        ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null
    // Placeholder-valued events are suppressed entirely: an authorization with
    // no status and no number, or an adjudication with no status and no allowed
    // amount, says nothing a person can use.
    if (doc.authorizationDate && (doc.authorizationStatus || doc.authorizationNumber)) {
      addEvent(doc.authorizationDate, 'authorization', 'Prior Authorization', `Authorization ${doc.authorizationStatus || 'on file'}${doc.authorizationNumber ? ` (#${doc.authorizationNumber})` : ''}`)
    }
    if (doc.dateOfService) addEvent(doc.dateOfService, 'service', doc.providerName ? `Service at ${doc.providerName}` : 'Medical service', `Medical service rendered`, doc.totalBilled)
    if (doc.billDate) addEvent(doc.billDate, 'billing', doc.providerName ? `Bill from ${doc.providerName}` : 'Bill issued', money(doc.totalBilled) ? `Bill issued for ${money(doc.totalBilled)}` : 'Bill issued', doc.totalBilled)
    if (doc.eobDate && (doc.adjudicationStatus || money(doc.totalAllowed))) {
      addEvent(doc.eobDate, 'adjudication', `${doc.payerName || 'Insurer'} processed claim`, `Your insurance processed the claim${doc.adjudicationStatus ? `: ${doc.adjudicationStatus}` : ''}${money(doc.totalAllowed) ? `, allowed ${money(doc.totalAllowed)}` : ''}`, doc.totalAllowed)
    }
    if (doc.denialDate) addEvent(doc.denialDate, 'denial', 'Claim Denied', doc.denialReason || `Denial code: ${doc.denialCode || 'unknown'}`)
    if (doc.collectionDate) addEvent(doc.collectionDate, 'collection', 'Collection Notice', money(doc.totalBalance || doc.totalBilled) ? `Collection activity for ${money(doc.totalBalance || doc.totalBilled)}` : 'Collection activity', doc.totalBalance)

    // Appeal deadline as future event
    if (doc.appealDeadline) {
      const days = daysUntil(doc.appealDeadline)
      const urgency = days < 0 ? 'critical' : days <= 7 ? 'critical' : days <= 30 ? 'high' : days <= 90 ? 'moderate' : 'informational'
      events.push({
        eventId: crypto.randomUUID(),
        date: doc.appealDeadline,
        eventType: 'deadline',
        title: days < 0 ? 'Appeal deadline passed' : `Appeal Deadline${days <= 7 ? ': URGENT' : ''}`,
        description: days < 0
          ? `Appeal deadline was ${Math.abs(days)} days ago. Contact an attorney or patient advocate immediately.`
          : `${days} days remaining to file your appeal.`,
        sourceDocument: doc.sourceDocumentId,
        sourceDocumentType: doc.sourceDocumentType,
        hasInconsistency: days < 0,
        inconsistencyDescription: days < 0 ? 'Appeal window has closed' : undefined,
        urgencyLevel: urgency,
        isFutureDeadline: days >= 0,
        daysUntil: days,
      })
    }
  }

  // Sort chronologically
  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

export function normalizeCBSSet(inputDocuments: CanonicalBillingSchema[]): NormalizedCBSSet {
  if (inputDocuments.length === 0) {
    return {
      documents: [],
      linkedEpisodes: [],
      crossDocumentDiscrepancies: [],
      timeline: [],
      totalDiscrepancies: 0,
      totalDollarAtRisk: 0,
    }
  }

  // M6: work on shallow clones with FRESH discrepancy/temporal arrays. This
  // function attaches computed discrepancies back onto the documents; doing that
  // on the caller's objects mutated their input, so re-running an audit on an
  // already-normalized/persisted set double-appended discrepancies and flags.
  // Recompute from a clean slate every call, and never touch the input.
  const documents: CanonicalBillingSchema[] = inputDocuments.map((d) => ({
    ...d,
    discrepancies: [] as CBSDiscrepancy[],
    temporalInconsistencies: [] as CBSTemporalFlag[],
  }))

  const linkedEpisodes = groupIntoEpisodes(documents)

  // Cross-document detection per episode
  const allDiscrepancies: CBSDiscrepancy[] = []
  const allTemporalFlags: CBSTemporalFlag[] = []

  for (const episode of linkedEpisodes) {
    const episodeDocs = documents.filter(d => episode.documents.includes(d.sourceDocumentId))
    const bill = episodeDocs.find(d => d.sourceDocumentType === 'itemized_bill')
    const eob = episodeDocs.find(d => d.sourceDocumentType === 'eob')
    const denial = episodeDocs.find(d => d.sourceDocumentType === 'denial_letter')
    const auth = episodeDocs.find(d => d.sourceDocumentType === 'prior_authorization')

    const discrepancies = detectDiscrepancies(bill, eob, denial, auth)
    const temporalFlags = detectTemporalInconsistencies(episodeDocs)

    allDiscrepancies.push(...discrepancies)
    allTemporalFlags.push(...temporalFlags)
  }

  // Attach discrepancies back to source documents
  for (const disc of allDiscrepancies) {
    const docA = documents.find(d => d.sourceDocumentId === disc.documentA)
    if (docA) docA.discrepancies.push(disc)
  }
  for (const flag of allTemporalFlags) {
    // Attach to first document in the set
    if (documents[0]) documents[0].temporalInconsistencies.push(flag)
  }

  const timeline = buildTimelineFromDocs(documents, allTemporalFlags)

  const totalDollarAtRisk = allDiscrepancies.reduce((sum, d) => sum + d.estimatedDollarImpact, 0)

  return {
    documents,
    linkedEpisodes,
    crossDocumentDiscrepancies: allDiscrepancies,
    timeline,
    totalDiscrepancies: allDiscrepancies.length,
    totalDollarAtRisk,
  }
}
