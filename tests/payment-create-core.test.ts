import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReservationPaymentIdempotencyKey,
  buildReservationPaymentIdempotencyPayload,
  calculatePaymentExpiresAt,
  calculateReservationPriceCents,
  resolveReservationPaymentFlow,
} from '../lib/services/payment-create-core';

test('platební flow vyžaduje přihlášení pro anonymního uživatele', () => {
  assert.equal(resolveReservationPaymentFlow('anonymous'), 'requires_login');
});

test('platební flow zachová neplatební cestu pro člena a admina', () => {
  assert.equal(resolveReservationPaymentFlow('member'), 'without_payment');
  assert.equal(resolveReservationPaymentFlow('admin'), 'without_payment');
});

test('platební flow pošle běžného uživatele do GoPay větve', () => {
  assert.equal(resolveReservationPaymentFlow('user'), 'gopay_payment');
});

test('platební flow odmítne runtime hodnotu mimo podporovaný výčet rolí', () => {
  assert.throws(
    () => resolveReservationPaymentFlow('moderator' as never),
    /Nepodporovaná role platebního flow: moderator/,
  );
});

test('výpočet ceny počítá částku serverově z délky rezervace a hodinové sazby', () => {
  assert.equal(calculateReservationPriceCents({ timeFrom: '09:00', timeTo: '09:30', pricePerHourCents: 25000 }), 12500);
  assert.equal(calculateReservationPriceCents({ timeFrom: '09:00', timeTo: '10:00', pricePerHourCents: 25000 }), 25000);
  assert.equal(calculateReservationPriceCents({ timeFrom: '09:00', timeTo: '10:30', pricePerHourCents: 20000 }), 30000);
});

test('výpočet ceny přijme PostgreSQL time formát pouze s nulovými sekundami', () => {
  assert.equal(calculateReservationPriceCents({ timeFrom: '09:00:00', timeTo: '10:00:00', pricePerHourCents: 20000 }), 20000);
});

test('výpočet ceny odmítne čas s nenulovými sekundami', () => {
  assert.throws(
    () => calculateReservationPriceCents({ timeFrom: '09:00:59', timeTo: '10:00:00', pricePerHourCents: 20000 }),
    /Časový rozsah rezervace není platný/,
  );
  assert.throws(
    () => calculateReservationPriceCents({ timeFrom: '09:00:00', timeTo: '10:00:01', pricePerHourCents: 20000 }),
    /Časový rozsah rezervace není platný/,
  );
});

test('výpočet ceny odmítne neplatný formát času a hodnoty mimo denní rozsah', () => {
  for (const timeFrom of ['9:00', '09:0', '24:00', '09:60']) {
    assert.throws(
      () => calculateReservationPriceCents({ timeFrom, timeTo: '10:00', pricePerHourCents: 20000 }),
      /Časový rozsah rezervace není platný/,
    );
  }
});

test('výpočet ceny odmítne neplatný nebo nulový časový rozsah v rámci jednoho rezervačního dne', () => {
  assert.throws(
    () => calculateReservationPriceCents({ timeFrom: '10:00', timeTo: '10:00', pricePerHourCents: 20000 }),
    /Časový rozsah rezervace není platný/,
  );
  assert.throws(
    () => calculateReservationPriceCents({ timeFrom: '10:30', timeTo: '10:00', pricePerHourCents: 20000 }),
    /Časový rozsah rezervace není platný/,
  );
  assert.throws(
    () => calculateReservationPriceCents({ timeFrom: '23:00', timeTo: '00:30', pricePerHourCents: 20000 }),
    /Časový rozsah rezervace není platný/,
  );
});

test('výpočet ceny odmítne neplatnou sazbu', () => {
  for (const pricePerHourCents of [-1, 0, 100.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => calculateReservationPriceCents({ timeFrom: '09:00', timeTo: '10:00', pricePerHourCents }),
      /Hodinová cena rezervace musí být kladná bezpečná celočíselná hodnota v haléřích/,
    );
  }
});

test('výpočet ceny odmítne necelé haléře a výsledek mimo bezpečný rozsah', () => {
  assert.throws(
    () => calculateReservationPriceCents({ timeFrom: '09:00', timeTo: '09:20', pricePerHourCents: 10000 }),
    /Vypočtená cena rezervace musí vycházet na celé haléře/,
  );
  assert.throws(
    () => calculateReservationPriceCents({ timeFrom: '00:00', timeTo: '23:59', pricePerHourCents: Number.MAX_SAFE_INTEGER }),
    /Vypočtená cena rezervace je mimo podporovaný rozsah/,
  );
});

test('výpočet expirace platby posune čas o zadané TTL', () => {
  const expiresAt = calculatePaymentExpiresAt({ now: new Date('2026-07-22T10:00:00.000Z'), ttlMinutes: 15 });

  assert.equal(expiresAt.toISOString(), '2026-07-22T10:15:00.000Z');
});

test('výpočet expirace platby odmítne neplatný výchozí čas nebo TTL', () => {
  assert.throws(
    () => calculatePaymentExpiresAt({ now: new Date('neplatné'), ttlMinutes: 15 }),
    /Výchozí čas pro expiraci platby není platný/,
  );

  for (const ttlMinutes of [-1, 0, 15.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => calculatePaymentExpiresAt({ now: new Date('2026-07-22T10:00:00.000Z'), ttlMinutes }),
      /TTL platby musí být kladný bezpečný počet minut/,
    );
  }
});

