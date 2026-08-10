import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGoPayCreatePaymentPayload,
  GoPayClientConfigurationError,
  GoPayClientError,
  requestGoPayAccessToken,
  requestGoPayCreatePayment,
} from '../lib/services/gopay-client';

const createPaymentInput = {
  paymentId: '123e4567-e89b-42d3-a456-426614174000',
  reservationId: '223e4567-e89b-42d3-a456-426614174001',
  amountCents: 12_000,
  currency: 'CZK' as const,
};

const createPaymentEnv = {
  GOPAY_GOID: '1234567890',
  PAYMENTS_PUBLIC_ORIGIN: 'https://rezervujkurt.cz',
};

const sandboxEnv = {
  PAYMENTS_GOPAY_ENV: 'sandbox',
  GOPAY_CLIENT_ID: 'sandbox-client',
  GOPAY_CLIENT_SECRET: 'sandbox-secret',
};

function buildExactSizeOAuthBody(sizeBytes: number) {
  const baseBody = JSON.stringify({ token_type: 'Bearer', access_token: 'token', expires_in: 60, padding: '' });
  assert.ok(sizeBytes >= Buffer.byteLength(baseBody));
  return JSON.stringify({
    token_type: 'Bearer',
    access_token: 'token',
    expires_in: 60,
    padding: 'x'.repeat(sizeBytes - Buffer.byteLength(baseBody)),
  });
}

test('GoPay create payload obsahuje pouze serverový cenový snapshot a bezpečné reference', () => {
  assert.deepEqual(buildGoPayCreatePaymentPayload(createPaymentInput, createPaymentEnv), {
    amount: 12_000,
    currency: 'CZK',
    target: { type: 'ACCOUNT', goid: '1234567890' },
    order_number: '123e4567-e89b-42d3-a456-426614174000',
    order_description: 'Rezervace kurtu 223e4567-e89b-42d3-a456-426614174001',
    items: [{ name: 'Rezervace kurtu', amount: 12_000, count: 1 }],
    callback: {
      return_url: 'https://rezervujkurt.cz/gopay/return',
      notification_url: 'https://rezervujkurt.cz/api/payments/gopay/notification',
    },
    lang: 'CS',
  });
});

test('GoPay create payload fail-closed odmítá neplatné identity, cenu, měnu a callback URL', () => {
  const invalidInputs = [
    { ...createPaymentInput, paymentId: 'payment-1' },
    { ...createPaymentInput, reservationId: 'reservation-1' },
    { ...createPaymentInput, reservationId: createPaymentInput.paymentId },
    { ...createPaymentInput, amountCents: 0 },
    { ...createPaymentInput, amountCents: 1.5 },
    { ...createPaymentInput, amountCents: 100_000_000 },
    { ...createPaymentInput, currency: 'EUR' as 'CZK' },
  ];

  for (const input of invalidInputs) {
    assert.throws(() => buildGoPayCreatePaymentPayload(input, createPaymentEnv), GoPayClientConfigurationError);
  }
});

test('GoPay create payload odvozuje pevné callback cesty pouze z důvěryhodného čistého originu', () => {
  const payload = buildGoPayCreatePaymentPayload(createPaymentInput, {
    ...createPaymentEnv,
    PAYMENTS_PUBLIC_ORIGIN: 'http://localhost:3000',
  });

  assert.equal(payload.callback.return_url, 'http://localhost:3000/gopay/return');
  assert.equal(payload.callback.notification_url, 'http://localhost:3000/api/payments/gopay/notification');

  for (const publicOrigin of [
    undefined,
    'http://attacker.example',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com?payment=secret',
    'https://example.com#secret',
  ]) {
    assert.throws(
      () => buildGoPayCreatePaymentPayload(createPaymentInput, { ...createPaymentEnv, PAYMENTS_PUBLIC_ORIGIN: publicOrigin }),
      GoPayClientConfigurationError,
    );
  }
});

test('GoPay create payload načítá pouze kladné číselné GoID ze serverové konfigurace', () => {
  for (const goId of [undefined, '', 'merchant', '-1', '0', '0000', '1'.repeat(33)]) {
    assert.throws(
      () => buildGoPayCreatePaymentPayload(createPaymentInput, { ...createPaymentEnv, GOPAY_GOID: goId }),
      GoPayClientConfigurationError,
    );
  }
});

