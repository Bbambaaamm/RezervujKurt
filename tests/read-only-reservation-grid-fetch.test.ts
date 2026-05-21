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

test('getReservationsReadOnly: používá anonymní read endpoint bez user filtru a načítá jen occupancy sloupce', async () => {
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
  assert.equal(parsedUrl.searchParams.get('reservation_date'), 'eq.2026-05-20');
  assert.equal(parsedUrl.searchParams.get('status'), 'in.(pending,approved)');
  assert.equal(parsedUrl.searchParams.get('order'), 'time_from.asc');
  assert.equal(parsedUrl.searchParams.get('select'), 'id,court_id,reservation_date,time_from,time_to,status,created_at');
  assert.equal(parsedUrl.searchParams.get('user_id'), null);
  assert.equal(requested.auth, 'Bearer anon-key');
  assert.equal(requested.apikey, 'anon-key');
});

test('getReservationsReadOnly: mapuje pending occupancy pro grid a nezávisí na profile datech', async () => {
  globalThis.fetch = async () => createJsonResponse(JSON.stringify([
    {
      id: 'res-1',
      court_id: 2,
      reservation_date: '2026-05-21',
      time_from: '16:00:00',
      time_to: '18:00:00',
      status: 'pending',
      created_at: '2026-05-20T08:00:00Z',
    },
  ]));

  const { getReservationsReadOnly } = await import('../lib/services/read-only');
  const [result] = await getReservationsReadOnly('2026-05-21');

  assert.equal(result.id, 'res-1');
  assert.equal(result.courtId, 2);
  assert.equal(result.date, '2026-05-21');
  assert.equal(result.fromHour, 16);
  assert.equal(result.toHour, 18);
  assert.equal(result.status, 'cekajici');
});
