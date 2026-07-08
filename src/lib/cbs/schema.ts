// ─── Canonical Billing Schema (CBS) ──────────────────────────────────────────
// The core data structure of VERITY. All healthcare documents — bills, EOBs,
// denial letters, authorizations, collection notices — are normalized into
// this unified schema before cross-document comparison.

export type DocumentType =
  | 'itemized_bill'
  | 'eob'
  | 'denial_letter'
  | 'prior_authorization'
  | 'collection_notice'
  | 'medical_record'
  | 'good_faith_estimate'
  | 'credit_notice'
  | 'unknown'

export type DiscrepancyType =
  | 'amount_mismatch'
  | 'code_mismatch'
  | 'duplicate_charge'
  | 'unauthorized_service'
  | 'balance_billing_violation'
  // The primary bill-vs-EOB finding: the bill asks the patient to pay more than
  // the EOB's adjudicated patient responsibility. Compared at the TOTAL level
  // (bill's stated bottom-line vs EOB's "You Owe"), never from gross line
  // charges — an itemized line's list price is not the amount billed to the
  // patient on an adjudicated claim.
  | 'patient_responsibility_mismatch'
  | 'denied_service_billed'
  | 'denial_without_authorization'
  | 'temporal_inconsistency'
  | 'upcoding'
  | 'unbundling'
  | 'collection_violation'
  | 'credit_reporting_violation'

export type DiscrepancySeverity = 'critical' | 'high' | 'medium' | 'low'

export interface CBSLineItem {
  lineItemId: string
  cptCode?: string
  hcpcsCode?: string
  icdCode?: string
  description?: string
  billedAmount?: number
  allowedAmount?: number
  patientResponsibility?: number
  paidAmount?: number
  units?: number
  serviceDate?: string
  status?: 'paid' | 'denied' | 'adjusted' | 'pending' | 'unknown'
  denialCode?: string
  // Free-text adjudication notes carried verbatim from an EOB line, e.g.
  // "not payable with the diagnosis billed". Most commercial EOB lines carry
  // a service description + note rather than a CPT/HCPCS code.
  noteFlags?: string[]
  // Set on a bill line once it has been matched to an EOB line and priced
  // against the EOB's allowed amount. Downstream Medicare CLFS/PFS pricing
  // must skip these lines — the EOB is the binding benchmark, not the CLFS.
  eobBenchmarked?: boolean
}

export interface CBSDiscrepancy {
  discrepancyId: string
  type: DiscrepancyType
  severity: DiscrepancySeverity
  confidenceScore: number // 0.0 to 1.0
  estimatedDollarImpact: number
  documentA: string // sourceDocumentId
  documentB?: string // sourceDocumentId of second document
  fieldName: string
  valueA: string
  valueB?: string
  description: string
  applicableRegulations: string[]
}

export interface CBSTemporalFlag {
  flagId: string
  type:
    | 'service_before_authorization'
    | 'eob_before_service'
    | 'collection_before_notice_period'
    | 'billing_after_timely_filing'
    | 'appeal_deadline_passed'
  description: string
  estimatedImpact: string
  daysViolated?: number
}

export interface CanonicalBillingSchema {
  // Document identity
  sourceDocumentId: string
  sourceDocumentType: DocumentType

  // Patient
  patientName?: string
  patientDOB?: string

  // Encounter
  dateOfService?: string
  serviceEpisodeId?: string
  claimNumber?: string

  // Provider & payer
  providerName?: string
  providerNPI?: string
  payerName?: string
  payerMemberId?: string

  // Financial
  lineItems: CBSLineItem[]
  totalBilled?: number
  totalAllowed?: number
  totalPatientResponsibility?: number
  totalPaid?: number
  totalBalance?: number

  // Adjudication
  adjudicationStatus?: 'approved' | 'denied' | 'partially_approved' | 'pending' | 'unknown'
  denialReason?: string
  denialCode?: string

  // Authorization
  authorizationNumber?: string
  authorizationStatus?: 'approved' | 'denied' | 'not_required' | 'unknown'
  authorizationDate?: string

  // Key dates
  billDate?: string
  eobDate?: string
  denialDate?: string
  collectionDate?: string
  appealDeadline?: string

  // Cross-document analysis output (populated by normalizer)
  discrepancies: CBSDiscrepancy[]
  temporalInconsistencies: CBSTemporalFlag[]
}

// ─── Normalized CBS Set (output of multi-document normalization) ───────────────

export interface EpisodeGroup {
  episodeId: string
  documents: string[] // sourceDocumentIds
  dateOfService?: string
  claimNumber?: string
}

export interface TimelineEvent {
  eventId: string
  date: string
  eventType:
    | 'authorization'
    | 'service'
    | 'claim_submission'
    | 'adjudication'
    | 'billing'
    | 'payment'
    | 'denial'
    | 'appeal'
    | 'collection'
    | 'credit_reporting'
    | 'good_faith_estimate'
    | 'deadline'
  title: string
  description: string
  sourceDocument: string
  sourceDocumentType: DocumentType
  financialAmount?: number
  entityName?: string
  hasInconsistency: boolean
  inconsistencyDescription?: string
  urgencyLevel?: 'critical' | 'high' | 'moderate' | 'informational'
  isFutureDeadline?: boolean
  daysUntil?: number
}

export interface NormalizedCBSSet {
  documents: CanonicalBillingSchema[]
  linkedEpisodes: EpisodeGroup[]
  crossDocumentDiscrepancies: CBSDiscrepancy[]
  timeline: TimelineEvent[]
  totalDiscrepancies: number
  totalDollarAtRisk: number
}
