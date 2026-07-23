import test from 'node:test';
import assert from 'node:assert/strict';

async function loadPaymentStateRpcModule() {
  return import('../lib/services/payment-state-rpc');
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const paymentId = '123e4567-e89b-42d3-a456-426614174000';
const paidAt = new Date('2026-07-23T12:00:00.000Z');

function successfulFetch(result = paymentId): typeof fetch {
  return async () => new Response(JSON.stringify(result), { status: 200 });
}

test('serverový payment RPC volá omezený endpoint se service-role hlavičkami a kanonickým payloadem', async () => {
  const { recordPaymentStateChange } = await loadPaymentStateRpcModule();
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;

  const result = await recordPaymentStateChange(
    {
      paymentId,
      newStatus: 'awaiting_payment',
      source: 'app_server',
      reason: '  vytvoření provider platby  ',
      metadata: { correlationId: 'abc' },
      providerPaymentId: '  GOPAY-123  ',
      expiresAt: '2026-07-23T14:15:00+02:00',
      incrementAttemptCount: true,
    },
    env,
    async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return new Response(JSON.stringify(paymentId), { status: 200 });
    },
  );

  assert.equal(result, paymentId);
  assert.equal(requestedUrl, 'https://example.supabase.co/rest/v1/rpc/record_payment_state_change');
  assert.equal(requestedInit?.method, 'POST');
  assert.deepEqual(requestedInit?.headers, {
    apikey: 'service-role-key',
    Authorization: 'Bearer service-role-key',
    'Content-Type': 'application/json',
  });
  assert.equal(requestedInit?.cache, 'no-store');
  assert.equal(requestedInit?.signal instanceof AbortSignal, true);
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
    p_payment_id: paymentId,
    p_new_status: 'awaiting_payment',
    p_source: 'app_server',
    p_reason: 'vytvoření provider platby',
    p_metadata: { correlationId: 'abc' },
    p_provider_payment_id: 'GOPAY-123',
    p_expires_at: '2026-07-23T12:15:00.000Z',
    p_paid_at: null,
    p_failed_at: null,
    p_cancelled_at: null,
    p_last_error: null,
    p_increment_attempt_count: true,
  });
});

test('serverový payment RPC validuje source, newStatus a incrementAttemptCount bez fetch side effectu', async () => {
  const { recordPaymentStateChange, PaymentStateRpcValidationError } = await loadPaymentStateRpcModule();
  let fetchCalled = false;
  const fetchMock: typeof fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify(paymentId));
  };

  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'client_browser' as never, paidAt }, env, fetchMock),
    (error: unknown) => error instanceof PaymentStateRpcValidationError && /source/.test(error.message),
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'created' as never, source: 'app_server' }, env, fetchMock),
    (error: unknown) => error instanceof PaymentStateRpcValidationError && /Cílový stav/.test(error.message),
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'awaiting_payment', source: 'app_server', providerPaymentId: 'GOPAY-1', expiresAt: paidAt, incrementAttemptCount: 'false' as never }, env, fetchMock),
    (error: unknown) => error instanceof PaymentStateRpcValidationError && /incrementAttemptCount/.test(error.message),
  );

  assert.equal(fetchCalled, false);
});

test('serverový payment RPC validuje cílové stavy stejně úzce jako databázová funkce', async () => {
  const { recordPaymentStateChange } = await loadPaymentStateRpcModule();
  let fetchCalled = false;
  const fetchMock: typeof fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify(paymentId));
  };

  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server' }, env, fetchMock),
    /Přechod na paid vyžaduje paidAt/,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt, failedAt: paidAt }, env, fetchMock),
    /Přechod na paid povoluje pouze paidAt/,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'failed', source: 'app_server', failedAt: paidAt, providerPaymentId: 'podstrčeno' }, env, fetchMock),
    /Přechod na failed povoluje pouze failedAt/,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'expired', source: 'reconciliation', lastError: 'nepovoleno' }, env, fetchMock),
    /Přechod na expired nebo requires_manual_review nepovoluje/,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'awaiting_payment', source: 'app_server', providerPaymentId: '   ', expiresAt: paidAt }, env, fetchMock),
    /providerPaymentId/,
  );

  assert.equal(fetchCalled, false);
});

