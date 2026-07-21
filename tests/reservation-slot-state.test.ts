import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReservationSlotRenderClassName,
  getReservationSlotCellClassName,
  getReservationSlotClassName,
  getReservationSlotState,
  isReservationSlotSelected,
} from '../lib/services/reservation-slot-state';
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
  assert.match(className, /bg-rose-50/);
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

test('selected stav nepřebije occupied slot', () => {
  const className = getReservationSlotClassName('cekajici', true);
  assert.doesNotMatch(className, /ring-2/);
  assert.match(className, /bg-amber-50/);
});

test('selected volný slot dostane viditelnou selected class', () => {
  const className = getReservationSlotClassName('volno', true);
  assert.match(className, /ring-1/);
  assert.match(className, /bg-blue-500/);
  assert.match(className, /text-white/);
});

test('obsazený slot má prioritu před selected', () => {
  const className = getReservationSlotClassName('potvrzeno', true);
  assert.match(className, /bg-rose-50/);
  assert.doesNotMatch(className, /bg-blue-500/);
});

test('free slot nemá occupied ani selected class bez výběru', () => {
  const className = getReservationSlotClassName('volno', false);
  assert.doesNotMatch(className, /bg-rose-50|bg-amber-50|bg-rose-100/);
  assert.doesNotMatch(className, /ring-2/);
  assert.match(className, /hover:bg-sky-50/);
});

test('čekající slot má viditelné barevné pozadí', () => {
  const className = getReservationSlotClassName('cekajici', false);
  assert.match(className, /bg-amber-50/);
});

test('rezervace čekající na platbu má viditelné barevné pozadí', () => {
  const slot = getReservationSlotState([createReservation({ status: 'ceka_na_platbu' })], 1, '2026-05-20', 9, 9.5);
  assert.equal(slot.isOccupied, true);
  assert.equal(slot.label, 'Čeká na platbu');

  const className = getReservationSlotClassName(slot.type, false);
  assert.match(className, /bg-sky-50/);
});

test('potvrzený slot má viditelné barevné pozadí', () => {
  const className = getReservationSlotClassName('potvrzeno', false);
  assert.match(className, /bg-rose-50/);
});

test('selected free slot nepoužívá hover, který by přebil selected', () => {
  const className = getReservationSlotClassName('volno', true);
  assert.doesNotMatch(className, /hover:bg-sky-50/);
});

