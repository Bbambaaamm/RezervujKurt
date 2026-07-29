import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createOrGetPaymentAttempt,
  PaymentReservationRpcConfigurationError,
  PaymentReservationRpcError,
  PaymentReservationRpcValidationError,
} from '../lib/services/payment-reservation-rpc';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};
const input = {
  paymentAttemptId: '423e4567-e89b-42d3-a456-426614174000',
  userId: '323e4567-e89b-42d3-a456-426614174000',
  courtId: 3,
  reservationDate: '2026-08-01',
  timeFrom: '09:00:00',
  timeTo: '10:30:00',
  note: '  poznámka  ',
  ttlMinutes: 15,
  metadata: { correlationId: 'bezpecne-id' },
};
const rpcRow = {
  reservation_id: '123e4567-e89b-42d3-a456-426614174000',
  payment_id: '223e4567-e89b-42d3-a456-426614174000',
  attempt_created: true,
  price_per_hour_cents: 25000,
  amount_cents: 37500,
  currency: 'CZK',
  expires_at: '2026-08-01T08:15:00.000Z',
};

test('create-or-get adaptér posílá kanonický service-role payload a vrací celý snapshot', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;

  const result = await createOrGetPaymentAttempt(input, env, async (url, init) => {
    requestedUrl = String(url);
    requestedInit = init;
    return new Response(JSON.stringify([rpcRow]));
  });

  assert.equal(requestedUrl, 'https://example.supabase.co/rest/v1/rpc/create_or_get_payment_attempt');
  assert.equal(requestedInit?.method, 'POST');
  assert.equal(requestedInit?.cache, 'no-store');
  assert.ok(requestedInit?.signal instanceof AbortSignal);
  assert.deepEqual(requestedInit?.headers, {
    apikey: 'service-role-key',
    Authorization: 'Bearer service-role-key',
    'Content-Type': 'application/json',
  });
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
    p_payment_attempt_id: input.paymentAttemptId,
    p_user_id: input.userId,
    p_court_id: 3,
    p_reservation_date: '2026-08-01',
    p_time_from: '09:00',
    p_time_to: '10:30',
    p_note: 'poznámka',
    p_ttl_minutes: 15,
    p_metadata: { correlationId: 'bezpecne-id' },
  });
  assert.deepEqual(result, {
    reservationId: rpcRow.reservation_id,
    paymentId: rpcRow.payment_id,
    attemptCreated: true,
    pricePerHourCents: 25000,
    amountCents: 37500,
    currency: 'CZK',
    expiresAt: new Date(rpcRow.expires_at),
  });
});

test('create-or-get adaptér kanonizuje uppercase UUID před RPC', async () => {
  const payloads: Array<Record<string, unknown>> = [];

  await createOrGetPaymentAttempt({
    ...input,
    paymentAttemptId: input.paymentAttemptId.toUpperCase(),
    userId: input.userId.toUpperCase(),
  }, env, async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify([rpcRow]));
  });

  assert.equal(payloads[0].p_payment_attempt_id, input.paymentAttemptId);
  assert.equal(payloads[0].p_user_id, input.userId);
});

test('create-or-get adaptér validuje vstupy před síťovým voláním', async () => {
  let fetchCalled = false;
  const fetchMock: typeof fetch = async () => {
    fetchCalled = true;
    return new Response('[]');
  };

  for (const invalidInput of [
    { ...input, paymentAttemptId: 'not-uuid' },
    { ...input, userId: 'not-uuid' },
    { ...input, courtId: 0 },
    { ...input, timeTo: '09:00' },
    { ...input, ttlMinutes: 0 },
    { ...input, ttlMinutes: 1441 },
    { ...input, ttlMinutes: 1.5 },
    { ...input, note: 'x'.repeat(501) },
    { ...input, metadata: [] as never },
    { ...input, metadata: { invalid: undefined } },
  ]) {
    await assert.rejects(() => createOrGetPaymentAttempt(invalidInput, env, fetchMock), PaymentReservationRpcValidationError);
  }
  assert.equal(fetchCalled, false);
});

