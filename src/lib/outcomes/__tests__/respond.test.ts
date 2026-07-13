import { describe, it, expect } from 'vitest'
import { validateResponseUpdate } from '../respond'

const SENT = { sentAt: '2026-07-10T18:30:00.000Z', disputedAmount: 1340 }

describe('validateResponseUpdate (server-side response rules)', () => {
  it('rejects rows that were never dispatched', () => {
    const v = validateResponseUpdate(
      { result: 'denied', responseAt: '2026-07-12' },
      { sentAt: null, disputedAmount: null }
    )
    expect(v.ok).toBe(false)
  })

  it('rejects unknown results', () => {
    const v = validateResponseUpdate({ result: 'won', responseAt: '2026-07-12' }, SENT)
    expect(v.ok).toBe(false)
  })

  it('rejects a response date before the mail date, with a clear message', () => {
    const v = validateResponseUpdate({ result: 'denied', responseAt: '2026-07-09' }, SENT)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain('2026-07-10')
  })

  it('accepts a response on the same day the letter was mailed', () => {
    const v = validateResponseUpdate({ result: 'denied', responseAt: '2026-07-10' }, SENT)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.update.status).toBe('denied')
      expect(v.update.response_received_at).not.toBeNull()
      expect(v.update.amount_recovered).toBeNull()
    }
  })

  it('requires a non-negative amount for resolved and partial', () => {
    expect(validateResponseUpdate({ result: 'resolved', responseAt: '2026-07-12' }, SENT).ok).toBe(false)
    expect(
      validateResponseUpdate({ result: 'partial', responseAt: '2026-07-12', amountRecovered: -5 }, SENT).ok
    ).toBe(false)
  })

  it('persists a partial recovery amount below the disputed bound', () => {
    const v = validateResponseUpdate(
      { result: 'partial', responseAt: '2026-07-12', amountRecovered: 150 },
      SENT
    )
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.update.status).toBe('partial')
      expect(v.update.amount_recovered).toBe(150)
    }
  })

  it('rejects a partial recovery at or above the disputed amount', () => {
    const v = validateResponseUpdate(
      { result: 'partial', responseAt: '2026-07-12', amountRecovered: 1340 },
      SENT
    )
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain('Resolved in full')
  })

  it('skips the partial bound when no disputed figure is available', () => {
    const v = validateResponseUpdate(
      { result: 'partial', responseAt: '2026-07-12', amountRecovered: 99999 },
      { ...SENT, disputedAmount: null }
    )
    expect(v.ok).toBe(true)
  })

  it('allows resolved-in-full at any non-negative amount (no partial bound)', () => {
    const v = validateResponseUpdate(
      { result: 'resolved', responseAt: '2026-07-12', amountRecovered: 1340 },
      SENT
    )
    expect(v.ok).toBe(true)
  })

  it('no_response records the status with no response date or amount', () => {
    const v = validateResponseUpdate({ result: 'no_response', responseAt: '' }, SENT)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.update.status).toBe('no_response')
      expect(v.update.response_received_at).toBeNull()
      expect(v.update.amount_recovered).toBeNull()
    }
  })

  it('trims and caps the summary', () => {
    const v = validateResponseUpdate(
      { result: 'denied', responseAt: '2026-07-12', responseSummary: '  they removed the duplicate 80053 charge  ' },
      SENT
    )
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.update.response_summary).toBe('they removed the duplicate 80053 charge')
  })
})