test('GoPay create payload zachová GoID jako číselný řetězec bez převodu přes JavaScript number', () => {
  const goIdBeyondSafeInteger = '00123456789012345678901234567890';
  const payload = buildGoPayCreatePaymentPayload(createPaymentInput, {
    ...createPaymentEnv,
    GOPAY_GOID: goIdBeyondSafeInteger,
  });

  assert.equal(payload.target.goid, goIdBeyondSafeInteger);
  assert.equal(typeof payload.target.goid, 'string');
});

test('GoPay create payload je stabilní, nemění vstup a nepropouští neočekávaná pole', () => {
  const input = Object.freeze({ ...createPaymentInput, clientPrice: 1, goid: 'attacker' });
  const first = buildGoPayCreatePaymentPayload(input, createPaymentEnv);
  const second = buildGoPayCreatePaymentPayload(input, createPaymentEnv);

  assert.deepEqual(second, first);
  assert.deepEqual(input, { ...createPaymentInput, clientPrice: 1, goid: 'attacker' });
  assert.deepEqual(Object.keys(first).sort(), [
    'amount', 'callback', 'currency', 'items', 'lang', 'order_description', 'order_number', 'target',
  ]);
  assert.equal(first.order_number, createPaymentInput.paymentId);
  assert.match(first.order_description, new RegExp(createPaymentInput.reservationId));
  assert.equal(JSON.stringify(first).includes('attacker'), false);
});

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
    { ...sandboxEnv, GOPAY_CLIENT_ID: 'x'.repeat(4_097) },
    { ...sandboxEnv, GOPAY_CLIENT_SECRET: 'x'.repeat(4_097) },
  ]) {
    await assert.rejects(() => requestGoPayAccessToken(env, fetchMock), GoPayClientConfigurationError);
  }
  for (const timeoutMs of [0, 99, 30_001, 1.5]) {
    await assert.rejects(() => requestGoPayAccessToken(sandboxEnv, fetchMock, { timeoutMs }), GoPayClientConfigurationError);
  }
  assert.equal(calls, 0);
});

test('GoPay OAuth přijme credentials dlouhé přesně 4096 znaků', async () => {
  let calls = 0;
  const token = await requestGoPayAccessToken({
    ...sandboxEnv,
    GOPAY_CLIENT_ID: 'i'.repeat(4_096),
    GOPAY_CLIENT_SECRET: 's'.repeat(4_096),
  }, async () => {
    calls += 1;
    return new Response(JSON.stringify({
      token_type: 'Bearer',
      access_token: 'token',
      expires_in: 60,
    }));
  });

  assert.deepEqual(token, { accessToken: 'token', expiresInSeconds: 60 });
  assert.equal(calls, 1);
});

test('GoPay OAuth přijme access token na hranici 4096 znaků a delší odmítne', async () => {
  const maximumLengthToken = 't'.repeat(4_096);
  const token = await requestGoPayAccessToken(sandboxEnv, async () => new Response(JSON.stringify({
    token_type: 'Bearer',
    access_token: maximumLengthToken,
    expires_in: 60,
  })));

  assert.deepEqual(token, { accessToken: maximumLengthToken, expiresInSeconds: 60 });

  await assert.rejects(
    () => requestGoPayAccessToken(sandboxEnv, async () => new Response(JSON.stringify({
      token_type: 'Bearer',
      access_token: 't'.repeat(4_097),
      expires_in: 60,
    }))),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
  );
});

test('GoPay OAuth odmítá neplatné úspěšné odpovědi bez propouštění payloadu', async () => {
  const invalidResponses = [
    {},
    { token_type: 'Basic', access_token: 'token', expires_in: 60 },
    { token_type: 'MAC', access_token: 'token', expires_in: 60 },
    { token_type: ' bearer ', access_token: 'token', expires_in: 60 },
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

test('GoPay OAuth odmítne nadlimitní odpověď podle hlavičky i skutečně přijatých dat', async () => {
  const oversizedBody = buildExactSizeOAuthBody(65_537);

  for (const response of [
    new Response('{}', { headers: { 'Content-Length': String(64 * 1_024 + 1) } }),
    new Response(oversizedBody),
  ]) {
    await assert.rejects(
      () => requestGoPayAccessToken(sandboxEnv, async () => response),
      (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
    );
  }
});

test('GoPay OAuth limit odpovědi je včetně přesně 65536 bajtů', async () => {
  for (const sizeBytes of [65_535, 65_536]) {
    const body = buildExactSizeOAuthBody(sizeBytes);
    assert.equal(Buffer.byteLength(body), sizeBytes);
    const token = await requestGoPayAccessToken(sandboxEnv, async () => new Response(body));
    assert.equal(token.accessToken, 'token');
  }

  const oversizedBody = buildExactSizeOAuthBody(65_537);
  assert.equal(Buffer.byteLength(oversizedBody), 65_537);
  await assert.rejects(
    () => requestGoPayAccessToken(sandboxEnv, async () => new Response(oversizedBody)),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
  );
});

test('GoPay OAuth po překročení limitu zruší stream a nepokračuje ve čtení', async () => {
  let cancelCalls = 0;
  let pullCalls = 0;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCalls += 1;
      controller.enqueue(new Uint8Array(65_537));
    },
    cancel() {
      cancelCalls += 1;
    },
  }, { highWaterMark: 0 }));

  await assert.rejects(
    () => requestGoPayAccessToken(sandboxEnv, async () => response),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
  );
  assert.equal(cancelCalls, 1);
  assert.equal(pullCalls, 1);
});

