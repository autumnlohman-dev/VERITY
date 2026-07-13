// Server-side dispatch bookkeeping: the dispute_outcomes row created at the
// moment a letter is mailed via Lob. Pure builder so the field mapping is
// unit-testable apart from the route. Letter delivery always takes priority
// over this bookkeeping — the caller logs an insert failure loudly and moves on.

export interface DispatchOutcomeParams {
  caseId: string
  userId: string
  /** dispute_letters row that was mailed (null for legacy letters without an id read). */
  letterRowId: string | null
  /** Lob's letter id for this physical mailing. */
  lobLetterId: string
  /** The letter's audit_logic_version at dispatch (version-stamp convention). */
  letterVersion: number | null
  /** ISO timestamp of the dispatch; equals cases.mailed_at. */
  sentAt: string
  /** Mail recipient name from the letter's To address. */
  recipientName: string | null
  /** The letter's escalation rung (dispute_letters.letter_type); drives
   *  recipient_type and escalation_level on the outcome row. */
  letterType?: string | null
}

// letter_type → dispute_outcomes.recipient_type (DB CHECK vocabulary).
const RECIPIENT_BY_LETTER_TYPE: Record<string, string> = {
  first_dispute: 'provider',
  appeal: 'provider',
  regulator_complaint: 'regulator',
  credit_bureau_dispute: 'credit_bureau',
  collector_dispute: 'collector',
}

export function buildDispatchOutcomeRow(p: DispatchOutcomeParams): Record<string, unknown> {
  const letterType = p.letterType && RECIPIENT_BY_LETTER_TYPE[p.letterType] ? p.letterType : 'first_dispute'
  return {
    case_id: p.caseId,
    user_id: p.userId,
    letter_id: p.letterRowId,
    lob_letter_id: p.lobLetterId,
    letter_version: p.letterVersion != null ? String(p.letterVersion) : null,
    sent_at: p.sentAt,
    recipient_type: RECIPIENT_BY_LETTER_TYPE[letterType],
    recipient_name: p.recipientName,
    status: 'sent',
    escalation_level: letterType,
    updated_at: p.sentAt,
  }
}
