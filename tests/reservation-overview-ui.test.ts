import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAriaBusy,
  getAriaDisabled,
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
