/**
 * checkRateLimit unit test — mocks the Supabase admin client so the
 * count-vs-limit decision and the fail-open behavior are verified without a
 * live database. (The four newly-limited routes — copilot, redeem-promo,
 * upload-url, generate-letter — all ride this exact function, so proving the
 * threshold here proves each route 429s past its limit.)
 */
import { describe, it, expect, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

import { checkRateLimit } from '../rateLimit';

// NOTE: deliberately no beforeEach(mockClear/mockReset) — under vitest 4.1.8 a
// hook that touches this mock makes the mock-throw in the last test surface as
// an out-of-band test failure even though the SUT catches it. Each test sets
// its own implementation, and the args assertion targets a unique bucket, so
// call-history isolation isn't needed.

describe('checkRateLimit', () => {
  it('allows while the window count is at or under the limit', async () => {
    rpcMock.mockResolvedValue({ data: 5, error: null });
    const r = await checkRateLimit({ bucket: 'copilot:ip:1.2.3.4', limit: 15, windowSeconds: 600 });
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(5);
  });

  it('allows the exact limit-th call and blocks the one after', async () => {
    rpcMock.mockResolvedValueOnce({ data: 15, error: null });
    expect((await checkRateLimit({ bucket: 'copilot:ip:1.2.3.4', limit: 15, windowSeconds: 600 })).allowed).toBe(true);
    rpcMock.mockResolvedValueOnce({ data: 16, error: null });
    expect((await checkRateLimit({ bucket: 'copilot:ip:1.2.3.4', limit: 15, windowSeconds: 600 })).allowed).toBe(false);
  });

  it('passes the bucket through to the rate_limit_hit RPC', async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    await checkRateLimit({ bucket: 'promo:user-1', limit: 5, windowSeconds: 3600 });
    expect(rpcMock).toHaveBeenCalledWith('rate_limit_hit', {
      p_bucket: 'promo:user-1',
      p_window_seconds: 3600,
    });
  });

  it('fails open on RPC error (matches the existing limited routes)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const r = await checkRateLimit({ bucket: 'letter:user-1', limit: 20, windowSeconds: 3600 });
    expect(r.allowed).toBe(true);
  });

  it('fails open when the client itself throws', async () => {
    rpcMock.mockImplementation(() => {
      throw new Error('network');
    });
    let threw: unknown = null;
    let r: Awaited<ReturnType<typeof checkRateLimit>> | undefined;
    try {
      r = await checkRateLimit({ bucket: 'upload-url:ip:1.2.3.4', limit: 30, windowSeconds: 600 });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBe(null);
    expect(r?.allowed).toBe(true);
  });
});
