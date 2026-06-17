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

  const result = isMyReservationCancelable({ reservationDate: '2026-01-10', timeFrom: '10:00:00', status: 'approved' }, new Date('2026-01-10T10:00:01+01:00'));
  assert.equal(result, false);
});

test('isMyReservationCancelable: budoucí rezervace je zrušitelná v business timezone Europe/Prague', async () => {
  const { isMyReservationCancelable } = await import('../lib/services/my-reservations');

  const result = isMyReservationCancelable({ reservationDate: '2026-01-10', timeFrom: '10:00:00', status: 'approved' }, new Date('2026-01-10T09:59:59+01:00'));
  assert.equal(result, true);
});

test('isMyReservationCancelable: výsledek nezávisí na timezone zařízení', async () => {
  const { isMyReservationCancelable } = await import('../lib/services/my-reservations');

  const nowAbsolute = new Date('2026-01-10T08:30:00Z');
  const result = isMyReservationCancelable({ reservationDate: '2026-01-10', timeFrom: '10:00:00', status: 'approved' }, nowAbsolute);

  assert.equal(result, true);
});

test('isMyReservationCancelable: cancelled rezervace není zrušitelná', async () => {
  const { isMyReservationCancelable } = await import('../lib/services/my-reservations');

  const result = isMyReservationCancelable({ reservationDate: '2026-05-21', timeFrom: '10:00:00', status: 'cancelled' }, new Date('2026-05-20T00:00:00Z'));
  assert.equal(result, false);
});

test('getMyReservationsFeedbackOnReload: zachová success message po reloadu seznamu', async () => {
  const { getMyReservationsFeedbackOnReload } = await import('../lib/services/my-reservations');

  assert.deepEqual(getMyReservationsFeedbackOnReload({ currentSuccessMessage: 'Rezervace byla zrušena.' }), {
    errorMessage: null,
    successMessage: 'Rezervace byla zrušena.',
  });
});


test('getMyReservationsFeedbackOnReload: explicitně zachová success message pro immediate reload po cancel', async () => {
  const { getMyReservationsFeedbackOnReload } = await import('../lib/services/my-reservations');

  assert.deepEqual(
    getMyReservationsFeedbackOnReload({
      currentSuccessMessage: null,
      preservedSuccessMessage: 'Rezervace byla zrušena.',
    }),
    {
      errorMessage: null,
      successMessage: 'Rezervace byla zrušena.',
    },
  );
});

test('isMyReservationUpcoming: budoucí pending a approved rezervace jsou aktuální, zrušené patří do historie', async () => {
  const { isMyReservationUpcoming } = await import('../lib/services/my-reservations');
  const now = new Date('2026-01-10T09:59:59+01:00');

  assert.equal(isMyReservationUpcoming({ reservationDate: '2026-01-10', timeFrom: '10:00:00', status: 'pending' }, now), true);
  assert.equal(isMyReservationUpcoming({ reservationDate: '2026-01-10', timeFrom: '10:00:00', status: 'approved' }, now), true);
  assert.equal(isMyReservationUpcoming({ reservationDate: '2026-01-10', timeFrom: '10:00:00', status: 'cancelled' }, now), false);
  assert.equal(isMyReservationUpcoming({ reservationDate: '2026-01-10', timeFrom: '09:00:00', status: 'approved' }, now), false);
});
