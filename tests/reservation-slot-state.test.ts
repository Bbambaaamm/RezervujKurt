import test from 'node:test';
import assert from 'node:assert/strict';

import { getReservationSlotClassName, getReservationSlotState } from '../lib/services/reservation-slot-state';
import type { Reservation } from '../lib/types/domain';

function createReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: 'res-1',
    courtId: 1,
    date: '2026-05-20',
    fromHour: 9,
    toHour: 10,
    status: 'potvrzeno',
    userType: 'clen',
    name: 'Test',
    email: 'test@example.com',
    phone: '123',
    paymentMethod: 'online_placeholder',
    createdAt: '2026-05-20T09:00:00Z',
    ...overrides,
  };
}

test('obsazený slot má occupied state i styl', () => {
  const slot = getReservationSlotState([createReservation({ status: 'potvrzeno' })], 1, '2026-05-20', 9, 9.5);
  assert.equal(slot.isOccupied, true);

  const className = getReservationSlotClassName(slot.type, false);
  assert.match(className, /bg-emerald-200/);
});

test('volný slot zůstává volný', () => {
  const slot = getReservationSlotState([createReservation({ date: '2026-05-21' })], 1, '2026-05-20', 9, 9.5);
  assert.equal(slot.isOccupied, false);

  const className = getReservationSlotClassName(slot.type, false);
  assert.match(className, /bg-white/);
});

test('zrušená rezervace se netváří jako obsazená', () => {
  const slot = getReservationSlotState([createReservation({ status: 'zruseno' })], 1, '2026-05-20', 9, 9.5);
  assert.equal(slot.isOccupied, false);

  const className = getReservationSlotClassName(slot.type, false);
  assert.match(className, /bg-white/);
});

test('selected stav přidá ring i u obsazeného slotu', () => {
  const className = getReservationSlotClassName('cekajici', true);
  assert.match(className, /ring-2/);
  assert.match(className, /bg-amber-200/);
});

test('rezervace 16:00–18:00 blokuje 16:00 a 17:00, ale ne 15:00 ani 18:00', () => {
  const reservations = [createReservation({ fromHour: 16, toHour: 18, status: 'cekajici' })];

  assert.equal(getReservationSlotState(reservations, 1, '2026-05-20', 16, 17).isOccupied, true);
  assert.equal(getReservationSlotState(reservations, 1, '2026-05-20', 17, 18).isOccupied, true);
  assert.equal(getReservationSlotState(reservations, 1, '2026-05-20', 15, 16).isOccupied, false);
  assert.equal(getReservationSlotState(reservations, 1, '2026-05-20', 18, 19).isOccupied, false);
});

test('integrační denní scénář: 3 kurty, pending na Kurtu 2 od 16:00 do 18:00', () => {
  const reservations = [
    createReservation({
      id: 'day-res-1',
      courtId: 2,
      date: '2026-05-22',
      fromHour: 16,
      toHour: 18,
      status: 'cekajici',
    }),
  ];

  const slotKurt2_16 = getReservationSlotState(reservations, 2, '2026-05-22', 16, 17);
  const slotKurt2_17 = getReservationSlotState(reservations, 2, '2026-05-22', 17, 18);
  const slotKurt1_16 = getReservationSlotState(reservations, 1, '2026-05-22', 16, 17);
  const slotKurt3_17 = getReservationSlotState(reservations, 3, '2026-05-22', 17, 18);

  assert.equal(slotKurt2_16.isOccupied, true);
  assert.equal(slotKurt2_17.isOccupied, true);
  assert.equal(slotKurt1_16.isOccupied, false);
  assert.equal(slotKurt3_17.isOccupied, false);
});
