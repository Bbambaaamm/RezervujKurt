import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ReservationConflictError,
  ReservationUnauthorizedError,
  ReservationValidationError,
  mapReservationWriteError,
} from '../lib/services/supabase-error-mapping';
import { SupabaseRequestError } from '../lib/supabase/client';

const baseParams = {
  statusText: 'Bad Request',
  endpoint: '/rest/v1/reservations',
  responseBody: '',
};

test('mapReservationWriteError: 23P01 mapuje na kolizi rezervace', () => {
  const error = mapReservationWriteError({
    ...baseParams,
    status: 500,
    responseBody: JSON.stringify({ code: '23P01' }),
  });

  assert.ok(error instanceof ReservationConflictError);
});

test('mapReservationWriteError: HTTP 409 mapuje na kolizi rezervace', () => {
  const error = mapReservationWriteError({
    ...baseParams,
    status: 409,
  });

  assert.ok(error instanceof ReservationConflictError);
});

test('mapReservationWriteError: 42501 mapuje na chybu oprávnění', () => {
  const error = mapReservationWriteError({
    ...baseParams,
    status: 500,
    responseBody: JSON.stringify({ code: '42501' }),
  });

  assert.ok(error instanceof ReservationUnauthorizedError);
});

test('mapReservationWriteError: HTTP 403 mapuje na chybu oprávnění', () => {
  const error = mapReservationWriteError({
    ...baseParams,
    status: 403,
  });

  assert.ok(error instanceof ReservationUnauthorizedError);
});

test('mapReservationWriteError: 22P02 mapuje na validační chybu', () => {
  const error = mapReservationWriteError({
    ...baseParams,
    status: 500,
    responseBody: JSON.stringify({ code: '22P02' }),
  });

  assert.ok(error instanceof ReservationValidationError);
});

test('mapReservationWriteError: HTTP 422 mapuje na validační chybu', () => {
  const error = mapReservationWriteError({
    ...baseParams,
    status: 422,
  });

  assert.ok(error instanceof ReservationValidationError);
});

test('mapReservationWriteError: fallback mapuje na SupabaseRequestError', () => {
  const error = mapReservationWriteError({
    ...baseParams,
    status: 500,
    statusText: 'Internal Server Error',
    responseBody: JSON.stringify({ code: 'XX000' }),
  });

  assert.ok(error instanceof SupabaseRequestError);
});
