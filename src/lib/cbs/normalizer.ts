import type {
  CanonicalBillingSchema,
  CBSDiscrepancy,
  CBSTemporalFlag,
  EpisodeGroup,
  NormalizedCBSSet,
  TimelineEvent,
} from './schema'

const COLLECTION_NOTICE_PERIOD_DAYS = 30 // FDCPA § 1692g

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

// ─── Cross-document discrepancy detection ────────────────────────────────────

function detectDiscrepancies(
  bill: CanonicalBillingSchema | undefined,
  eob: CanonicalBillingSchema | undefined,
  denial: CanonicalBillingSchema | undefined,
  auth: CanonicalBillingSchema | undefined,
): CBSDiscrepancy[] {
  const discrepancies: CBSDiscrepancy[] = []

  // Bill vs EOB: amount mismatch / balance billing
  if (bill && eob) {
    const billTotal = bill.totalBilled || 0
    const patientResp = eob.totalPatientResponsibility || 0
    const allowed = eob.totalAllowed || 0

    // Patient responsibility exceeds allowed amount (balance billing violation)
    if (allowed > 0 && patientResp > allowed * 1.05) {
      discrepancies.push({
        discrepancyId: crypto.randomUUID(),
        type: 'balance_billing_violation',
        severity: 'critical',
        confidenceScore: 0.85,
        estimatedDollarImpact: Math.round(patientResp - allowed),
        documentA: bill.sourceDocumentId,
        documentB: eob.sourceDocumentId,
        fieldName: 'patientResponsibility vs allowedAmount',
        valueA: `$${patientResp.toFixed(2)} patient responsibility`,
        valueB: `$${allowed.toFixed(2)} allowed amount`,
        description: `Your bill shows you owe $${patientResp.toFixed(2)}, but your EOB shows the allowed amount is only $${allowed.toFixed(2)}. You may be being balance billed $${(patientResp - allowed).toFixed(2)} above the contracted rate.`,
        applicableRegulations: [
          'No Surprises Act (42 U.S.C. § 300gg-111) — prohibits balance billing for emergency services and out-of-network care at in-network facilities',
          'Transparency in Coverage Rule (45 C.F.R. Parts 147, 158, 184)',
        ],
      })
    }

    // CPT code mismatch between bill and EOB
    const billCodes = new Set(bill.lineItems.map(li => li.cptCode).filter(Boolean))
    const eobCodes = new Set(eob.lineItems.map(li => li.cptCode).filter(Boolean))

    for (const code of billCodes) {
      if (code && !eobCodes.has(code)) {
        const li = bill.lineItems.find(l => l.cptCode === code)
        discrepancies.push({
          discrepancyId: crypto.randomUUID(),
          type: 'code_mismatch',
          severity: 'high',
          confidenceScore: 0.75,
          estimatedDollarImpact: li?.billedAmount || 0,
          documentA: bill.sourceDocumentId,
          documentB: eob.sourceDocumentId,
          fieldName: 'cptCode',
          valueA: `CPT ${code} on bill ($${(li?.billedAmount || 0).toFixed(2)})`,
          valueB: 'Not adjudicated on EOB',
          description: `CPT code ${code} appears on your itemized bill but was not adjudicated on your Explanation of Benefits. This charge of $${(li?.billedAmount || 0).toFixed(2)} may be a billing error or a code that was denied without explanation.`,
          applicableRegulations: [
            'CMS Claims Processing Manual (Pub. 100-04), Ch. 23 — all billed codes must be reflected in adjudication',
          ],
        })
      }
    }

    // Total amount discrepancy
    if (eob.totalAllowed && billTotal > 0 && Math.abs(billTotal - eob.totalAllowed) > 50) {
      discrepancies.push({
        discrepancyId: crypto.randomUUID(),
        type: 'amount_mismatch',
        severity: 'medium',
        confidenceScore: 0.70,
        estimatedDollarImpact: Math.abs(billTotal - eob.totalAllowed),
        documentA: bill.sourceDocumentId,
        documentB: eob.sourceDocumentId,
        fieldName: 'totalAmount',
        valueA: `$${billTotal.toFixed(2)} billed`,
        valueB: `$${eob.totalAllowed.toFixed(2)} allowed`,
        description: `Your itemized bill shows $${billTotal.toFixed(2)} in total charges, but your EOB shows a total allowed amount of $${eob.totalAllowed.toFixed(2)}. The difference of $${Math.abs(billTotal - eob.totalAllowed).toFixed(2)} requires review.`,
        applicableRegulations: [
          'No Surprises Act — providers must bill at contracted rates for covered services',
        ],
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
      valueA: 'Denied — no authorization record found',
      description: `A claim denial was found, but no prior authorization document was uploaded. If services required prior authorization, you have the right to appeal and request documentation of the authorization requirements.`,
      applicableRegulations: [
        'ACA § 2719 (42 U.S.C. § 300gg-19) — right to internal and external appeal of denied claims',
        'ERISA § 502(a) (29 U.S.C. § 1132) — right to appeal denied benefits claims',
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
        description: `EOB issued on ${eob.eobDate} but service date is ${eob.dateOfService} — the explanation of benefits predates the service by ${Math.abs(days)} days.`,
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
        estimatedImpact: 'Service may have been rendered without valid authorization — insurer may be obligated to cover if emergency',
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
        estimatedImpact: `Potential FDCPA violation — collector must cease collection and provide debt validation`,
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
      events.push({
        eventId: crypto.randomUUID(),
        date,
        eventType: type,
        title,
        description,
        sourceDocument: doc.sourceDocumentId,
        sourceDocumentType: doc.sourceDocumentType,
        financialAmount: amount,
        entityName: doc.providerName || doc.payerName,
        hasInconsistency: !!flag,
        inconsistencyDescription: flag?.description,
      })
    }

    if (doc.authorizationDate) addEvent(doc.authorizationDate, 'authorization', 'Prior Authorization', `Authorization ${doc.authorizationStatus || 'status unknown'}${doc.authorizationNumber ? ` (#${doc.authorizationNumber})` : ''}`)
    if (doc.dateOfService) addEvent(doc.dateOfService, 'service', `Service at ${doc.providerName || 'Provider'}`, `Medical service rendered`, doc.totalBilled)
    if (doc.billDate) addEvent(doc.billDate, 'billing', `Bill from ${doc.providerName || 'Provider'}`, `Bill issued for $${(doc.totalBilled || 0).toFixed(2)}`, doc.totalBilled)
    if (doc.eobDate) addEvent(doc.eobDate, 'adjudication', `${doc.payerName || 'Insurer'} processed claim`, `Adjudication: ${doc.adjudicationStatus || 'unknown'} — allowed $${(doc.totalAllowed || 0).toFixed(2)}`, doc.totalAllowed)
    if (doc.denialDate) addEvent(doc.denialDate, 'denial', 'Claim Denied', doc.denialReason || `Denial code: ${doc.denialCode || 'unknown'}`)
    if (doc.collectionDate) addEvent(doc.collectionDate, 'collection', 'Collection Notice', `Collection activity for $${(doc.totalBalance || doc.totalBilled || 0).toFixed(2)}`, doc.totalBalance)

    // Appeal deadline as future event
    if (doc.appealDeadline) {
      const days = daysUntil(doc.appealDeadline)
      const urgency = days < 0 ? 'critical' : days <= 7 ? 'critical' : days <= 30 ? 'high' : days <= 90 ? 'moderate' : 'informational'
      events.push({
        eventId: crypto.randomUUID(),
        date: doc.appealDeadline,
        eventType: 'deadline',
        title: days < 0 ? '⚠️ Appeal Deadline PASSED' : `Appeal Deadline${days <= 7 ? ' — URGENT' : ''}`,
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

export function normalizeCBSSet(documents: CanonicalBillingSchema[]): NormalizedCBSSet {
  if (documents.length === 0) {
    return {
      documents: [],
      linkedEpisodes: [],
      crossDocumentDiscrepancies: [],
      timeline: [],
      totalDiscrepancies: 0,
      totalDollarAtRisk: 0,
    }
  }

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
