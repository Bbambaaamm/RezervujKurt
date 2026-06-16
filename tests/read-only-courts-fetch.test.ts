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

test('getCourtsReadOnly: používá anonymní courts endpoint bez user/profile filtru a mapuje aktivní kurty', async () => {
  const requested = { url: '', auth: '', apikey: '' };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requested.url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requested.auth = String(headers.Authorization ?? '');
    requested.apikey = String(headers.apikey ?? '');

    return createJsonResponse('[{"id":1,"name":"Zelená","surface":"antuka","is_active":true}]');
  };

  const { getCourtsReadOnly } = await import('../lib/services/read-only');
  const result = await getCourtsReadOnly();

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].name, 'Zelená');

  const parsedUrl = new URL(requested.url);
  assert.equal(parsedUrl.pathname, '/rest/v1/courts');
  assert.equal(parsedUrl.searchParams.get('select'), 'id,name,surface,is_active');
  assert.equal(parsedUrl.searchParams.get('is_active'), 'eq.true');
  assert.equal(parsedUrl.searchParams.get('order'), 'id.asc');
  assert.equal(parsedUrl.searchParams.get('user_id'), null);
  assert.equal(parsedUrl.searchParams.get('profiles'), null);
  assert.equal(requested.auth, 'Bearer anon-key');
  assert.equal(requested.apikey, 'anon-key');
});