test('serverový payment RPC odmítá neplatná textová pole', async () => {
  const { recordPaymentStateChange } = await loadPaymentStateRpcModule();
  const fetchMock = successfulFetch();

  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt, reason: { text: 'ne' } as never }, env, fetchMock),
    /reason musí být text nebo null/,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'failed', source: 'app_server', failedAt: paidAt, lastError: 123 as never }, env, fetchMock),
    /lastError musí být text nebo null/,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'awaiting_payment', source: 'app_server', providerPaymentId: 'x'.repeat(256), expiresAt: paidAt }, env, fetchMock),
    /providerPaymentId překračuje povolenou délku/,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'failed', source: 'app_server', failedAt: paidAt, lastError: 'x'.repeat(1001) }, env, fetchMock),
    /lastError překračuje povolenou délku/,
  );
});

test('serverový payment RPC odmítá metadata mimo bezpečný JSON objekt', async () => {
  const { recordPaymentStateChange } = await loadPaymentStateRpcModule();
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  class MetadataClass { value = 'ne'; }

  const invalidMetadataValues = [
    new Date(),
    ['array'],
    new MetadataClass(),
    { value: undefined },
    { callback: () => undefined },
    { value: BigInt(1) },
    circular,
    { value: 'x'.repeat(9000) },
  ];

  for (const metadata of invalidMetadataValues) {
    await assert.rejects(
      () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt, metadata: metadata as never }, env, successfulFetch()),
      /metadata/,
    );
  }
});

test('serverový payment RPC přijímá pouze Date nebo ISO timestamp s časovou zónou', async () => {
  const { recordPaymentStateChange } = await loadPaymentStateRpcModule();

  for (const expiresAt of ['2026-07-23', 'July 23, 2026', '07/23/2026', '2026-07-23T12:15:00']) {
    await assert.rejects(
      () => recordPaymentStateChange({ paymentId, newStatus: 'awaiting_payment', source: 'app_server', providerPaymentId: 'GOPAY-1', expiresAt }, env, successfulFetch()),
      /ISO timestamp s časovou zónou/,
    );
  }

  await assert.doesNotReject(
    () => recordPaymentStateChange({ paymentId, newStatus: 'awaiting_payment', source: 'app_server', providerPaymentId: 'GOPAY-1', expiresAt: '2026-07-23T12:15:00Z' }, env, successfulFetch()),
  );
});

test('serverový payment RPC validuje konfiguraci URL, service-role klíč a timeout', async () => {
  const { recordPaymentStateChange, PaymentStateRpcConfigurationError, PaymentStateRpcValidationError } = await loadPaymentStateRpcModule();
  let fetchCalled = false;
  const fetchMock: typeof fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify(paymentId));
  };

  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt }, { NEXT_PUBLIC_SUPABASE_URL: '   ', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }, fetchMock),
    (error: unknown) => error instanceof PaymentStateRpcConfigurationError,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt }, { NEXT_PUBLIC_SUPABASE_URL: 'notaurl', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }, fetchMock),
    (error: unknown) => error instanceof PaymentStateRpcConfigurationError,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt }, { NEXT_PUBLIC_SUPABASE_URL: 'http://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }, fetchMock),
    (error: unknown) => error instanceof PaymentStateRpcConfigurationError,
  );
  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt }, { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: '   ' }, fetchMock),
    (error: unknown) => error instanceof PaymentStateRpcConfigurationError,
  );

  for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 99, 30_001]) {
    await assert.rejects(
      () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt }, env, fetchMock, { timeoutMs }),
      (error: unknown) => error instanceof PaymentStateRpcValidationError,
    );
  }

  assert.equal(fetchCalled, false);
});

