import test from 'node:test';
import assert from 'node:assert/strict';

import { getPragueTodayDate, isReservationStartInPast } from '../lib/services/reservation-time';

test('isReservationStartInPast blokuje dnešní slot, který už začal v časové zóně kurtu', () => {
  const now = new Date('2026-06-17T14:00:00.000Z'); // 16:00 v Praze během letního času.

  assert.equal(isReservationStartInPast('2026-06-17', '15:30', now), true);
  assert.equal(isReservationStartInPast('2026-06-17', '16:00', now), true);
  assert.equal(isReservationStartInPast('2026-06-17', '16:30', now), false);
});

test('isReservationStartInPast dovolí budoucí den a blokuje minulý den', () => {
  const now = new Date('2026-06-17T14:00:00.000Z');

  assert.equal(isReservationStartInPast('2026-06-16', '20:00', now), true);
  assert.equal(isReservationStartInPast('2026-06-18', '07:00', now), false);
});

test('getPragueTodayDate vrací business datum kurtu nezávisle na UTC dni', () => {
  assert.equal(getPragueTodayDate(new Date('2026-06-16T22:30:00.000Z')), '2026-06-17');
});
