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

test('getPendingReservationsReadOnly: endpoint obsahuje stabilní ordering pending rezervací', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getPendingReservationsReadOnly } = await import('../lib/services/read-only');

  const result = await getPendingReservationsReadOnly();

  assert.deepEqual(result, []);
  assert.equal(requestedUrls.length, 1);

  const pendingRequestUrl = new URL(requestedUrls[0]);
  const orderParam = pendingRequestUrl.searchParams.get('order');

  assert.equal(orderParam, 'created_at.asc.nullslast,reservation_date.asc,time_from.asc');

  console.info('pending ordering test passed');
});


test('getRecentReservationsReadOnly: endpoint obsahuje ordering created_at desc a limit', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getRecentReservationsReadOnly } = await import('../lib/services/read-only');

  const defaultResult = await getRecentReservationsReadOnly();
  assert.deepEqual(defaultResult, []);

  const defaultRequestUrl = new URL(requestedUrls[0]);
  assert.equal(defaultRequestUrl.searchParams.get('order'), 'created_at.desc');
  assert.equal(defaultRequestUrl.searchParams.get('limit'), '20');

  requestedUrls.length = 0;

  const clampedResult = await getRecentReservationsReadOnly(999);
  assert.deepEqual(clampedResult, []);

  const clampedRequestUrl = new URL(requestedUrls[0]);
  assert.equal(clampedRequestUrl.searchParams.get('limit'), '50');

  console.info('recent reservations ordering test passed');
});


test('getRecentReservationsReadOnly: endpoint validuje nevalidní a hraniční limity', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getRecentReservationsReadOnly } = await import('../lib/services/read-only');

  const cases: Array<{ input: number; expectedLimit: string }> = [
    { input: Number.NaN, expectedLimit: '20' },
    { input: Number.POSITIVE_INFINITY, expectedLimit: '20' },
    { input: 0, expectedLimit: '1' },
    { input: -5, expectedLimit: '1' },
  ];

  for (const { input, expectedLimit } of cases) {
    requestedUrls.length = 0;

    const result = await getRecentReservationsReadOnly(input);
    assert.deepEqual(result, []);
    assert.equal(requestedUrls.length, 1);

    const requestUrl = new URL(requestedUrls[0]);
    assert.equal(requestUrl.searchParams.get('limit'), expectedLimit);
  }

  console.info('recent reservations invalid limit test passed');
});