test('GoPay OAuth mapuje chybějící tělo a neplatné UTF-8 na invalid_response', async () => {
  const responseWithoutBody = { ok: true, status: 200, headers: new Headers(), body: null } as Response;

  for (const response of [responseWithoutBody, new Response(Uint8Array.from([0xc3, 0x28]))]) {
    await assert.rejects(
      () => requestGoPayAccessToken(sandboxEnv, async () => response),
      (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
    );
  }
});

test('GoPay OAuth měří stream po dekompresi bez spoléhání na komprimovaný Content-Length', async () => {
  const response = new Response(buildExactSizeOAuthBody(65_537), {
    headers: { 'Content-Encoding': 'gzip', 'Content-Length': '512' },
  });

  await assert.rejects(
    () => requestGoPayAccessToken(sandboxEnv, async () => response),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
  );
});

test('GoPay OAuth zachovává jednotný chybový kontrakt pro budoucí platební ságu', async () => {
  const responseWithoutBody = { ok: true, status: 200, headers: new Headers(), body: null } as Response;
  const scenarios: Array<{
    name: string;
    expectedCode: 'invalid_response' | 'upstream_error' | 'timeout';
    request: () => ReturnType<typeof requestGoPayAccessToken>;
  }> = [
    {
      name: 'překročený limit',
      expectedCode: 'invalid_response',
      request: () => requestGoPayAccessToken(sandboxEnv, async () => new Response('{}', {
        headers: { 'Content-Length': '65537' },
      })),
    },
    {
      name: 'neplatné UTF-8',
      expectedCode: 'invalid_response',
      request: () => requestGoPayAccessToken(sandboxEnv, async () => new Response(Uint8Array.from([0xc3, 0x28]))),
    },
    {
      name: 'neplatné JSON',
      expectedCode: 'invalid_response',
      request: () => requestGoPayAccessToken(sandboxEnv, async () => new Response('{')),
    },
    {
      name: 'chybějící body',
      expectedCode: 'invalid_response',
      request: () => requestGoPayAccessToken(sandboxEnv, async () => responseWithoutBody),
    },
    {
      name: 'HTTP 500',
      expectedCode: 'upstream_error',
      request: () => requestGoPayAccessToken(sandboxEnv, async () => new Response('{}', { status: 500 })),
    },
    {
      name: 'timeout',
      expectedCode: 'timeout',
      request: () => requestGoPayAccessToken(sandboxEnv, async (_url, init) => {
        await new Promise((_resolve, reject) => init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
        ));
        return new Response('{}');
      }, { timeoutMs: 100 }),
    },
  ];

  for (const scenario of scenarios) {
    await assert.rejects(
      scenario.request,
      (error: unknown) => error instanceof GoPayClientError && error.code === scenario.expectedCode,
      scenario.name,
    );
  }
});

test('GoPay OAuth přijímá bearer token type bez ohledu na velikost písmen', async () => {
  for (const tokenType of ['Bearer', 'bearer', 'BEARER', 'bEaReR']) {
    const token = await requestGoPayAccessToken(sandboxEnv, async () => new Response(JSON.stringify({
      token_type: tokenType,
      access_token: 'case-sensitive-token',
      expires_in: 60,
    })));

    assert.equal(token.accessToken, 'case-sensitive-token');
  }
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

test('GoPay create požadavek používá pevný sandbox endpoint a vrací pouze bezpečný kontrakt', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const result = await requestGoPayCreatePayment(
    createPaymentInput,
    'Case-Sensitive_Token-123',
    { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' },
    async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        id: 3_000_006_542,
        state: 'CREATED',
        gw_url: 'https://gw.sandbox.gopay.com/gw/v3/3Mpw5J',
        sensitive_provider_field: 'ignorovat',
      }));
    },
  );

  const headers = new Headers(capturedInit?.headers);
  assert.equal(capturedUrl, 'https://gw.sandbox.gopay.com/api/payments/payment');
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.cache, 'no-store');
  assert.ok(capturedInit?.signal instanceof AbortSignal);
  assert.equal(headers.get('authorization'), 'Bearer Case-Sensitive_Token-123');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), buildGoPayCreatePaymentPayload(createPaymentInput, createPaymentEnv));
  assert.deepEqual(result, {
    providerPaymentId: 3_000_006_542,
    gatewayUrl: 'https://gw.sandbox.gopay.com/gw/v3/3Mpw5J',
    state: 'CREATED',
  });
});

