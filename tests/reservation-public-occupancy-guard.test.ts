import test from 'node:test';
import assert from 'node:assert/strict';

import { getReservationSlotClassName, getReservationSlotState } from '../lib/services/reservation-slot-state';
import { isSlotOccupiedByPublicReservations } from '../lib/services/reservation-submit-guard';
import type { Reservation } from '../lib/types/domain';

function reservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: 'r1',
    courtId: 1,
    date: '2026-05-20',
    fromHour: 15.5,
    toHour: 16,
    status: 'cekajici',
    userType: 'clen',
    name: 'Cizí hráč',
    email: 'foreign@example.com',
    phone: '123',
    paymentMethod: 'online_placeholder',
    createdAt: '2026-05-20T10:00:00Z',
    ...overrides,
  };
}

test('grid označí slot jako occupied z public reservations a použije occupied className', () => {
  const reservations = [reservation({ status: 'potvrzeno' })];
  const slot = getReservationSlotState(reservations, 1, '2026-05-20', 15.5, 16);

  assert.equal(slot.isOccupied, true);
  assert.notEqual(slot.type, 'volno');

  const className = getReservationSlotClassName(slot.type, false);
  assert.match(className, /(bg-rose-50|bg-amber-50)/);
});

test('occupied slot není selectable (slot state není volno)', () => {
  const slot = getReservationSlotState([reservation({ status: 'cekajici' })], 1, '2026-05-20', 15.5, 16);
  assert.equal(slot.type, 'cekajici');
  assert.equal(slot.isOccupied, true);
});

test('submit guard při occupied slotu vrací true a flow má zastavit createReservation', () => {
  const occupied = isSlotOccupiedByPublicReservations({
    reservations: [reservation({ status: 'potvrzeno' })],
    courtId: 1,
    date: '2026-05-20',
    timeFrom: '15:30',
    timeTo: '16:00',
  });

  assert.equal(occupied, true);
});

test('cizí pending rezervace blokuje výběr', () => {
  const occupied = isSlotOccupiedByPublicReservations({
    reservations: [reservation({ status: 'cekajici', name: 'Někdo jiný' })],
    courtId: 1,
    date: '2026-05-20',
    timeFrom: '15:30',
    timeTo: '16:00',
  });

  assert.equal(occupied, true);
});

test('cizí rezervace čekající na platbu blokuje výběr', () => {
  const occupied = isSlotOccupiedByPublicReservations({
    reservations: [reservation({ status: 'ceka_na_platbu', name: 'Někdo jiný' })],
    courtId: 1,
    date: '2026-05-20',
    timeFrom: '15:30',
    timeTo: '16:00',
  });

  assert.equal(occupied, true);
});

test('cizí approved rezervace blokuje výběr', () => {
  const occupied = isSlotOccupiedByPublicReservations({
    reservations: [reservation({ status: 'potvrzeno', name: 'Někdo jiný' })],
    courtId: 1,
    date: '2026-05-20',
    timeFrom: '15:30',
    timeTo: '16:00',
  });

  assert.equal(occupied, true);
});

test('cancelled rezervace výběr neblokuje', () => {
  const occupied = isSlotOccupiedByPublicReservations({
    reservations: [reservation({ status: 'zruseno' })],
    courtId: 1,
    date: '2026-05-20',
    timeFrom: '15:30',
    timeTo: '16:00',
  });

  assert.equal(occupied, false);
});
