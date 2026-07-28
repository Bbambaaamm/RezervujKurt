import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCourtReservationAmount,
  CourtPaymentPriceConfigurationError,
  CourtPaymentPriceError,
  readCourtPaymentPrice,
} from '../lib/services/court-payment-price';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

test('serverový ceník čte úzké RPC service-role požadavkem bez cache', async () => {
  let captured: { url: string; init?: RequestInit } | null = null;
  const price = await readCourtPaymentPrice(2, env, async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify([{ price_per_hour_cents: 24000, currency: 'CZK' }]), { status: 200 });
  });

  assert.deepEqual(price, { pricePerHourCents: 24000, currency: 'CZK' });
  assert.ok(captured);
  const request = captured as { url: string; init?: RequestInit };
  assert.equal(request.url, 'https://example.supabase.co/rest/v1/rpc/get_court_payment_price');
  assert.equal(request.init?.method, 'POST');
  assert.equal(request.init?.cache, 'no-store');
  assert.equal(request.init?.body, JSON.stringify({ p_court_id: 2 }));
  const headers = new Headers(request.init?.headers);
  assert.equal(headers.get('apikey'), 'service-role-key');
  assert.equal(headers.get('authorization'), 'Bearer service-role-key');
  assert.ok(request.init?.signal instanceof AbortSignal);
});

test('chybějící cena nebo neaktivní kurt skončí fail-closed', async () => {
  await assert.rejects(
    () => readCourtPaymentPrice(1, env, async () => new Response('[]', { status: 200 })),
    (error: unknown) => error instanceof CourtPaymentPriceError && error.code === 'not_configured',
  );
});

test('celková částka vychází pouze z normalizovaného slotu a serverové hodinové ceny', async () => {
  const readPrice = async () => ({ pricePerHourCents: 25000, currency: 'CZK' as const });

  assert.deepEqual(
    await calculateCourtReservationAmount(
      { courtId: 1, reservationDate: '2026-08-01', timeFrom: '09:00:00', timeTo: '10:30:00' },
      readPrice,
    ),
    { amountCents: 37500, currency: 'CZK' },
  );
  assert.deepEqual(
    await calculateCourtReservationAmount(
      { courtId: 1, reservationDate: '2026-08-01', timeFrom: '09:00', timeTo: '09:30' },
      readPrice,
    ),
    { amountCents: 12500, currency: 'CZK' },
  );
});

test('celková částka odmítne zlomek haléře bez tichého zaokrouhlení', async () => {
  await assert.rejects(
    () => calculateCourtReservationAmount(
      { courtId: 1, reservationDate: '2026-08-01', timeFrom: '09:00', timeTo: '09:15' },
      async () => ({ pricePerHourCents: 25001, currency: 'CZK' }),
    ),
    /celé haléře/,
  );
});

test('celková částka validuje slot před načtením ceny', async () => {
  let priceReads = 0;
  await assert.rejects(
    () => calculateCourtReservationAmount(
      { courtId: 1, reservationDate: '2026-08-01', timeFrom: '10:00', timeTo: '09:00' },
      async () => {
        priceReads += 1;
        return { pricePerHourCents: 25000, currency: 'CZK' };
      },
    ),
    /Časový rozsah/,
  );
  assert.equal(priceReads, 0);
});

test('ceník odmítá neplatné a nadbytečné hodnoty v úspěšné odpovědi', async () => {
  for (const body of [
    [{}],
    [{ price_per_hour_cents: 0, currency: 'CZK' }],
    [{ price_per_hour_cents: 89478486, currency: 'CZK' }],
    [{ price_per_hour_cents: 10000, currency: 'EUR' }],
    [{ price_per_hour_cents: 10000, currency: 'CZK', provider: 'gopay' }],
    [{ price_per_hour_cents: 10000, currency: 'CZK' }, { price_per_hour_cents: 10000, currency: 'CZK' }],
  ]) {
    await assert.rejects(
      () => readCourtPaymentPrice(1, env, async () => new Response(JSON.stringify(body), { status: 200 })),
      (error: unknown) => error instanceof CourtPaymentPriceError && error.code === 'invalid_response',
    );
  }
});

test('ceník rozlišuje HTTP chybu, neplatné JSON, síť a timeout bez čtení upstream detailu', async () => {
  await assert.rejects(
    () => readCourtPaymentPrice(1, env, async () => new Response('citlivý detail', { status: 503 })),
    (error: unknown) => error instanceof CourtPaymentPriceError && error.code === 'http_error' && error.httpStatus === 503
      && !error.message.includes('citlivý detail'),
  );
  await assert.rejects(
    () => readCourtPaymentPrice(1, env, async () => new Response('neplatný json', { status: 200 })),
    (error: unknown) => error instanceof CourtPaymentPriceError && error.code === 'invalid_response',
  );
  await assert.rejects(
    () => readCourtPaymentPrice(1, env, async () => { throw new TypeError('network down'); }),
    (error: unknown) => error instanceof CourtPaymentPriceError && error.code === 'network_error',
  );
  await assert.rejects(
    () => readCourtPaymentPrice(1, env, async (_url, init) => {
      await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return new Response('[]');
    }, { timeoutMs: 100 }),
    (error: unknown) => error instanceof CourtPaymentPriceError && error.code === 'timeout',
  );
});

test('ceník validuje vstupy a serverovou konfiguraci před síťovým požadavkem', async () => {
  for (const courtId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => readCourtPaymentPrice(courtId, env), CourtPaymentPriceConfigurationError);
  }
  await assert.rejects(() => readCourtPaymentPrice(1, {}), CourtPaymentPriceConfigurationError);
  await assert.rejects(
    () => readCourtPaymentPrice(1, { ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co/path' }),
    CourtPaymentPriceConfigurationError,
  );
  await assert.rejects(() => readCourtPaymentPrice(1, env, fetch, { timeoutMs: 99 }), CourtPaymentPriceConfigurationError);
});
