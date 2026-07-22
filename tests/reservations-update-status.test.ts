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

test('updateReservationStatus: 403 mapuje na ReservationUnauthorizedError', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  globalThis.fetch = async () => createResponse({
    status: 403,
    statusText: 'Forbidden',
    body: JSON.stringify({ message: 'forbidden' }),
  });

  await assert.rejects(
    () => updateReservationStatus({ accessToken: 'token', reservationId: 'res-1', status: 'approved' }),
    (error: unknown) => error instanceof ReservationUnauthorizedError,
  );
});

test('updateReservationStatus: 42501 mapuje na ReservationUnauthorizedError', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  globalThis.fetch = async () => createResponse({
    status: 500,
    statusText: 'Internal Server Error',
    body: JSON.stringify({ code: '42501' }),
  });

  await assert.rejects(
    () => updateReservationStatus({ accessToken: 'token', reservationId: 'res-1', status: 'approved' }),
    (error: unknown) => error instanceof ReservationUnauthorizedError,
  );
});

test('updateReservationStatus: prázdná unauthorized odpověď mapuje na ReservationUnauthorizedError', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  globalThis.fetch = async () => createResponse({
    status: 403,
    statusText: 'Forbidden',
    body: '',
  });

  await assert.rejects(
    () => updateReservationStatus({ accessToken: 'token', reservationId: 'res-1', status: 'approved' }),
    (error: unknown) => error instanceof ReservationUnauthorizedError,
  );
});

test('updateReservationStatus: výchozí admin akce zůstává omezená na pending', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  let requestedUrl = '';
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return createResponse({
      status: 200,
      body: '[{"id":"res-1","status":"approved"}]',
      contentRange: '0-0/1',
    });
  };

  await updateReservationStatus({ accessToken: 'token', reservationId: 'res-1', status: 'approved' });

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('status'), 'eq.pending');
});


test('updateReservationStatus: admin approve serverová mutace nikdy necílí waiting_for_payment', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  let requestedUrl = '';
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return createResponse({
      status: 200,
      body: '[]',
      contentRange: '*/0',
    });
  };

  await assert.rejects(
    () => updateReservationStatus({ accessToken: 'token', reservationId: 'res-waiting', status: 'approved' }),
    (error: unknown) => error instanceof ReservationNoLongerPendingError,
  );

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('status'), 'eq.pending');
  assert.doesNotMatch(requestedUrl, /waiting_for_payment/);
});


test('updateReservationStatus: admin cancel serverová mutace nikdy necílí waiting_for_payment', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  let requestedUrl = '';
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return createResponse({
      status: 200,
      body: '[]',
      contentRange: '*/0',
    });
  };

  await assert.rejects(
    () => updateReservationStatus({
      accessToken: 'token',
      reservationId: 'res-waiting',
      status: 'cancelled',
      fromStatuses: ['pending', 'approved'],
    }),
    (error: unknown) => error instanceof ReservationNoLongerPendingError,
  );

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('status'), 'in.(pending,approved)');
  assert.doesNotMatch(requestedUrl, /waiting_for_payment/);
});

test('updateReservationStatus: admin může cíleně rušit pending i approved rezervace', async () => {
  const { updateReservationStatus } = await import('../lib/services/reservations');

  let requestedUrl = '';
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return createResponse({
      status: 200,
      body: '[{"id":"res-1","status":"cancelled"}]',
      contentRange: '0-0/1',
    });
  };

  await updateReservationStatus({
    accessToken: 'token',
    reservationId: 'res-1',
    status: 'cancelled',
    fromStatuses: ['pending', 'approved'],
  });

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('status'), 'in.(pending,approved)');
});
