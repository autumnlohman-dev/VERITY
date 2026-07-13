import { describe, it, expect } from 'vitest'
import {
  RESPONSE_WINDOW_DAYS,
  ESCALATION_WINDOW_DAYS,
  urgencyForDueDate,
  deadlineMutationsForOutcome,
  sweepReclassify,
  type ExistingDeadline,
} from '../outcomeWindows'

const TODAY = new Date('2026-07-13T15:00:00Z')

const BASE = {
  outcomeId: 'out-1',
  caseId: 'case-1',
  sentAt: '2026-07-13T10:00:00.000Z',
  responseReceivedAt: null as string | null,
}

const activeWindow = (over: Partial<ExistingDeadline> = {}): ExistingDeadline => ({
  id: 'dl-1',
  deadlineType: 'response_window',
  dueDate: '2026-08-12',
  status: 'active',
  ...over,
})

describe('urgencyForDueDate ladder', () => {
  it('classifies by days out: ≤7 critical, ≤30 high, ≤90 moderate, else informational', () => {
    expect(urgencyForDueDate('2026-07-20', TODAY)).toBe('critical') // 7 days
    expect(urgencyForDueDate('2026-07-21', TODAY)).toBe('high') // 8 days
    expect(urgencyForDueDate('2026-08-12', TODAY)).toBe('high') // 30 days
    expect(urgencyForDueDate('2026-08-13', TODAY)).toBe('moderate') // 31 days
    expect(urgencyForDueDate('2026-10-11', TODAY)).toBe('moderate') // 90 days
    expect(urgencyForDueDate('2026-10-12', TODAY)).toBe('informational') // 91 days
    expect(urgencyForDueDate('2026-07-10', TODAY)).toBe('critical') // already past
  })
})

describe('deadlineMutationsForOutcome', () => {
  it("sent: opens a response_window at sent_at + RESPONSE_WINDOW_DAYS", () => {
    const m = deadlineMutationsForOutcome({ ...BASE, status: 'sent' }, [], TODAY)
    expect(m.create).toHaveLength(1)
    expect(m.create[0]).toMatchObject({
      case_id: 'case-1',
      outcome_id: 'out-1',
      deadline_type: 'response_window',
      due_date: '2026-08-12',
      status: 'active',
    })
    expect(m.create[0].source).toBe(`${RESPONSE_WINDOW_DAYS} days from mail date 2026-07-13`)
    expect(m.satisfyIds).toEqual([])
  })

  it('sent: idempotent when an active response_window already exists', () => {
    const m = deadlineMutationsForOutcome({ ...BASE, status: 'sent' }, [activeWindow()], TODAY)
    expect(m.create).toHaveLength(0)
  })

  it('denied: satisfies the response_window and opens an escalation_window from the response date', () => {
    const m = deadlineMutationsForOutcome(
      { ...BASE, status: 'denied', responseReceivedAt: '2026-07-20T12:00:00.000Z' },
      [activeWindow()],
      TODAY
    )
    expect(m.satisfyIds).toEqual(['dl-1'])
    expect(m.create).toHaveLength(1)
    expect(m.create[0]).toMatchObject({ deadline_type: 'escalation_window', due_date: '2026-08-19' })
    expect(m.create[0].source).toBe(`${ESCALATION_WINDOW_DAYS} days from denial 2026-07-20`)
  })

  it.each(['resolved', 'partial'] as const)('%s: satisfies every active deadline', (status) => {
    const m = deadlineMutationsForOutcome({ ...BASE, status }, [
      activeWindow(),
      activeWindow({ id: 'dl-2', deadlineType: 'escalation_window' }),
      activeWindow({ id: 'dl-3', status: 'satisfied' }),
    ], TODAY)
    expect(m.satisfyIds).toEqual(['dl-1', 'dl-2'])
    expect(m.create).toHaveLength(0)
  })

  it('no_response before the window passes: no change', () => {
    const m = deadlineMutationsForOutcome(
      { ...BASE, status: 'no_response' },
      [activeWindow({ dueDate: '2026-08-12' })],
      TODAY
    )
    expect(m.create).toHaveLength(0)
    expect(m.expireIds).toEqual([])
  })

  it('no_response after the window passed: expires it and opens escalation_window at today + N', () => {
    const m = deadlineMutationsForOutcome(
      { ...BASE, status: 'no_response' },
      [activeWindow({ dueDate: '2026-07-01' })],
      TODAY
    )
    expect(m.expireIds).toEqual(['dl-1'])
    expect(m.create).toHaveLength(1)
    expect(m.create[0]).toMatchObject({ deadline_type: 'escalation_window', due_date: '2026-08-12' })
  })

  it('unknown / user-label statuses produce no mutations', () => {
    for (const status of ['pending', 'won', 'lost', 'abandoned', 'draft']) {
      const m = deadlineMutationsForOutcome({ ...BASE, status }, [activeWindow()], TODAY)
      expect(m.create).toHaveLength(0)
      expect(m.satisfyIds).toEqual([])
    }
  })
})

describe('sweepReclassify', () => {
  it('expires past-due active deadlines', () => {
    expect(sweepReclassify({ dueDate: '2026-07-12', urgency: 'critical', status: 'active' }, TODAY)).toEqual({
      status: 'expired',
    })
  })
  it('recomputes urgency as the date approaches', () => {
    expect(sweepReclassify({ dueDate: '2026-07-20', urgency: 'high', status: 'active' }, TODAY)).toEqual({
      urgency: 'critical',
    })
  })
  it('returns null when nothing changes or the row is not active', () => {
    expect(sweepReclassify({ dueDate: '2026-07-20', urgency: 'critical', status: 'active' }, TODAY)).toBeNull()
    expect(sweepReclassify({ dueDate: '2026-07-01', urgency: 'high', status: 'satisfied' }, TODAY)).toBeNull()
  })
})
