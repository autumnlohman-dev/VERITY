import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractEOBLineItems } from '../extractor'
import { extractEOBToCBS, EOBExtractionError } from '../eobExtractor'
import { boundedMessage } from '../../ai/phiBoundary'

// The vision call and the HEIC boundary are mocked so these tests exercise the
// pure parse/guard/logging behavior of extractEOBToCBS without network or SDKs.
vi.mock('../../ai/phiBoundary', () => ({
  boundedMessage: vi.fn(),
}))
vi.mock('../../heic', () => ({
  normalizeForExtraction: vi.fn(async (base64: string, ext: string) => ({ base64, ext })),
}))

const mockedBoundedMessage = vi.mocked(boundedMessage)

function visionReturns(text: string) {
  mockedBoundedMessage.mockResolvedValue({
    content: [{ type: 'text', text }],
  } as Awaited<ReturnType<typeof boundedMessage>>)
}

const CANONICAL_HEADER =
  'claim_ref | service_description | service_date | amount_billed | allowed_amount | patient_responsibility | flag'

const CANONICAL_TABLE = [
  'Claim Number: ABC-123',
  CANONICAL_HEADER,
  'ABC-123 | Laboratory Services | 03/14/2025 | 268.00 | 120.00 | 45.00 |',
  'ABC-123 | Medical Visits | 03/14/2025 | 410.00 | 300.00 | 60.00 | Not payable with the diagnosis billed',
].join('\n')

// A canonical header with NO data rows beneath it, followed by loose (non-pipe)
// lines the fallback parser can read: date + billed + allowed amounts.
const HEADER_NO_ROWS_WITH_LOOSE_LINES = [
  CANONICAL_HEADER,
  '03/14/2025 Laboratory Services 268.00 120.00',
].join('\n')

describe('extractEOBLineItems (parser fallback)', () => {
  it('parses the canonical table when data rows are present', () => {
    const items = extractEOBLineItems(CANONICAL_TABLE)
    expect(items).toHaveLength(2)
    expect(items[0].billedAmount).toBe(268)
    expect(items[0].allowedAmount).toBe(120)
    expect(items[0].patientResponsibility).toBe(45)
    expect(items[0].serviceDate).toBe('2025-03-14')
    expect(items[1].status).toBe('denied')
  })

  it('falls back to the loose parser when the header is present but has zero data rows', () => {
    // parseCanonicalEOBTable returns [] (not null) here; a `??` fallback would
    // keep the empty result. The length check must hand off to the loose parser.
    const items = extractEOBLineItems(HEADER_NO_ROWS_WITH_LOOSE_LINES)
    expect(items).toHaveLength(1)
    expect(items[0].billedAmount).toBe(268)
    expect(items[0].allowedAmount).toBe(120)
    expect(items[0].serviceDate).toBe('2025-03-14')
  })

  it('returns empty when neither parser finds a line', () => {
    expect(extractEOBLineItems(CANONICAL_HEADER)).toHaveLength(0)
    expect(extractEOBLineItems('')).toHaveLength(0)
  })
})

describe('extractEOBToCBS (empty-result guard + PHI-safe logging)', () => {
  beforeEach(() => {
    mockedBoundedMessage.mockReset()
  })

  it('happy path: canonical transcription yields a CBS with line items', async () => {
    visionReturns(CANONICAL_TABLE)
    const cbs = await extractEOBToCBS('ZmFrZQ==', 'png', 'eob_test')
    expect(cbs.sourceDocumentType).toBe('eob')
    expect(cbs.lineItems).toHaveLength(2)
    expect(cbs.lineItems[0].allowedAmount).toBe(120)
  })

  it('header-but-no-rows transcription still succeeds via the loose parser', async () => {
    visionReturns(HEADER_NO_ROWS_WITH_LOOSE_LINES)
    const cbs = await extractEOBToCBS('ZmFrZQ==', 'png', 'eob_test')
    expect(cbs.lineItems).toHaveLength(1)
    expect(cbs.lineItems[0].billedAmount).toBe(268)
  })

  it('throws a typed EOBExtractionError when both parsers produce zero line items', async () => {
    visionReturns('')
    const err = await extractEOBToCBS('ZmFrZQ==', 'png', 'eob_test').catch((e) => e)
    expect(err).toBeInstanceOf(EOBExtractionError)
    expect((err as Error).name).toBe('EOBExtractionError')
  })

  it('throws EOBExtractionError on a header-only transcription with no parseable lines', async () => {
    visionReturns(CANONICAL_HEADER)
    await expect(extractEOBToCBS('ZmFrZQ==', 'png', 'eob_test')).rejects.toThrow(
      EOBExtractionError
    )
  })

  it('logs shape metrics only, never transcription content', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      visionReturns(CANONICAL_TABLE)
      await extractEOBToCBS('ZmFrZQ==', 'png', 'eob_test')
      const logged = infoSpy.mock.calls.map((c) => c.join(' ')).join('\n')
      // Shape metrics present: character count, line count, header detection.
      expect(logged).toContain(`transcriptionLength=${CANONICAL_TABLE.length}`)
      expect(logged).toContain(`transcriptionLines=${CANONICAL_TABLE.split('\n').length}`)
      expect(logged).toContain('canonicalHeaderFound=true')
      expect(logged).toContain('parsedLineItems=2')
      // No transcription content: none of the document's cell values may leak.
      expect(logged).not.toContain('Laboratory')
      expect(logged).not.toContain('ABC-123')
      expect(logged).not.toContain('268.00')
    } finally {
      infoSpy.mockRestore()
    }
  })
})