test('GoPay create požadavek odděluje production endpoint a odpovídající redirect origin', async () => {
  let capturedUrl = '';
  const result = await requestGoPayCreatePayment(
    createPaymentInput,
    'token',
    { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'production' },
    async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ id: 42, state: 'CREATED', gw_url: 'https://gate.gopay.cz/gw/v3/payment' }));
    },
  );

  assert.equal(capturedUrl, 'https://gate.gopay.cz/api/payments/payment');
  assert.equal(result.gatewayUrl, 'https://gate.gopay.cz/gw/v3/payment');
});

test('GoPay create povolí explicitní standardní HTTPS port 443, ale odmítne jiný port', async () => {
  const env = { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'production' };
  const standardPortUrl = 'https://gate.gopay.cz:443/gw/v3/payment';
  const result = await requestGoPayCreatePayment(
    createPaymentInput,
    'token',
    env,
    async () => new Response(JSON.stringify({ id: 42, state: 'CREATED', gw_url: standardPortUrl })),
  );

  assert.equal(result.gatewayUrl, standardPortUrl);

  await assert.rejects(
    () => requestGoPayCreatePayment(
      createPaymentInput,
      'token',
      env,
      async () => new Response(JSON.stringify({
        id: 42,
        state: 'CREATED',
        gw_url: 'https://gate.gopay.cz:444/gw/v3/payment',
      })),
    ),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
  );
});

