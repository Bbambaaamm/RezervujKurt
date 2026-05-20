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
}): Response {
  const headers = new Headers();
  if (params.contentRange) headers.set('content-range', params.contentRange);

  return new Response(params.body ?? '', {
    status: params.status,
    statusText: params.statusText ?? 'OK',
    headers,
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('cancelMyReservation: konstruuje PATCH endpoint s id, user_id a status filtrem', async () => {
  const { cancelMyReservation } = await import('../lib/services/my-reservations');

  let calledUrl = '';
  let calledBody = '';
  let calledMethod = '';

  globalThis.fetch = async (input, init) => {
    calledUrl = String(input);
    calledBody = String(init?.body ?? '');
    calledMethod = String(init?.method ?? '');

    return createResponse({
      status: 200,
      body: '[{"id":"res-1","status":"cancelled"}]',
      contentRange: '0-0/1',
    });
  };

  await cancelMyReservation({
    session: { access_token: 'token', user: { id: 'user-1', email: 'u@example.com' } },
    reservationId: 'res-1',
  });

  assert.equal(calledMethod, 'PATCH');
  assert.match(calledUrl, /id=eq\.res-1/);
  assert.match(calledUrl, /user_id=eq\.user-1/);
  assert.match(calledUrl, /status=in\.\(pending,approved\)/);
  assert.deepEqual(JSON.parse(calledBody), { status: 'cancelled' });
});

test('cancelMyReservation: empty representation mapuje na stale/no-op chybu', async () => {
  const { cancelMyReservation } = await import('../lib/services/my-reservations');

  globalThis.fetch = async () => createResponse({ status: 200, body: '[]' });

  await assert.rejects(
    () => cancelMyReservation({
      session: { access_token: 'token', user: { id: 'user-1', email: 'u@example.com' } },
      reservationId: 'res-1',
    }),
    (error: unknown) => error instanceof ReservationNoLongerPendingError,
  );
});

test('cancelMyReservation: Content-Range */0 mapuje na stale/no-op chybu', async () => {
  const { cancelMyReservation } = await import('../lib/services/my-reservations');

  globalThis.fetch = async () => createResponse({ status: 200, body: '[{"id":"res-1"}]', contentRange: '*/0' });

  await assert.rejects(
    () => cancelMyReservation({
      session: { access_token: 'token', user: { id: 'user-1', email: 'u@example.com' } },
      reservationId: 'res-1',
    }),
    (error: unknown) => error instanceof ReservationNoLongerPendingError,
  );
});

test('cancelMyReservation: 403 mapuje na ReservationUnauthorizedError', async () => {
  const { cancelMyReservation } = await import('../lib/services/my-reservations');

  globalThis.fetch = async () => createResponse({ status: 403, statusText: 'Forbidden', body: '{}' });

  await assert.rejects(
    () => cancelMyReservation({
      session: { access_token: 'token', user: { id: 'user-1', email: 'u@example.com' } },
      reservationId: 'res-1',
    }),
    (error: unknown) => error instanceof ReservationUnauthorizedError,
  );
});

test('isMyReservationCancelable: minulá rezervace není zrušitelná', async () => {
  const { isMyReservationCancelable } = await import('../lib/services/my-reservations');

  const result = isMyReservationCancelable({ reservationDate: '2026-05-19', timeFrom: '10:00:00', status: 'approved' }, new Date('2026-05-20T00:00:00Z'));
  assert.equal(result, false);
});

test('isMyReservationCancelable: cancelled rezervace není zrušitelná', async () => {
  const { isMyReservationCancelable } = await import('../lib/services/my-reservations');

  const result = isMyReservationCancelable({ reservationDate: '2026-05-21', timeFrom: '10:00:00', status: 'cancelled' }, new Date('2026-05-20T00:00:00Z'));
  assert.equal(result, false);
});
