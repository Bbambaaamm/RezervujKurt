import test from 'node:test';
import assert from 'node:assert/strict';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};
const reservationId = '123e4567-e89b-42d3-a456-426614174000';
const paymentId = '223e4567-e89b-42d3-a456-426614174000';
const input = {
  userId: '323e4567-e89b-42d3-a456-426614174000',
  courtId: 2,
  reservationDate: '2026-08-01',
  timeFrom: '09:00:00',
  timeTo: '10:30:00',
  note: '  poznámka  ',
  amountCents: 30000,
  currency: 'CZK' as const,
  metadata: { correlationId: 'bezpecne-id' },
};

test('create payment reservation RPC posílá pouze kanonický serverový payload', async () => {
  const { createPaymentReservation } = await import('../lib/services/payment-reservation-rpc');
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;

  const result = await createPaymentReservation(input, env, async (url, init) => {
    requestedUrl = String(url);
    requestedInit = init;
    return new Response(JSON.stringify([{ reservation_id: reservationId, payment_id: paymentId }]), { status: 200 });
  });

  assert.deepEqual(result, { reservationId, paymentId });
  assert.equal(requestedUrl, 'https://example.supabase.co/rest/v1/rpc/create_payment_reservation');
  assert.equal(requestedInit?.method, 'POST');
  assert.equal(requestedInit?.cache, 'no-store');
  assert.ok(requestedInit?.signal instanceof AbortSignal);
  assert.deepEqual(requestedInit?.headers, {
    apikey: 'service-role-key',
    Authorization: 'Bearer service-role-key',
    'Content-Type': 'application/json',
  });
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
    p_user_id: input.userId,
    p_court_id: 2,
    p_reservation_date: '2026-08-01',
    p_time_from: '09:00',
    p_time_to: '10:30',
    p_note: 'poznámka',
    p_idempotency_key: 'reservation-payment:v1:98544254f36ed0e0b2564ebe3e566ea329114dcad5f5dd4ae042539a83ca8303',
    p_amount_cents: 30000,
    p_currency: 'CZK',
    p_metadata: { correlationId: 'bezpecne-id' },
  });
});

test('create payment reservation RPC normalizuje velikost písmen UUID i pro idempotency key', async () => {
  const { createPaymentReservation } = await import('../lib/services/payment-reservation-rpc');
  const payloads: Array<Record<string, unknown>> = [];
  const fetchMock: typeof fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify([{ reservation_id: reservationId, payment_id: paymentId }]));
  };

  await createPaymentReservation(input, env, fetchMock);
  await createPaymentReservation({ ...input, userId: input.userId.toUpperCase() }, env, fetchMock);

  assert.equal(payloads[0].p_user_id, input.userId);
  assert.equal(payloads[1].p_user_id, input.userId);
  assert.equal(payloads[0].p_idempotency_key, payloads[1].p_idempotency_key);
});

test('create payment reservation RPC validuje serverové vstupy před síťovým voláním', async () => {
  const { createPaymentReservation, PaymentReservationRpcValidationError } = await import('../lib/services/payment-reservation-rpc');
  let fetchCalled = false;
  const fetchMock: typeof fetch = async () => {
    fetchCalled = true;
    return new Response('[]');
  };

  for (const invalidInput of [
    { ...input, userId: 'not-uuid' },
    { ...input, amountCents: 0 },
    { ...input, currency: 'EUR' as never },
    { ...input, timeTo: '09:00' },
    { ...input, note: 'x'.repeat(501) },
    { ...input, metadata: [] as never },
    { ...input, metadata: { missing: undefined } },
    { ...input, metadata: { secret: 'x'.repeat(9000) } },
  ]) {
    await assert.rejects(
      () => createPaymentReservation(invalidInput, env, fetchMock),
      PaymentReservationRpcValidationError,
    );
  }
  assert.equal(fetchCalled, false);
});

test('create payment reservation RPC odmítá chybnou konfiguraci bez síťového volání', async () => {
  const { createPaymentReservation, PaymentReservationRpcConfigurationError, PaymentReservationRpcValidationError } = await import('../lib/services/payment-reservation-rpc');
  const fetchMock: typeof fetch = async () => { throw new Error('fetch se nemá volat'); };

  for (const invalidEnv of [
    { NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: 'key' },
    { NEXT_PUBLIC_SUPABASE_URL: 'not-url', SUPABASE_SERVICE_ROLE_KEY: 'key' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'key' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: '' },
  ]) {
    await assert.rejects(() => createPaymentReservation(input, invalidEnv, fetchMock), PaymentReservationRpcConfigurationError);
  }
  await assert.rejects(() => createPaymentReservation(input, env, fetchMock, { timeoutMs: 99 }), PaymentReservationRpcValidationError);
  await assert.rejects(
    () => createPaymentReservation({ ...input, userId: 'not-uuid' }, {}, fetchMock),
    PaymentReservationRpcValidationError,
  );
});

test('create payment reservation RPC mapuje HTTP, neplatnou odpověď, síť a timeout', async () => {
  const { createPaymentReservation, PaymentReservationRpcError } = await import('../lib/services/payment-reservation-rpc');

  await assert.rejects(
    () => createPaymentReservation(input, env, async () => new Response(JSON.stringify({ code: '23P01', message: 'slot je obsazený', secret: 'ne' }), { status: 409 })),
    (error: unknown) => error instanceof PaymentReservationRpcError
      && error.code === 'http_error'
      && error.httpStatus === 409
      && error.postgresCode === '23P01'
      && !JSON.stringify(error).includes('slot je obsazený')
      && !JSON.stringify(error).includes('secret'),
  );
  await assert.rejects(
    () => createPaymentReservation(input, env, async () => new Response(JSON.stringify([{ reservation_id: reservationId }]))),
    (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'invalid_response',
  );
  await assert.rejects(
    () => createPaymentReservation(input, env, async () => new Response('not-json', { status: 200 })),
    (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'invalid_response' && error.httpStatus === 200,
  );
  await assert.rejects(
    () => createPaymentReservation(input, env, async () => new Response(JSON.stringify([{
      reservation_id: reservationId,
      payment_id: paymentId,
      payment_status: 'failed',
    }]))),
    (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'invalid_response',
  );
  await assert.rejects(
    () => createPaymentReservation(input, env, async () => new Response('<html>interní proxy chyba</html>', { status: 502 })),
    (error: unknown) => error instanceof PaymentReservationRpcError
      && error.code === 'http_error'
      && error.postgresCode === null
      && !JSON.stringify(error).includes('proxy'),
  );
  await assert.rejects(
    () => createPaymentReservation(input, env, async () => new Response(JSON.stringify({ code: 'NOT-SQLSTATE', message: 'interní zpráva' }), { status: 500 })),
    (error: unknown) => error instanceof PaymentReservationRpcError
      && error.code === 'http_error'
      && error.postgresCode === null
      && !JSON.stringify(error).includes('interní zpráva'),
  );
  await assert.rejects(
    () => createPaymentReservation(input, env, async () => { throw new TypeError('network'); }),
    (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'network_error',
  );
  await assert.rejects(
    () => createPaymentReservation(input, env, async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
    }), { timeoutMs: 100 }),
    (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'timeout',
  );
});
