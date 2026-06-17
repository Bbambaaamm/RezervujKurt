import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAriaBusy,
  getAriaDisabled,
  getQuickReservationCourtHoursLabel,
  getQuickReservationSummaryLabel,
  getReservationStatusLabel,
  getReservationUserLabel,
  shouldRenderEmptyState,
  shouldRenderLoadingState,
} from '../lib/services/reservation-overview-ui';

test('getReservationUserLabel: fallback chain displayName -> email -> Uživatel', () => {
  assert.equal(getReservationUserLabel({ userDisplayName: 'Jan Novak', userEmail: 'jan@example.com' }), 'Jan Novak');
  assert.equal(getReservationUserLabel({ userDisplayName: null, userEmail: 'jan@example.com' }), 'jan@example.com');
  assert.equal(getReservationUserLabel({ userDisplayName: null, userEmail: null }), 'Uživatel');
});

test('getReservationUserLabel: UUID se nikdy nepoužije jako label', () => {
  const uuid = '2f8f0a1c-d98f-4cfe-bd53-2a59507109f1';
  assert.equal(getReservationUserLabel({ userDisplayName: uuid, userEmail: null }), 'Uživatel');
  assert.equal(getReservationUserLabel({ userDisplayName: null, userEmail: uuid }), 'Uživatel');
});

test('getReservationUserLabel: display_name má prioritu před e-mailem', () => {
  assert.equal(
    getReservationUserLabel({ userDisplayName: '  Petra Svobodová  ', userEmail: 'petra@example.com' }),
    'Petra Svobodová',
  );
});

test('getReservationStatusLabel: mapuje statusy na sjednocené texty', () => {
  assert.equal(getReservationStatusLabel('pending'), 'Čeká na schválení');
  assert.equal(getReservationStatusLabel('approved'), 'Schváleno');
  assert.equal(getReservationStatusLabel('cancelled'), 'Zrušeno');
});

test('empty/loading conditions: vrací očekávané render podmínky', () => {
  assert.equal(shouldRenderLoadingState(true), true);
  assert.equal(shouldRenderLoadingState(false), false);

  assert.equal(shouldRenderEmptyState(false, false, 0), true);
  assert.equal(shouldRenderEmptyState(true, false, 0), false);
  assert.equal(shouldRenderEmptyState(false, true, 0), false);
  assert.equal(shouldRenderEmptyState(false, false, 2), false);
});

test('a11y helpery: aria-disabled a aria-busy', () => {
  assert.equal(getAriaDisabled(true), true);
  assert.equal(getAriaDisabled(false), false);
  assert.equal(getAriaBusy(true), 'true');
  assert.equal(getAriaBusy(false), undefined);
});

test('quick status helpers: zobrazí počet, délku a obsazenost podle kurtů', () => {
  const courtNamesById = new Map([
    [4, 'Kurt 4'],
    [5, 'Kurt 5'],
  ]);

  assert.equal(getQuickReservationSummaryLabel(3, 4), '3 rezervace · 4 h');
  assert.equal(
    getQuickReservationCourtHoursLabel([
      { courtId: 5, fromHour: 12, toHour: 13 },
      { courtId: 4, fromHour: 17, toHour: 18 },
      { courtId: 4, fromHour: 8, toHour: 10 },
    ], courtNamesById),
    'Kurt 4: 3 h · Kurt 5: 1 h',
  );
});

test('quick status helpers: prázdný den zůstává krátký', () => {
  assert.equal(getQuickReservationSummaryLabel(0, 0), 'Zatím volno');
  assert.equal(getQuickReservationCourtHoursLabel([], new Map()), null);
});
