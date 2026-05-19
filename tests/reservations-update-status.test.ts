import test from 'node:test';
import assert from 'node:assert/strict';

import { ReservationNoLongerPendingError, ReservationUnauthorizedError } from '../lib/services/supabase-error-mapping';

const originalFetch = globalThis.fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

function createResponse(params: {
  status: number;
  statusText?: string;
  body?: string;
  contentRange?: string;
  url?: string;
}): Response {
  const headers = new Headers();
  if (params.contentRange) {
    headers.set('content-range', params.contentRange);
  }

  return new Response(params.body ?? '', {
    status: params.status,
    statusText: params.statusText ?? 'OK',
    headers,
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('updateReservationStatus: 200 + [] mapuje na ReservationNoLongerPendingError', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  globalThis.fetch = async () => createResponse({
    status: 200,
    body: '[]',
  });

  await assert.rejects(
    () => updateReservationStatus({ accessToken: 'token', reservationId: 'res-1', status: 'approved' }),
    (error: unknown) => error instanceof ReservationNoLongerPendingError,
  );
});

test('updateReservationStatus: Content-Range */0 mapuje na ReservationNoLongerPendingError', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  globalThis.fetch = async () => createResponse({
    status: 200,
    body: '[{"id":"res-1"}]',
    contentRange: '*/0',
  });

  await assert.rejects(
    () => updateReservationStatus({ accessToken: 'token', reservationId: 'res-1', status: 'cancelled' }),
    (error: unknown) => error instanceof ReservationNoLongerPendingError,
  );
});

test('updateReservationStatus: neprázdné pole je success', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  globalThis.fetch = async () => createResponse({
    status: 200,
    body: '[{"id":"res-1","status":"approved"}]',
    contentRange: '0-0/1',
  });

  await assert.doesNotReject(() =>
    updateReservationStatus({ accessToken: 'token', reservationId: 'res-1', status: 'approved' }),
  );
});

test('updateReservationStatus: 403/42501 mapuje na ReservationUnauthorizedError', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  globalThis.fetch = async () => createResponse({
    status: 403,
    statusText: 'Forbidden',
    body: JSON.stringify({ code: '42501' }),
  });

  await assert.rejects(
    () => updateReservationStatus({ accessToken: 'token', reservationId: 'res-1', status: 'approved' }),
    (error: unknown) => error instanceof ReservationUnauthorizedError,
  );
});
