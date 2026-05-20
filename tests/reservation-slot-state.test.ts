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
