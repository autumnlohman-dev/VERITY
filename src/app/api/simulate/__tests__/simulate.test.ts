/**
 * Auth-gate tests for /api/simulate and /api/cron/recompute-storm-index.
 * No live session or DB required — tests the 401 paths only.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock next/headers before importing routes ─────────────────────────────────
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [],
      set: () => {},
    }),
}));

// ── Mock @supabase/ssr so we can control auth.getUser() ──────────────────────
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  }),
}));

// Set env vars required by route files
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL     = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY     = 'service-key';
  process.env.CRON_SECRET                   = 'test-cron-secret';
});

// ── /api/simulate → 401 with no auth ─────────────────────────────────────────
describe('POST /api/simulate', () => {
  it('returns 401 when no session', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/simulate', {
      method: 'POST',
      body: JSON.stringify({
        household_id: '00000000-0000-0000-0000-000000000001',
        projected_claim: { member_id: '00000000-0000-0000-0000-000000000002', cpt_codes: [] },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });
});

// ── /api/cron/recompute-storm-index → 401 without CRON_SECRET ────────────────
describe('GET /api/cron/recompute-storm-index', () => {
  it('returns 401 with no Authorization header', async () => {
    const { GET } = await import('../../cron/recompute-storm-index/route');
    const req = new NextRequest(
      'http://localhost/api/cron/recompute-storm-index',
      { method: 'GET' },
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const { GET } = await import('../../cron/recompute-storm-index/route');
    const req = new NextRequest(
      'http://localhost/api/cron/recompute-storm-index',
      { method: 'GET', headers: { authorization: 'Bearer wrong-secret' } },
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