test('serverový payment RPC mapuje timeout, síťovou chybu, HTTP chybu a nevalidní odpověď', async () => {
  const { recordPaymentStateChange, PaymentStateRpcError } = await loadPaymentStateRpcModule();

  await assert.rejects(
    () => recordPaymentStateChange(
      { paymentId, newStatus: 'paid', source: 'app_server', paidAt },
      env,
      async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Abortováno timeoutem', 'AbortError')));
      }),
      { timeoutMs: 100 },
    ),
    (error: unknown) => error instanceof PaymentStateRpcError && error.code === 'timeout' && !error.message.includes(env.SUPABASE_SERVICE_ROLE_KEY),
  );

  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt }, env, async () => {
      throw new TypeError('fetch failed');
    }),
    (error: unknown) => error instanceof PaymentStateRpcError && error.code === 'network_error' && !error.message.includes(env.SUPABASE_SERVICE_ROLE_KEY),
  );

  await assert.rejects(
    () => recordPaymentStateChange(
      { paymentId, newStatus: 'paid', source: 'app_server', paidAt },
      env,
      async () => new Response(JSON.stringify({ code: '22023', message: 'Nepovolený přechod stavu platby' }), { status: 409 }),
    ),
    (error: unknown) => error instanceof PaymentStateRpcError
      && error.code === 'http_error'
      && error.httpStatus === 409
      && error.safeDetails === '22023: Nepovolený přechod stavu platby'
      && !error.safeDetails.includes(env.SUPABASE_SERVICE_ROLE_KEY),
  );

  await assert.rejects(
    () => recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'app_server', paidAt }, env, successfulFetch({ id: paymentId } as never)),
    (error: unknown) => error instanceof PaymentStateRpcError && error.code === 'invalid_response' && error.httpStatus === 200,
  );
});

test('serverový payment RPC vytvoří přesný payload pro všechny povolené cílové stavy', async () => {
  const { recordPaymentStateChange } = await loadPaymentStateRpcModule();
  const capturedPayloads: Array<Record<string, unknown>> = [];
  const fetchMock: typeof fetch = async (_url, init) => {
    capturedPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify(paymentId), { status: 200 });
  };

  await recordPaymentStateChange({ paymentId, newStatus: 'awaiting_payment', source: 'app_server', providerPaymentId: 'GOPAY-1', expiresAt: paidAt, incrementAttemptCount: true }, env, fetchMock);
  await recordPaymentStateChange({ paymentId, newStatus: 'paid', source: 'gopay_webhook', paidAt }, env, fetchMock);
  await recordPaymentStateChange({ paymentId, newStatus: 'failed', source: 'reconciliation', failedAt: paidAt, lastError: ' dočasná chyba ' }, env, fetchMock);
  await recordPaymentStateChange({ paymentId, newStatus: 'cancelled', source: 'admin_tool', cancelledAt: paidAt }, env, fetchMock);
  await recordPaymentStateChange({ paymentId, newStatus: 'expired', source: 'reconciliation' }, env, fetchMock);
  await recordPaymentStateChange({ paymentId, newStatus: 'requires_manual_review', source: 'db_migration' }, env, fetchMock);

  assert.deepEqual(capturedPayloads.map((payload) => payload.p_new_status), [
    'awaiting_payment',
    'paid',
    'failed',
    'cancelled',
    'expired',
    'requires_manual_review',
  ]);
  assert.equal(capturedPayloads[0].p_provider_payment_id, 'GOPAY-1');
  assert.equal(capturedPayloads[0].p_increment_attempt_count, true);
  assert.equal(capturedPayloads[1].p_paid_at, '2026-07-23T12:00:00.000Z');
  assert.equal(capturedPayloads[2].p_last_error, 'dočasná chyba');
  assert.equal(capturedPayloads[3].p_cancelled_at, '2026-07-23T12:00:00.000Z');
  assert.equal(capturedPayloads[4].p_provider_payment_id, null);
  assert.equal(capturedPayloads[5].p_last_error, null);
});
