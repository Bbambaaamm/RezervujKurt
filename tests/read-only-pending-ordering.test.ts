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
