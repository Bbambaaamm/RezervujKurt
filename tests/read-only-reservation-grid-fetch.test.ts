import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

function createJsonResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('getReservationsReadOnly: používá session token a endpoint obsahuje date + status pending/approved + order', async () => {
  const requested = { url: '', auth: '' };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requested.url = String(input);
    requested.auth = String(init?.headers && (init.headers as Record<string, string>).Authorization);
    return createJsonResponse('[]');
  };

  const { getReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getReservationsReadOnly('2026-05-20', 'session-token');

  assert.deepEqual(result, []);

  const parsedUrl = new URL(requested.url);
  assert.equal(parsedUrl.searchParams.get('reservation_date'), 'eq.2026-05-20');
  assert.equal(parsedUrl.searchParams.get('status'), 'in.(pending,approved)');
  assert.equal(parsedUrl.searchParams.get('order'), 'time_from.asc');
  assert.equal(requested.auth, 'Bearer session-token');
});