test('cancelled není occupied a má free vzhled', () => {
  const slot = getReservationSlotState([createReservation({ status: 'zruseno' })], 1, '2026-05-20', 9, 9.5);
  assert.equal(slot.isOccupied, false);
  const className = getReservationSlotClassName(slot.type, false);
  assert.match(className, /bg-white/);
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

test('recovery G: kurt 2 dne 2026-05-21 s pending 16:00:00–18:00:00 blokuje správné půlhodiny', () => {
  const reservations = [
    createReservation({
      id: 'recovery-g-1',
      courtId: 2,
      date: '2026-05-21',
      fromHour: 16,
      toHour: 18,
      status: 'cekajici',
    }),
  ];

  assert.equal(getReservationSlotState(reservations, 2, '2026-05-21', 16, 16.5).isOccupied, true);
  assert.equal(getReservationSlotState(reservations, 2, '2026-05-21', 17.5, 18).isOccupied, true);
  assert.equal(getReservationSlotState(reservations, 2, '2026-05-21', 18, 18.5).isOccupied, false);
});


test('hlavní slot container dostane plné rozměry i pro čekající slot', () => {
  const className = getReservationSlotCellClassName('cekajici', false);
  assert.match(className, /block/);
  assert.match(className, /min-h-\[48px\]/);
  assert.match(className, /w-full/);
});

test('hlavní slot container dostane selected text styl bez konfliktu hoveru', () => {
  const className = getReservationSlotCellClassName('volno', true);
  assert.match(className, /text-white/);
  assert.doesNotMatch(className, /hover:bg-sky-50/);
});


test('helper pro render root elementu čekajícího slotu obsahuje background class', () => {
  const className = buildReservationSlotRenderClassName('cekajici', false);
  assert.match(className, /bg-amber-50/);
  assert.match(className, /border-amber-300/);
});

test('helper pro render root elementu selected slotu obsahuje selected background', () => {
  const className = buildReservationSlotRenderClassName('volno', true);
  assert.match(className, /bg-blue-500/);
  assert.match(className, /ring-blue-300\/50/);
});

test('status text class není jediný zdroj stylu root elementu', () => {
  const rootClassName = buildReservationSlotRenderClassName('cekajici', false);
  const textClassName = getReservationSlotCellClassName('cekajici', false);

  assert.match(rootClassName, /bg-/);
  assert.doesNotMatch(rootClassName, /min-h-[76px] text-left/);
  assert.match(textClassName, /min-h-\[48px\]/);
  assert.match(textClassName, /text-left/);
});

test('selection courtId 2 od 17.5 do 19 označí všechny sloty v intervalu', () => {
  const selection = { courtId: 2, timeFrom: 17.5, timeTo: 19 };
  assert.equal(isReservationSlotSelected(selection, 2, 17.5, 18), true);
  assert.equal(isReservationSlotSelected(selection, 2, 18, 18.5), true);
  assert.equal(isReservationSlotSelected(selection, 2, 18.5, 19), true);
});

test('selection courtId 2 od 17:30 do 19:00 dá selected root class třem půlhodinám', () => {
  const selection = { courtId: 2, timeFrom: '17:30', timeTo: '19:00' };
  const slots: Array<[number, number]> = [
    [17.5, 18],
    [18, 18.5],
    [18.5, 19],
  ];

  for (const [from, to] of slots) {
    const isSelected = isReservationSlotSelected(selection, 2, from, to);
    assert.equal(isSelected, true);
    const rootClassName = buildReservationSlotRenderClassName('volno', isSelected);
    assert.match(rootClassName, /bg-blue-500/);
    assert.match(rootClassName, /ring-1/);
  }
});

test('parent selection shape courtId/timeFrom/timeTo označí sloty 17.5, 18, 18.5 jako selected', () => {
  const selection = { courtId: 2, timeFrom: '17:30', timeTo: '19:00' };
  assert.equal(isReservationSlotSelected(selection, 2, 17.5, 18), true);
  assert.equal(isReservationSlotSelected(selection, 2, 18, 18.5), true);
  assert.equal(isReservationSlotSelected(selection, 2, 18.5, 19), true);
});

test('selection helper je kompatibilní i s from/to a string courtId', () => {
  const selection = { courtId: '2', from: '17:30', to: '19:00' };
  assert.equal(isReservationSlotSelected(selection, 2, 17.5, 18), true);
});

test('slot mimo interval není selected', () => {
  const selection = { courtId: 2, timeFrom: 17.5, timeTo: 19 };
  assert.equal(isReservationSlotSelected(selection, 2, 17, 17.5), false);
  assert.equal(isReservationSlotSelected(selection, 2, 19, 19.5), false);
});

test('normalizace času podporuje 17:30, 17.5 i 17:30:00', () => {
  assert.equal(isReservationSlotSelected({ courtId: 2, timeFrom: '17:30', timeTo: '19:00' }, 2, 18, 18.5), true);
  assert.equal(isReservationSlotSelected({ courtId: 2, timeFrom: '17.5', timeTo: 19 }, 2, 18, 18.5), true);
  assert.equal(isReservationSlotSelected({ courtId: 2, timeFrom: '17:30:00', timeTo: '19:00:00' }, 2, 18, 18.5), true);
});

test('selected free slot má výrazný blue styl a hover jej nepřepíše', () => {
  const className = getReservationSlotClassName('volno', true);
  assert.match(className, /bg-blue-500/);
  assert.match(className, /border-blue-500/);
  assert.match(className, /text-white/);
  assert.match(className, /ring-blue-300\/50/);
  assert.doesNotMatch(className, /hover:bg-sky-50/);
});

test('obsazený slot v selected intervalu zůstane obsazený', () => {
  const className = getReservationSlotClassName('potvrzeno', true);
  assert.match(className, /bg-rose-50/);
  assert.doesNotMatch(className, /bg-blue-500/);
});
