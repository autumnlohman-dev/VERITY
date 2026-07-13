import { describe, it, expect } from 'vitest'
import { buildDispatchOutcomeRow, markParentEscalated } from '../dispatch'

describe('buildDispatchOutcomeRow (Lob dispatch bookkeeping)', () => {
  const base = {
    caseId: 'case-uuid-1',
    userId: 'user-uuid-1',
    letterRowId: 'letter-uuid-1',
    lobLetterId: 'ltr_abc123',
    letterVersion: 4,
    sentAt: '2026-07-13T10:00:00.000Z',
    recipientName: 'City Medical Center Billing',
  }

  it('maps every field and stamps the sent dispatch state', () => {
    const row = buildDispatchOutcomeRow(base)
    expect(row).toEqual({
      case_id: 'case-uuid-1',
      user_id: 'user-uuid-1',
      letter_id: 'letter-uuid-1',
      lob_letter_id: 'ltr_abc123',
      letter_version: '4',
      sent_at: '2026-07-13T10:00:00.000Z',
      recipient_type: 'provider',
      recipient_name: 'City Medical Center Billing',
      status: 'sent',
      escalation_level: 'first_dispute',
      parent_outcome_id: null,
      updated_at: '2026-07-13T10:00:00.000Z',
    })
  })

  it('tolerates a legacy letter without id or version', () => {
    const row = buildDispatchOutcomeRow({ ...base, letterRowId: null, letterVersion: null, recipientName: null })
    expect(row.letter_id).toBeNull()
    expect(row.letter_version).toBeNull()
    expect(row.recipient_name).toBeNull()
    // The dispatch facts must survive regardless.
    expect(row.status).toBe('sent')
    expect(row.lob_letter_id).toBe('ltr_abc123')
    expect(row.sent_at).toBe(base.sentAt)
  })

  it('stringifies numeric letter versions including zero', () => {
    expect(buildDispatchOutcomeRow({ ...base, letterVersion: 0 }).letter_version).toBe('0')
  })

  it('maps escalation letter types to their recipient_type and escalation_level (D2)', () => {
    const cases: Array<[string, string]> = [
      ['first_dispute', 'provider'],
      ['appeal', 'provider'],
      ['regulator_complaint', 'regulator'],
      ['credit_bureau_dispute', 'credit_bureau'],
      ['collector_dispute', 'collector'],
    ]
    for (const [letterType, recipient] of cases) {
      const row = buildDispatchOutcomeRow({ ...base, letterType })
      expect(row.recipient_type).toBe(recipient)
      expect(row.escalation_level).toBe(letterType)
      expect(row.status).toBe('sent')
    }
    // Unknown/absent letter types fall back to the first-dispute defaults.
    expect(buildDispatchOutcomeRow({ ...base, letterType: 'mystery' }).recipient_type).toBe('provider')
    expect(buildDispatchOutcomeRow({ ...base }).escalation_level).toBe('first_dispute')
  })

  it('carries parent_outcome_id from the draft linkage; null for first letters (step 5)', () => {
    expect(buildDispatchOutcomeRow({ ...base, letterType: 'appeal', parentOutcomeId: 'parent-1' }).parent_outcome_id).toBe('parent-1')
    expect(buildDispatchOutcomeRow({ ...base }).parent_outcome_id).toBeNull()
  })
})

describe('markParentEscalated (step 5, A3/A4)', () => {
  // The regression the old case-wide heuristic would have caused: a case with
  // TWO escalatable dispatches (a denied provider dispute and a no_response
  // collector dispute). Escalating from the first must touch ONLY the first.
  function fakeDb() {
    const rows = [
      { id: 'outcome-denied-provider', status: 'denied' },
      { id: 'outcome-noresponse-collector', status: 'no_response' },
    ]
    const client = {
      from: (table: string) => ({
        update: (values: Record<string, unknown>) => ({
          eq: async (col: string, val: string) => {
            if (table !== 'dispute_outcomes' || col !== 'id') throw new Error('unexpected query shape')
            for (const r of rows) if (r.id === val) r.status = String(values.status)
            return { error: null }
          },
        }),
      }),
    }
    return { client, rows }
  }

  it('marks exactly the parent row escalated; the other escalatable row is untouched', async () => {
    const { client, rows } = fakeDb()
    const err = await markParentEscalated(client, 'outcome-denied-provider', '2026-07-14T00:00:00.000Z')
    expect(err).toBeNull()
    expect(rows[0].status).toBe('escalated')
    expect(rows[1].status).toBe('no_response') // untouched — the heuristic would have flipped this too
  })
})
