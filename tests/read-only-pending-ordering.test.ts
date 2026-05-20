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

test('getRecentReservationsReadOnlyWithSession: endpoint obsahuje ordering created_at desc, limit a bez user_id filtru', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getRecentReservationsReadOnlyWithSession } = await import('../lib/services/read-only');

  const defaultResult = await getRecentReservationsReadOnlyWithSession('access-token');
  assert.deepEqual(defaultResult, []);

  const defaultRequestUrl = new URL(requestedUrls[0]);
  assert.equal(defaultRequestUrl.searchParams.get('order'), 'created_at.desc');
  assert.equal(defaultRequestUrl.searchParams.get('limit'), '20');
  assert.equal(defaultRequestUrl.searchParams.has('user_id'), false);

  requestedUrls.length = 0;

  const clampedResult = await getRecentReservationsReadOnlyWithSession('access-token', 999);
  assert.deepEqual(clampedResult, []);

  const clampedRequestUrl = new URL(requestedUrls[0]);
  assert.equal(clampedRequestUrl.searchParams.get('limit'), '50');
});

test('getRecentReservationsReadOnlyWithSession: endpoint validuje nevalidní a hraniční limity', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getRecentReservationsReadOnlyWithSession } = await import('../lib/services/read-only');

  const cases: Array<{ input: number; expectedLimit: string }> = [
    { input: Number.NaN, expectedLimit: '20' },
    { input: Number.POSITIVE_INFINITY, expectedLimit: '20' },
    { input: 0, expectedLimit: '1' },
    { input: -5, expectedLimit: '1' },
  ];

  for (const { input, expectedLimit } of cases) {
    requestedUrls.length = 0;

    const result = await getRecentReservationsReadOnlyWithSession('access-token', input);
    assert.deepEqual(result, []);
    assert.equal(requestedUrls.length, 1);

    const requestUrl = new URL(requestedUrls[0]);
    assert.equal(requestUrl.searchParams.get('limit'), expectedLimit);
  }
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