test('výpočet expirace platby odmítne výsledek mimo podporovaný rozsah Date', () => {
  assert.throws(
    () => calculatePaymentExpiresAt({ now: new Date(8.64e15), ttlMinutes: 1 }),
    /Výsledný čas expirace platby není platný/,
  );
});



const baseIdempotencyInput = {
  userId: '123e4567-e89b-42d3-a456-426614174000',
  courtId: 2,
  reservationDate: '2026-08-01',
  timeFrom: '09:00',
  timeTo: '10:00',
  amountCents: 25000,
  currency: 'CZK' as const,
};

test('idempotency payload kanonizuje UUID a čas do jednoho stabilního formátu', () => {
  assert.equal(
    buildReservationPaymentIdempotencyPayload(baseIdempotencyInput),
    buildReservationPaymentIdempotencyPayload({
      ...baseIdempotencyInput,
      userId: '123E4567-E89B-42D3-A456-426614174000',
      timeFrom: '09:00:00',
      timeTo: '10:00:00',
    }),
  );
  assert.equal(
    buildReservationPaymentIdempotencyPayload(baseIdempotencyInput),
    JSON.stringify({
      version: 1,
      purpose: 'reservation-payment',
      userId: '123e4567-e89b-42d3-a456-426614174000',
      courtId: 2,
      reservationDate: '2026-08-01',
      timeFrom: '09:00',
      timeTo: '10:00',
      amountCents: 25000,
      currency: 'CZK',
    }),
  );
});

test('idempotency key pro vytvoření platební rezervace je hashovaný a deterministický pro stejný požadavek', () => {
  const key = buildReservationPaymentIdempotencyKey(baseIdempotencyInput);

  assert.equal(
    key,
    buildReservationPaymentIdempotencyKey({
      ...baseIdempotencyInput,
      userId: '123E4567-E89B-42D3-A456-426614174000',
      timeFrom: '09:00:00',
      timeTo: '10:00:00',
    }),
  );
  assert.match(key, /^reservation-payment:v1:[0-9a-f]{64}$/);
  assert.doesNotMatch(key, /123e4567|2026-08-01|09:00|25000/);
  assert.equal(
    key,
    'reservation-payment:v1:b39dbf77ad77cc1ec534e600590c4f15129126fd433815761dad54ae4eef6e21',
  );
});

test('idempotency key rozlišuje každou kanonickou složku požadavku samostatně', () => {
  const baseKey = buildReservationPaymentIdempotencyKey(baseIdempotencyInput);

  const variants = [
    { ...baseIdempotencyInput, userId: '223e4567-e89b-42d3-a456-426614174000' },
    { ...baseIdempotencyInput, courtId: 3 },
    { ...baseIdempotencyInput, reservationDate: '2026-08-02' },
    { ...baseIdempotencyInput, timeFrom: '09:30' },
    { ...baseIdempotencyInput, timeTo: '10:30' },
    { ...baseIdempotencyInput, amountCents: 30000 },
  ];

  for (const variant of variants) {
    assert.notEqual(buildReservationPaymentIdempotencyKey(variant), baseKey);
  }
});

test('idempotency payload odmítne neexistující kalendářní datum', () => {
  for (const reservationDate of ['2026-02-30', '2026-13-01', '2026-00-10', '0000-00-00']) {
    assert.throws(
      () => buildReservationPaymentIdempotencyPayload({ ...baseIdempotencyInput, reservationDate }),
      /Datum rezervace není platné/,
    );
  }
});

test('idempotency payload odmítne neplatný courtId', () => {
  for (const courtId of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => buildReservationPaymentIdempotencyPayload({ ...baseIdempotencyInput, courtId }),
      /Kurt rezervace není platný/,
    );
  }
});

test('idempotency payload odmítne neplatnou částku', () => {
  for (const amountCents of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => buildReservationPaymentIdempotencyPayload({ ...baseIdempotencyInput, amountCents }),
      /Částka rezervace není platná/,
    );
  }
});

test('idempotency payload odmítne neplatné ostatní vstupy před zápisem platby', () => {
  assert.throws(
    () => buildReservationPaymentIdempotencyPayload({ ...baseIdempotencyInput, userId: 'not-a-user-id' }),
    /userId není platná/,
  );

  assert.throws(
    () => buildReservationPaymentIdempotencyPayload({ ...baseIdempotencyInput, timeFrom: '09:00:01' }),
    /Časový rozsah rezervace není platný/,
  );

  assert.throws(
    () => buildReservationPaymentIdempotencyPayload({ ...baseIdempotencyInput, timeFrom: '10:00', timeTo: '09:00' }),
    /Časový rozsah rezervace není platný/,
  );

  assert.throws(
    () => buildReservationPaymentIdempotencyPayload({ ...baseIdempotencyInput, currency: 'EUR' as 'CZK' }),
    /Měna rezervace není platná/,
  );
});

test('normalizace rezervačního slotu pro platební endpoint používá sdílený kontrakt a kanonický čas', async () => {
  const { normalizeReservationPaymentSlotInput } = await import('../lib/services/payment-create-core');

  assert.deepEqual(
    normalizeReservationPaymentSlotInput({ courtId: 2, reservationDate: '2026-08-01', timeFrom: '09:00:00', timeTo: '10:00:00' }),
    { courtId: 2, reservationDate: '2026-08-01', timeFrom: '09:00', timeTo: '10:00' },
  );

  assert.throws(
    () => normalizeReservationPaymentSlotInput({ courtId: 2, reservationDate: '2026-02-30', timeFrom: '09:00', timeTo: '10:00' }),
    /Datum rezervace není platné/,
  );
});
