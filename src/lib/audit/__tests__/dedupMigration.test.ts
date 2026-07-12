import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { absorbDuplicateUpload } from '../dedup'
import type { FullAuditResult } from '../deterministicCore'
import { markLettersStaleIfChanged } from '../../letters/staleness'

// Staleness marking hits its own tables; stub it so the fake client below only
// has to model the `cases` operations the helper performs.
vi.mock('../../letters/staleness', () => ({
  auditSnapshotFingerprint: vi.fn(() => 'fp'),
  markLettersStaleIfChanged: vi.fn(async () => {}),
}))

const mockedMarkStale = vi.mocked(markLettersStaleIfChanged)

function freshResult(overrides: Partial<FullAuditResult> = {}): FullAuditResult {
  return {
    errors: [],
    lineItems: [],
    normalizedCbs: { documents: [] } as unknown as FullAuditResult['normalizedCbs'],
    provider: 'City Medical Center',
    dateOfService: '2025-03-14',
    totalBilled: 4827,
    totalExpected: 3487,
    potentialSavings: 1340,
    errorCount: 2,
    needsReviewCount: 0,
    hasEob: true,
    eobError: false,
    lowConfidence: [],
    billPatientResponsibility: 3641,
    eobPatientResponsibility: 3487,
    suspectedPartialRead: false,
    ...overrides,
  }
}

interface FakeCalls {
  updates: Array<Record<string, unknown>>
  deletedIds: string[]
}

// Minimal chainable stand-in for the three `cases` operations the helper runs:
// select→eq→eq→single, update→eq→eq, delete→eq→eq.
function fakeSupabase(opts: {
  survivorBillData?: Record<string, unknown> | null
  updateError?: { message: string } | null
}): { client: SupabaseClient; calls: FakeCalls } {
  const calls: FakeCalls = { updates: [], deletedIds: [] }
  const client = {
    from(table: string) {
      if (table !== 'cases') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: { bill_data: opts.survivorBillData ?? {}, provider_name: 'City Medical Center' },
              }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          calls.updates.push(payload)
          return { eq: () => ({ eq: async () => ({ error: opts.updateError ?? null }) }) }
        },
        delete: () => ({
          eq: (_col: string, id: string) => ({
            eq: async () => {
              calls.deletedIds.push(id)
              return { error: null }
            },
          }),
        }),
      }
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const BASE_PARAMS = {
  userId: 'user-1',
  shellCaseId: 'shell-1',
  survivorCaseId: 'survivor-1',
  eobPageRefs: ['user-1/eob-page-1.jpg', 'user-1/eob-page-2.jpg'],
  eobMergedPath: 'user-1/123-eob-merged.pdf',
}

describe('absorbDuplicateUpload (dedup EOB migration)', () => {
  beforeEach(() => {
    mockedMarkStale.mockClear()
  })

  it('migrates EOB results and document references onto the surviving case, then deletes the shell', async () => {
    const { client, calls } = fakeSupabase({ survivorBillData: { hasEob: false } })
    const out = await absorbDuplicateUpload(client, { ...BASE_PARAMS, result: freshResult() })

    expect(out).toEqual({ outcome: 'absorbed', migratedEob: true })
    expect(calls.updates).toHaveLength(1)
    const billData = calls.updates[0].bill_data as Record<string, unknown>
    expect(billData.hasEob).toBe(true)
    expect(billData.eobPages).toEqual(BASE_PARAMS.eobPageRefs)
    expect(billData.eobMergedPath).toBe(BASE_PARAMS.eobMergedPath)
    expect(billData.eobPatientResponsibility).toBe(3487)
    expect(calls.deletedIds).toEqual(['shell-1'])
    expect(mockedMarkStale).toHaveBeenCalledTimes(1)
  })

  it('migrates a failed EOB read (eobError) so the survivor surfaces the notice', async () => {
    const { client, calls } = fakeSupabase({ survivorBillData: {} })
    const out = await absorbDuplicateUpload(client, {
      ...BASE_PARAMS,
      result: freshResult({ hasEob: false, eobError: true }),
    })

    expect(out.outcome).toBe('absorbed')
    const billData = calls.updates[0].bill_data as Record<string, unknown>
    expect(billData.eobError).toBe(true)
    expect(calls.deletedIds).toEqual(['shell-1'])
  })

  it('preserves the shell case when migration fails', async () => {
    const { client, calls } = fakeSupabase({
      survivorBillData: {},
      updateError: { message: 'row locked' },
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const out = await absorbDuplicateUpload(client, { ...BASE_PARAMS, result: freshResult() })
      expect(out.outcome).toBe('migration_failed')
      // The shell must NOT be deleted — it is the only case holding the EOB.
      expect(calls.deletedIds).toEqual([])
      expect(mockedMarkStale).not.toHaveBeenCalled()
    } finally {
      errSpy.mockRestore()
    }
  })

  it('never downgrades a survivor that already has an EOB-validated audit', async () => {
    const { client, calls } = fakeSupabase({ survivorBillData: { hasEob: true } })
    const out = await absorbDuplicateUpload(client, { ...BASE_PARAMS, result: freshResult() })

    expect(out).toEqual({ outcome: 'absorbed', migratedEob: false })
    expect(calls.updates).toHaveLength(0)
    expect(calls.deletedIds).toEqual(['shell-1'])
  })

  it('skips migration entirely for a bill-only re-upload', async () => {
    const { client, calls } = fakeSupabase({ survivorBillData: {} })
    const out = await absorbDuplicateUpload(client, {
      ...BASE_PARAMS,
      result: freshResult({ hasEob: false, eobError: false }),
    })

    expect(out).toEqual({ outcome: 'absorbed', migratedEob: false })
    expect(calls.updates).toHaveLength(0)
    expect(calls.deletedIds).toEqual(['shell-1'])
  })
})
