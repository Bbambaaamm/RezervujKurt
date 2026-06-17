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

test('getMyReservationsReadOnly: endpoint obsahuje filter user_id a ordering', async () => {
  ensureTestAliasBridge();

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return createJsonResponse('[]');
  };

  const { getMyReservationsReadOnly } = await import('../lib/services/read-only');

  const result = await getMyReservationsReadOnly({
    access_token: 'test-access-token',
    user: {
      id: 'user-123',
      email: 'user@example.com',
    },
  });

  assert.deepEqual(result, []);
  assert.equal(requestedUrls.length, 1);

  const requestUrl = new URL(requestedUrls[0]);
  assert.equal(requestUrl.searchParams.get('user_id'), 'eq.user-123');
  assert.equal(requestUrl.searchParams.get('order'), 'reservation_date.desc,time_from.desc');
});

test('getMyReservationsReadOnly: anonymous session vrací unauthorized guard', async () => {
  ensureTestAliasBridge();

  const { getMyReservationsReadOnly } = await import('../lib/services/read-only');

  await assert.rejects(
    () => getMyReservationsReadOnly(null),
    (error: unknown) => error instanceof Error && error.message.includes('potřeba přihlášení'),
  );
});
