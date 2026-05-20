import test from 'node:test';
import assert from 'node:assert/strict';

import { isReservationSlotOccupied } from '../lib/services/reservation-occupancy';
import type { Reservation } from '../lib/types/domain';

function createReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: 'res-1',
    courtId: 1,
    date: '2026-05-20',
    fromHour: 9,
    toHour: 10,
    status: 'cekajici',
    userType: 'clen',
    name: 'Test',
    email: 'test@example.com',
    phone: '123',
    paymentMethod: 'online_placeholder',
    createdAt: '2026-05-20T09:00:00Z',
    ...overrides,
  };
}

test('pending rezervace označí slot jako obsazený', () => {
  const occupied = isReservationSlotOccupied(createReservation({ status: 'cekajici' }), 9, 9.5);
  assert.equal(occupied, true);
});

test('approved rezervace označí slot jako obsazený', () => {
  const occupied = isReservationSlotOccupied(createReservation({ status: 'potvrzeno' }), 9, 9.5);
  assert.equal(occupied, true);
});

test('cancelled rezervace slot neblokuje', () => {
  const occupied = isReservationSlotOccupied(createReservation({ status: 'zruseno' }), 9, 9.5);
  assert.equal(occupied, false);
});

test('9:00 vs 09:00:00 funguje správně při mapování na čísla hodin', () => {
  const occupied = isReservationSlotOccupied(
    createReservation({ fromHour: 9, toHour: 10 }),
    9,
    9.5,
  );

  assert.equal(occupied, true);
});

test('partial overlap slotu s rezervací je obsazený', () => {
  const occupied = isReservationSlotOccupied(createReservation({ fromHour: 9.25, toHour: 10.25 }), 9, 9.5);
  assert.equal(occupied, true);
});

test('touching interval není obsazený', () => {
  const occupied = isReservationSlotOccupied(createReservation({ fromHour: 9.5, toHour: 10.5 }), 9, 9.5);
  assert.equal(occupied, false);
});
