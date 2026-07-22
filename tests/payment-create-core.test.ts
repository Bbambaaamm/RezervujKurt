import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
