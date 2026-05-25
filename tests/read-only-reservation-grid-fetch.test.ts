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

test('getReservationsReadOnly: používá public occupancy endpoint bez user filtru a jen minimální pole', async () => {
  const requested = { url: '', auth: '', apikey: '' };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requested.url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requested.auth = String(headers.Authorization ?? '');
    requested.apikey = String(headers.apikey ?? '');
    return createJsonResponse('[]');
  };

  const { getReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getReservationsReadOnly('2026-05-20');

  assert.deepEqual(result, []);

  const parsedUrl = new URL(requested.url);
  assert.equal(parsedUrl.pathname, '/rest/v1/reservation_public_occupancy');
  assert.equal(parsedUrl.searchParams.get('select'), 'court_id,reservation_date,time_from,time_to,status');
  assert.equal(parsedUrl.searchParams.get('reservation_date'), 'eq.2026-05-20');
  assert.equal(parsedUrl.searchParams.get('status'), 'in.(pending,approved)');
  assert.equal(parsedUrl.searchParams.get('order'), 'time_from.asc');
  assert.equal(parsedUrl.searchParams.get('user_id'), null);
  assert.equal(requested.auth, 'Bearer anon-key');
  assert.equal(requested.apikey, 'anon-key');
});
