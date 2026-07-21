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

test('getReservationsReadOnly: používá public occupancy endpoint bez user filtru a bez soukromé poznámky', async () => {
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
  assert.equal(parsedUrl.searchParams.get('status'), 'in.(waiting_for_payment,pending,approved)');
  assert.equal(parsedUrl.searchParams.get('order'), 'time_from.asc');
  assert.equal(parsedUrl.searchParams.get('user_id'), null);
  assert.equal(requested.auth, 'Bearer anon-key');
  assert.equal(requested.apikey, 'anon-key');
});


test('getReservationsReadOnly: anonymní veřejný grid nezobrazuje detail čekání na platbu', async () => {
  globalThis.fetch = async () => createJsonResponse(JSON.stringify([
    {
      court_id: 1,
      reservation_date: '2026-05-20',
      time_from: '09:00:00',
      time_to: '10:00:00',
      status: 'waiting_for_payment',
    },
  ]));

  const { getReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getReservationsReadOnly('2026-05-20');

  assert.equal(result[0]?.status, 'potvrzeno');
});

test('getReservationsReadOnly: autorizovaný privátní dotaz doplní poznámku i detail čekání na platbu', async () => {
  const requestedUrls: string[] = [];
  const requestedAuth: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrls.push(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requestedAuth.push(String(headers.Authorization ?? ''));

    const parsedUrl = new URL(String(input));
    if (parsedUrl.pathname === '/rest/v1/reservation_public_occupancy') {
      return createJsonResponse(JSON.stringify([
        {
          court_id: 1,
          reservation_date: '2026-05-20',
          time_from: '09:00:00',
          time_to: '10:00:00',
          status: 'approved',
        },
      ]));
    }

    return createJsonResponse(JSON.stringify([
      {
        court_id: 1,
        reservation_date: '2026-05-20',
        time_from: '09:00:00',
        time_to: '10:00:00',
        status: 'waiting_for_payment',
        note: 'Soukromá poznámka',
      },
    ]));
  };

  const { getReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getReservationsReadOnly('2026-05-20', 'user-token');

  assert.equal(result[0]?.status, 'ceka_na_platbu');
  assert.equal(result[0]?.note, 'Soukromá poznámka');
  assert.equal(new URL(requestedUrls[0]).pathname, '/rest/v1/reservation_public_occupancy');
  assert.equal(new URL(requestedUrls[1]).pathname, '/rest/v1/reservation_member_occupancy_notes');
  assert.equal(new URL(requestedUrls[1]).searchParams.get('select'), 'court_id,reservation_date,time_from,time_to,status,note');
  assert.deepEqual(requestedAuth, ['Bearer anon-key', 'Bearer user-token']);
});
