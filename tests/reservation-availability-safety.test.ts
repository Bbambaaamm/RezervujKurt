import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESERVATION_AVAILABILITY_LOAD_ERROR,
  RESERVATION_AVAILABILITY_PRECHECK_ERROR,
  canUseReservationMockFallback,
  getReservationAvailabilityLoadErrorMessage,
  getReservationAvailabilityPrecheckErrorMessage,
  shouldBlockReservationSubmit,
} from '../lib/services/reservation-availability-safety';

test('produkční režim nepovolí mock fallback při selhání načtení rezervací', () => {
  assert.equal(canUseReservationMockFallback('production'), false);
});

test('development režim ponechá mock fallback jen jako vývojovou pomůcku', () => {
  assert.equal(canUseReservationMockFallback('development'), true);
});

test('selhání načtení rezervací nastaví blokující českou hlášku pro produkci', () => {
  assert.equal(
    getReservationAvailabilityLoadErrorMessage(),
    RESERVATION_AVAILABILITY_LOAD_ERROR,
  );
  assert.match(getReservationAvailabilityLoadErrorMessage(), /dostupnost rezervací se nepodařilo načíst/i);
});

test('neověřená dostupnost blokuje odeslání rezervace', () => {
  assert.equal(
    shouldBlockReservationSubmit({
      reservationsLoadError: RESERVATION_AVAILABILITY_LOAD_ERROR,
      availabilityWarning: null,
    }),
    true,
  );
});

test('selhání availability prechecku vrací blokující hlášku a submit má být zastaven', () => {
  assert.equal(
    getReservationAvailabilityPrecheckErrorMessage(),
    RESERVATION_AVAILABILITY_PRECHECK_ERROR,
  );
  assert.equal(
    shouldBlockReservationSubmit({
      reservationsLoadError: null,
      availabilityWarning: RESERVATION_AVAILABILITY_PRECHECK_ERROR,
    }),
    true,
  );
});

test('běžný průchod po úspěšném ověření dostupnosti není blokovaný', () => {
  assert.equal(
    shouldBlockReservationSubmit({
      reservationsLoadError: null,
      availabilityWarning: null,
    }),
    false,
  );
});
