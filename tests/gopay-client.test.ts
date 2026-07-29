import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GoPayClientConfigurationError,
  GoPayClientError,
  requestGoPayAccessToken,
} from '../lib/services/gopay-client';

const sandboxEnv = {
  PAYMENTS_GOPAY_ENV: 'sandbox',
  GOPAY_CLIENT_ID: 'sandbox-client',
  GOPAY_CLIENT_SECRET: 'sandbox-secret',
};

test('GoPay OAuth používá přesný formulářový kontrakt bez credentials v URL nebo těle', async () => {
  const calls: Array<{
    url: string;
    method: string | undefined;
    headers: Headers;
    body: string;
    cache: RequestCache | undefined;
    signal: AbortSignal | null;
  }> = [];
  const token = await requestGoPayAccessToken(sandboxEnv, async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: String(init?.body),
      cache: init?.cache,
      signal: init?.signal ?? null,
    });
    return new Response(JSON.stringify({ token_type: 'Bearer', access_token: 'access-token', expires_in: 1800 }), { status: 200 });
  });

  assert.deepEqual(token, { accessToken: 'access-token', expiresInSeconds: 1800 });
  const captured = calls[0];
  assert.ok(captured);
  assert.equal(calls.length, 1);
  assert.equal(captured.url, 'https://gw.sandbox.gopay.com/api/oauth2/token');
  assert.equal(captured.method, 'POST');
  assert.equal(captured.headers.get('authorization'), `Basic ${Buffer.from('sandbox-client:sandbox-secret').toString('base64')}`);
  assert.equal(captured.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(captured.headers.get('accept'), 'application/json');
  assert.equal(captured.body, 'grant_type=client_credentials&scope=payment-create');
  assert.equal(captured.cache, 'no-store');
  assert.ok(captured.signal instanceof AbortSignal);
  assert.equal(captured.url.includes('sandbox-client'), false);
  assert.equal(captured.url.includes('sandbox-secret'), false);
  assert.equal(captured.body.includes('sandbox-client'), false);
  assert.equal(captured.body.includes('sandbox-secret'), false);
});

test('GoPay OAuth odděluje explicitní production endpoint a odmítá neznámé prostředí', async () => {
  let url = '';
  await requestGoPayAccessToken({ ...sandboxEnv, PAYMENTS_GOPAY_ENV: 'production' }, async (input) => {
    url = String(input);
    return new Response(JSON.stringify({ token_type: 'Bearer', access_token: 'token', expires_in: 60 }));
  });
  assert.equal(url, 'https://gate.gopay.cz/api/oauth2/token');

  for (const environment of [undefined, '', 'prod', 'https://attacker.example']) {
    await assert.rejects(
      () => requestGoPayAccessToken({ ...sandboxEnv, PAYMENTS_GOPAY_ENV: environment }, async () => new Response('{}')),
      GoPayClientConfigurationError,
    );
  }
});

test('GoPay OAuth validuje credentials a timeout před síťovým voláním', async () => {
  let calls = 0;
  const fetchMock = async () => { calls += 1; return new Response('{}'); };

  for (const env of [
    { ...sandboxEnv, GOPAY_CLIENT_ID: '' },
    { ...sandboxEnv, GOPAY_CLIENT_SECRET: 'secret\nheader' },
  ]) {
    await assert.rejects(() => requestGoPayAccessToken(env, fetchMock), GoPayClientConfigurationError);
  }
  for (const timeoutMs of [0, 99, 30_001, 1.5]) {
    await assert.rejects(() => requestGoPayAccessToken(sandboxEnv, fetchMock, { timeoutMs }), GoPayClientConfigurationError);
  }
  assert.equal(calls, 0);
});

test('GoPay OAuth odmítá neplatné úspěšné odpovědi bez propouštění payloadu', async () => {
  const invalidResponses = [
    {},
    { token_type: 'bearer', access_token: 'token', expires_in: 60 },
    { token_type: 'Basic', access_token: 'token', expires_in: 60 },
    { token_type: 'MAC', access_token: 'token', expires_in: 60 },
    { token_type: '', access_token: 'token', expires_in: 60 },
    { token_type: null, access_token: 'token', expires_in: 60 },
    { token_type: 'Bearer', access_token: '', expires_in: 60 },
    { token_type: 'Bearer', access_token: '   ', expires_in: 60 },
    { token_type: 'Bearer', access_token: 'token with whitespace', expires_in: 60 },
    { token_type: 'Bearer', access_token: 'token', expires_in: 0 },
    { token_type: 'Bearer', access_token: 'token', expires_in: 1.5 },
    { token_type: 'Bearer', access_token: 'token', expires_in: Number.POSITIVE_INFINITY },
    { token_type: 'Bearer', access_token: 'token', expires_in: 604_801 },
    { token_type: 'Bearer', access_token: 'token', expires_in: Number.MAX_SAFE_INTEGER },
  ];

  for (const body of invalidResponses) {
    await assert.rejects(
      () => requestGoPayAccessToken(sandboxEnv, async () => new Response(JSON.stringify(body))),
      (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
    );
  }

  await assert.rejects(
    () => requestGoPayAccessToken(sandboxEnv, async () => new Response('secret upstream body', { status: 401 })),
    (error: unknown) => error instanceof GoPayClientError
      && error.code === 'upstream_error'
      && error.httpStatus === 401
      && !error.message.includes('secret upstream body'),
  );
});

test('GoPay OAuth token zachová přesnou hodnotu provideru a přijme omezenou maximální expiraci', async () => {
  const token = await requestGoPayAccessToken(sandboxEnv, async () => new Response(JSON.stringify({
    token_type: 'Bearer',
    access_token: 'Case-Sensitive_Token-123',
    expires_in: 604_800,
  })));

  assert.deepEqual(token, { accessToken: 'Case-Sensitive_Token-123', expiresInSeconds: 604_800 });
});

test('GoPay OAuth při provider chybě neprovádí automatický retry', async () => {
  let calls = 0;

  await assert.rejects(
    () => requestGoPayAccessToken(sandboxEnv, async () => {
      calls += 1;
      return new Response('provider detail', { status: 503 });
    }),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'upstream_error',
  );

  assert.equal(calls, 1);
});

test('GoPay OAuth rozlišuje síťovou chybu a timeout', async () => {
  await assert.rejects(
    () => requestGoPayAccessToken(sandboxEnv, async () => { throw new TypeError('network'); }),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'network_error',
  );

  await assert.rejects(
    () => requestGoPayAccessToken(sandboxEnv, async (_url, init) => {
      await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return new Response('{}');
    }, { timeoutMs: 100 }),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'timeout',
  );
});
