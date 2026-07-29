import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

function ensureTestAliasBridge() {
  const moduleDir = path.join(process.cwd(), 'node_modules', '@', 'lib', 'supabase');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(
    path.join(moduleDir, 'client.js'),
    "module.exports = require('../../../../.tmp-tests/lib/supabase/client.js');\n",
  );
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('getPendingReservationsReadOnlyWithSession: endpoint má pending filtr, ordering a bez user_id filtru', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getPendingReservationsReadOnlyWithSession } = await import('../lib/services/read-only');

  const result = await getPendingReservationsReadOnlyWithSession('access-token');

  assert.deepEqual(result, []);
  assert.equal(requestedUrls.length, 1);

  const pendingRequestUrl = new URL(requestedUrls[0]);
  assert.equal(pendingRequestUrl.searchParams.get('status'), 'eq.pending');
  assert.equal(pendingRequestUrl.searchParams.get('order'), 'created_at.asc.nullslast,reservation_date.asc,time_from.asc');
  assert.equal(pendingRequestUrl.searchParams.has('user_id'), false);
});

test('getAdminReservationsReadOnlyWithSession: endpoint řadí podle termínu a neomezuje data před rozdělením', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getAdminReservationsReadOnlyWithSession } = await import('../lib/services/read-only');

  const defaultResult = await getAdminReservationsReadOnlyWithSession('access-token');
  assert.deepEqual(defaultResult, []);

  const defaultRequestUrl = new URL(requestedUrls[0]);
  assert.equal(defaultRequestUrl.searchParams.get('order'), 'reservation_date.desc,time_from.desc');
  assert.equal(defaultRequestUrl.searchParams.has('limit'), false);
  assert.equal(defaultRequestUrl.searchParams.has('user_id'), false);
});

test('getPendingReservationsReadOnlyWithSession: mapper nezahodí rezervaci bez profilu a použije fallback Uživatel', async () => {
  ensureTestAliasBridge();

  const responses = [
    [{ id: 'r1', reservation_date: '2026-05-20', time_from: '10:00:00', time_to: '11:00:00', created_at: '2026-05-20T09:00:00Z', status: 'pending', court_id: 1, user_id: 'user-1' }],
    [{ id: 1, name: 'Kurt A' }],
    [],
  ];

  globalThis.fetch = async () => createJsonResponse(JSON.stringify(responses.shift() ?? []));

  const { getPendingReservationsReadOnlyWithSession } = await import('../lib/services/read-only');
  const { getReservationUserLabel } = await import('../lib/services/reservation-overview-ui');

  const result = await getPendingReservationsReadOnlyWithSession('access-token');

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'r1');
  assert.equal(getReservationUserLabel(result[0]), 'Uživatel');
});


test('getMyReservationsReadOnly: endpoint řadí moje rezervace od nejnovějšího termínu', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getMyReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getMyReservationsReadOnly({ access_token: 'access-token', user: { id: 'user-1' } });

  assert.deepEqual(result, []);
  assert.equal(requestedUrls.length, 1);

  const requestUrl = new URL(requestedUrls[0]);
  assert.equal(requestUrl.searchParams.get('order'), 'reservation_date.desc,time_from.desc');
});

test('getMyReservationsReadOnly: doplní název kurtu z public.courts.name podle court_id', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  const responses = [
    [{ id: 'r1', reservation_date: '2026-06-16', time_from: '10:00:00', time_to: '11:00:00', created_at: '2026-06-16T09:00:00Z', status: 'approved', note: null, court_id: 1, user_id: 'user-1' }],
    [{ id: 1, name: 'Zelená', surface: 'antuka', is_active: true }],
  ];

  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse(JSON.stringify(responses.shift() ?? []));
  };

  const { getMyReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getMyReservationsReadOnly({ access_token: 'access-token', user: { id: 'user-1' } });

  assert.equal(result.length, 1);
  assert.equal(result[0].courtName, 'Zelená');
  assert.equal(requestedUrls.length, 2);
  assert.equal(new URL(requestedUrls[0]).pathname, '/rest/v1/reservations');
  assert.equal(new URL(requestedUrls[1]).pathname, '/rest/v1/courts');
  assert.equal(new URL(requestedUrls[1]).searchParams.get('select'), 'id,name');
  assert.equal(new URL(requestedUrls[1]).searchParams.get('id'), 'in.(1)');
  assert.equal(new URL(requestedUrls[1]).searchParams.get('is_active'), null);
});

test('getMyReservationsReadOnly: při selhání lookupu kurtů nespadne a použije fallback', async () => {
  ensureTestAliasBridge();

  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) {
      return createJsonResponse(JSON.stringify([
        { id: 'r1', reservation_date: '2026-06-16', time_from: '10:00:00', time_to: '11:00:00', created_at: '2026-06-16T09:00:00Z', status: 'approved', note: null, court_id: 7, user_id: 'user-1' },
      ]));
    }

    return new Response('{"message":"courts unavailable"}', { status: 500, headers: { 'content-type': 'application/json' } });
  };

  const { getMyReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getMyReservationsReadOnly({ access_token: 'access-token', user: { id: 'user-1' } });

  assert.equal(result.length, 1);
  assert.equal(result[0].courtName, 'Kurt #7');
});

test('getMyReservationsReadOnly: při chybějícím court_id v courts použije fallback', async () => {
  ensureTestAliasBridge();

  const responses = [
    [{ id: 'r1', reservation_date: '2026-06-16', time_from: '10:00:00', time_to: '11:00:00', created_at: '2026-06-16T09:00:00Z', status: 'approved', note: null, court_id: 9, user_id: 'user-1' }],
    [{ id: 1, name: 'Zelená', surface: 'antuka', is_active: true }],
  ];

  globalThis.fetch = async () => createJsonResponse(JSON.stringify(responses.shift() ?? []));

  const { getMyReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getMyReservationsReadOnly({ access_token: 'access-token', user: { id: 'user-1' } });

  assert.equal(result.length, 1);
  assert.equal(result[0].courtName, 'Kurt #9');
});

test('getPendingReservationsReadOnlyWithSession: admin přehled použije aktuální název z courts.name', async () => {
  ensureTestAliasBridge();

  const responses = [
    [{ id: 'r1', reservation_date: '2026-06-16', time_from: '10:00:00', time_to: '11:00:00', created_at: '2026-06-16T09:00:00Z', status: 'pending', court_id: 1, user_id: 'user-1' }],
    [{ id: 1, name: 'Zelená' }],
    [{ id: 'user-1', full_name: 'Jan Novák', email: 'jan@example.test' }],
  ];

  globalThis.fetch = async () => createJsonResponse(JSON.stringify(responses.shift() ?? []));

  const { getPendingReservationsReadOnlyWithSession } = await import('../lib/services/read-only');
  const result = await getPendingReservationsReadOnlyWithSession('access-token');

  assert.equal(result.length, 1);
  assert.equal(result[0].courtName, 'Zelená');
});
