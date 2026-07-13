// Outcome-driven deadline rules (step 3 of outcome persistence). Pure and
// deterministic: given an outcome's state and its existing deadlines, compute
// the deadline mutations. No LLM, no I/O — the mail-dispatch route, the
// response-intake route, and the nightly sweep all consume these.
//
// Distinct from ./calculator.ts, which derives REGULATORY deadlines from the
// case's documents; these windows track our own dispute correspondence.

// ─── Configurable window lengths (the one place to change them) ──────────────
// DEFAULTS PENDING COUNSEL/SISTER REVIEW: real appeal and response windows
// vary by payer, plan type, and state; 30 days is a conservative placeholder
// for our own correspondence cadence, not a legal deadline. Change here only —
// call sites and the backfill migration must never hardcode these figures.
export const RESPONSE_WINDOW_DAYS = 30
export const ESCALATION_WINDOW_DAYS = 30

export type OutcomeDeadlineType = 'response_window' | 'escalation_window' | 'custom'
export type DeadlineUrgency = 'critical' | 'high' | 'moderate' | 'informational'
export type DeadlineStatus = 'active' | 'satisfied' | 'expired' | 'dismissed'

// Urgency ladder (matches the audit deadline calculator's classification):
// critical ≤ 7 days out, high ≤ 30, moderate ≤ 90, else informational.
export function urgencyForDueDate(dueDateISO: string, today: Date): DeadlineUrgency {
  const due = new Date(`${dueDateISO.slice(0, 10)}T00:00:00Z`).getTime()
  const now = new Date(today).setUTCHours(0, 0, 0, 0)
  const daysOut = Math.round((due - now) / 86_400_000)
  if (daysOut <= 7) return 'critical'
  if (daysOut <= 30) return 'high'
  if (daysOut <= 90) return 'moderate'
  return 'informational'
}

function isoDay(input: string | Date): string {
  return new Date(input).toISOString().slice(0, 10)
}

function addDays(fromISO: string, days: number): string {
  const d = new Date(`${isoDay(fromISO)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface OutcomeDeadlineFacts {
  outcomeId: string
  caseId: string
  status: string
  sentAt: string | null
  responseReceivedAt: string | null
}

export interface ExistingDeadline {
  id: string
  deadlineType: OutcomeDeadlineType
  dueDate: string
  status: DeadlineStatus
}

export interface DeadlineCreate {
  case_id: string
  outcome_id: string
  deadline_type: OutcomeDeadlineType
  due_date: string
  source: string
  urgency: DeadlineUrgency
  status: 'active'
}

export interface DeadlineMutations {
  create: DeadlineCreate[]
  /** Active deadlines resolved by this event (row ids → status 'satisfied'). */
  satisfyIds: string[]
  /** Active deadlines that lapsed (row ids → status 'expired'). */
  expireIds: string[]
}

// The transition rules:
//   sent               → open a response_window at sent_at + RESPONSE_WINDOW_DAYS
//   denied             → satisfy the response_window; open an escalation_window
//                        at response_at + ESCALATION_WINDOW_DAYS
//   resolved | partial → satisfy every active deadline on the outcome
//   no_response        → if the response_window has passed, expire it and open
//                        an escalation_window at today + ESCALATION_WINDOW_DAYS;
//                        if the window is still open, no change (too early).
// Idempotent: never creates a second active deadline of the same type.
export function deadlineMutationsForOutcome(
  outcome: OutcomeDeadlineFacts,
  existing: ExistingDeadline[],
  today: Date
): DeadlineMutations {
  const none: DeadlineMutations = { create: [], satisfyIds: [], expireIds: [] }
  const active = existing.filter((d) => d.status === 'active')
  const hasActive = (type: OutcomeDeadlineType) => active.some((d) => d.deadlineType === type)
  const activeIds = (type?: OutcomeDeadlineType) =>
    active.filter((d) => !type || d.deadlineType === type).map((d) => d.id)

  switch (outcome.status) {
    case 'sent': {
      if (!outcome.sentAt || hasActive('response_window')) return none
      const due = addDays(outcome.sentAt, RESPONSE_WINDOW_DAYS)
      return {
        ...none,
        create: [
          {
            case_id: outcome.caseId,
            outcome_id: outcome.outcomeId,
            deadline_type: 'response_window',
            due_date: due,
            source: `${RESPONSE_WINDOW_DAYS} days from mail date ${isoDay(outcome.sentAt)}`,
            urgency: urgencyForDueDate(due, today),
            status: 'active',
          },
        ],
      }
    }

    case 'denied': {
      const create: DeadlineCreate[] = []
      if (outcome.responseReceivedAt && !hasActive('escalation_window')) {
        const due = addDays(outcome.responseReceivedAt, ESCALATION_WINDOW_DAYS)
        create.push({
          case_id: outcome.caseId,
          outcome_id: outcome.outcomeId,
          deadline_type: 'escalation_window',
          due_date: due,
          source: `${ESCALATION_WINDOW_DAYS} days from denial ${isoDay(outcome.responseReceivedAt)}`,
          urgency: urgencyForDueDate(due, today),
          status: 'active',
        })
      }
      return { create, satisfyIds: activeIds('response_window'), expireIds: [] }
    }

    case 'resolved':
    case 'partial':
      return { ...none, satisfyIds: activeIds() }

    case 'no_response': {
      const window = active.find((d) => d.deadlineType === 'response_window')
      const todayISO = isoDay(today)
      // Window still open (or none): too early to escalate, nothing changes.
      if (!window || window.dueDate >= todayISO) return none
      if (hasActive('escalation_window')) return { ...none, expireIds: [window.id] }
      const due = addDays(todayISO, ESCALATION_WINDOW_DAYS)
      return {
        create: [
          {
            case_id: outcome.caseId,
            outcome_id: outcome.outcomeId,
            deadline_type: 'escalation_window',
            due_date: due,
            source: `no response after the ${RESPONSE_WINDOW_DAYS}-day window; ${ESCALATION_WINDOW_DAYS} days from ${todayISO}`,
            urgency: urgencyForDueDate(due, today),
            status: 'active',
          },
        ],
        satisfyIds: [],
        expireIds: [window.id],
      }
    }

    default:
      return none
  }
}

// Nightly sweep reclassification for one active deadline: past due → expired;
// otherwise recompute urgency as the date approaches. Returns null when the
// row needs no update.
export function sweepReclassify(
  d: { dueDate: string; urgency: DeadlineUrgency; status: DeadlineStatus },
  today: Date
): { status?: 'expired'; urgency?: DeadlineUrgency } | null {
  if (d.status !== 'active') return null
  if (d.dueDate < isoDay(today)) return { status: 'expired' }
  const urgency = urgencyForDueDate(d.dueDate, today)
  return urgency === d.urgency ? null : { urgency }
}