test('GoPay create předá pouze omezenou checkout URL na očekávané gateway cestě', async () => {
  const env = { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' };
  const invalidGatewayUrls = [
    'https://gw.sandbox.gopay.com/api/payments/payment/42',
    'https://gw.sandbox.gopay.com/',
    'https://gw.sandbox.gopay.com/gw/../api/payments',
    'https://gw.sandbox.gopay.com/gw/%2e%2e/api/payments',
    'https://gw.sandbox.gopay.com/gw%2Fv3/token',
    `https://gw.sandbox.gopay.com/gw/${'x'.repeat(2_048)}`,
  ];

  for (const gatewayUrl of invalidGatewayUrls) {
    await assert.rejects(
      () => requestGoPayCreatePayment(
        createPaymentInput,
        'token',
        env,
        async () => new Response(JSON.stringify({ id: 42, state: 'CREATED', gw_url: gatewayUrl })),
      ),
      (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
    );
  }
});

test('GoPay create požadavek odmítá neplatný token a odpověď před předáním redirectu', async () => {
  let calls = 0;
  for (const token of ['', 'token with whitespace', 'x'.repeat(4_097)]) {
    await assert.rejects(
      () => requestGoPayCreatePayment(createPaymentInput, token, { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' }, async () => {
        calls += 1;
        return new Response('{}');
      }),
      GoPayClientConfigurationError,
    );
  }
  assert.equal(calls, 0);

  const invalidResponses = [
    {},
    [],
    null,
    { id: 0, state: 'CREATED', gw_url: 'https://gw.sandbox.gopay.com/gw/payment' },
    { id: 1.5, state: 'CREATED', gw_url: 'https://gw.sandbox.gopay.com/gw/payment' },
    { id: Number.MAX_SAFE_INTEGER + 1, state: 'CREATED', gw_url: 'https://gw.sandbox.gopay.com/gw/payment' },
    { id: 1, state: 'PAID', gw_url: 'https://gw.sandbox.gopay.com/gw/payment' },
    { id: 1, state: 'CREATED', gw_url: 'http://gw.sandbox.gopay.com/gw/payment' },
    { id: 1, state: 'CREATED', gw_url: 'https://attacker.example/gw/payment' },
    { id: 1, state: 'CREATED', gw_url: 'https://gw.sandbox.gopay.com.attacker.cz/gw/payment' },
    { id: 1, state: 'CREATED', gw_url: 'https://gw.sandbox.gopay.com.evil.cz/gw/payment' },
    { id: 1, state: 'CREATED', gw_url: 'https://evil.cz/?next=https://gw.sandbox.gopay.com/gw/payment' },
    { id: 1, state: 'CREATED', gw_url: 'https://user:secret@gw.sandbox.gopay.com/gw/payment' },
    { id: 1, state: 'CREATED', gw_url: ' https://gw.sandbox.gopay.com/gw/payment' },
  ];

  for (const body of invalidResponses) {
    await assert.rejects(
      () => requestGoPayCreatePayment(
        createPaymentInput,
        'token',
        { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' },
        async () => new Response(JSON.stringify(body)),
      ),
      (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
    );
  }
});

test('GoPay create přijme access token dlouhý přesně 4096 znaků', async () => {
  const maximumLengthToken = 't'.repeat(4_096);
  let authorization = '';

  await requestGoPayCreatePayment(
    createPaymentInput,
    maximumLengthToken,
    { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' },
    async (_url, init) => {
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      return new Response(JSON.stringify({
        id: 42,
        state: 'CREATED',
        gw_url: 'https://gw.sandbox.gopay.com/gw/payment',
      }));
    },
  );

  assert.equal(authorization, `Bearer ${maximumLengthToken}`);
});

test('GoPay create odmítne nadlimitní odpověď bez předání checkout URL', async () => {
  const oversizedBody = JSON.stringify({
    id: 42,
    state: 'CREATED',
    gw_url: 'https://gw.sandbox.gopay.com/gw/payment',
    padding: 'x'.repeat(64 * 1_024),
  });

  await assert.rejects(
    () => requestGoPayCreatePayment(
      createPaymentInput,
      'token',
      { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' },
      async () => new Response(oversizedBody),
    ),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'invalid_response',
  );
});

test('GoPay create vrací provider ID jako ověřené číslo a redirect URL beze změny', async () => {
  const providerUrl = 'https://GW.SANDBOX.GOPAY.COM/gw/%7epayment?state=A%2fb&next=https%3A%2F%2Fexample.cz';
  const result = await requestGoPayCreatePayment(
    createPaymentInput,
    'token',
    { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' },
    async () => new Response(JSON.stringify({
      id: Number.MAX_SAFE_INTEGER,
      state: 'CREATED',
      gw_url: providerUrl,
    })),
  );

  assert.equal(result.providerPaymentId, Number.MAX_SAFE_INTEGER);
  assert.equal(typeof result.providerPaymentId, 'number');
  assert.equal(result.gatewayUrl, providerUrl);
});

test('GoPay create považuje každý neúspěšný HTTP status za provider chybu i s validním JSON', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    await assert.rejects(
      () => requestGoPayCreatePayment(
        createPaymentInput,
        'token',
        { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' },
        async () => new Response(JSON.stringify({
          id: 1,
          state: 'CREATED',
          gw_url: 'https://gw.sandbox.gopay.com/gw/payment',
        }), { status }),
      ),
      (error: unknown) => error instanceof GoPayClientError
        && error.code === 'upstream_error'
        && error.httpStatus === status,
    );
  }
});

test('GoPay create požadavek neprovádí retry a rozlišuje provider chybu, síť a timeout', async () => {
  const env = { ...createPaymentEnv, PAYMENTS_GOPAY_ENV: 'sandbox' };
  let calls = 0;
  await assert.rejects(
    () => requestGoPayCreatePayment(createPaymentInput, 'token', env, async () => {
      calls += 1;
      return new Response('citlivý provider detail', { status: 503 });
    }),
    (error: unknown) => error instanceof GoPayClientError
      && error.code === 'upstream_error'
      && error.httpStatus === 503
      && !error.message.includes('citlivý provider detail'),
  );
  assert.equal(calls, 1);

  await assert.rejects(
    () => requestGoPayCreatePayment(createPaymentInput, 'token', env, async () => { throw new TypeError('network'); }),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'network_error',
  );

  await assert.rejects(
    () => requestGoPayCreatePayment(createPaymentInput, 'token', env, async (_url, init) => {
      await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return new Response('{}');
    }, { timeoutMs: 100 }),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'timeout',
  );

  await assert.rejects(
    () => requestGoPayCreatePayment(createPaymentInput, 'token', env, async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
    })), { timeoutMs: 100 }),
    (error: unknown) => error instanceof GoPayClientError && error.code === 'timeout',
  );
});