test('create-or-get adaptér odmítá chybnou konfiguraci a nepropouští chybové tělo', async () => {
  await assert.rejects(
    () => createOrGetPaymentAttempt(input, { ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, async () => new Response('[]')),
    PaymentReservationRpcConfigurationError,
  );
  await assert.rejects(
    () => createOrGetPaymentAttempt(input, env, async () => new Response(JSON.stringify({
      code: '22023',
      message: 'payment_attempt_conflict',
      details: 'citlivý detail',
    }), { status: 400 })),
    (error: unknown) => error instanceof PaymentReservationRpcError
      && error.code === 'http_error'
      && error.httpStatus === 400
      && error.postgresCode === '22023'
      && !JSON.stringify(error).includes('payment_attempt_conflict')
      && !JSON.stringify(error).includes('citlivý detail'),
  );
});

test('create-or-get adaptér vyžaduje právě jeden řádek', async () => {
  for (const rows of [[], [rpcRow, { ...rpcRow, payment_id: input.paymentAttemptId }]]) {
    await assert.rejects(
      () => createOrGetPaymentAttempt(input, env, async () => new Response(JSON.stringify(rows))),
      (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'invalid_response',
    );
  }

  assert.deepEqual(
    await createOrGetPaymentAttempt(input, env, async () => new Response(JSON.stringify([rpcRow]))),
    {
      reservationId: rpcRow.reservation_id,
      paymentId: rpcRow.payment_id,
      attemptCreated: true,
      pricePerHourCents: 25000,
      amountCents: 37500,
      currency: 'CZK',
      expiresAt: new Date(rpcRow.expires_at),
    },
  );
});

test('create-or-get adaptér validuje povinná pole a ignoruje neznámá návratová pole', async () => {
  const requiredFields = [
    'reservation_id',
    'payment_id',
    'attempt_created',
    'price_per_hour_cents',
    'amount_cents',
    'currency',
    'expires_at',
  ];
  const rowsWithMissingRequiredField = requiredFields.map((missingField) =>
    Object.fromEntries(Object.entries(rpcRow).filter(([key]) => key !== missingField))
  );

  for (const invalidRow of [
    { ...rpcRow, attempt_created: 'true' },
    { ...rpcRow, price_per_hour_cents: 0 },
    { ...rpcRow, amount_cents: 1.5 },
    { ...rpcRow, currency: 'EUR' },
    { ...rpcRow, expires_at: 'neplatné' },
    ...rowsWithMissingRequiredField,
  ]) {
    await assert.rejects(
      () => createOrGetPaymentAttempt(input, env, async () => new Response(JSON.stringify([invalidRow]))),
      (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'invalid_response',
    );
  }

  const result = await createOrGetPaymentAttempt(input, env, async () => new Response(JSON.stringify([{
    ...rpcRow,
    foo: 'budoucí pole',
    metadata: { call: 1 },
  }])));
  assert.deepEqual(Object.keys(result).sort(), [
    'amountCents',
    'attemptCreated',
    'currency',
    'expiresAt',
    'paymentId',
    'pricePerHourCents',
    'reservationId',
  ]);
});

test('create-or-get adaptér metadata vstupu nemění a návratová metadata nekopíruje', async () => {
  const metadata = { call: 1, nested: { test: 'read-only' } };
  const original = structuredClone(metadata);

  const result = await createOrGetPaymentAttempt({ ...input, metadata }, env, async () => new Response(JSON.stringify([{
    ...rpcRow,
    metadata: { call: 2 },
  }])));

  assert.deepEqual(metadata, original);
  assert.equal(Object.hasOwn(result, 'metadata'), false);
});

test('create-or-get adaptér rozlišuje síťovou chybu a timeout včetně čtení odpovědi', async () => {
  await assert.rejects(
    () => createOrGetPaymentAttempt(input, env, async () => { throw new TypeError('network'); }),
    (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'network_error',
  );
  await assert.rejects(
    () => createOrGetPaymentAttempt(input, env, async (_url, init) => ({
      ok: true,
      status: 200,
      json: async () => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
      }),
    } as Response), { timeoutMs: 100 }),
    (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'timeout',
  );
});

test('create-or-get adaptér po timeoutu neopakuje RPC', async () => {
  let calls = 0;

  await assert.rejects(
    () => createOrGetPaymentAttempt(input, env, async (_url, init) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
      });
    }, { timeoutMs: 100 }),
    (error: unknown) => error instanceof PaymentReservationRpcError && error.code === 'timeout',
  );
  assert.equal(calls, 1);
});
