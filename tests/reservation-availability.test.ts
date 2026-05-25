import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});


test('overlap funguje správně i pro nezero-pad čas 9:00 vs 10:00', async () => {
  const { doesReservationIntervalOverlap } = await import('../lib/services/reservations');
  assert.equal(
    doesReservationIntervalOverlap(
      { timeFrom: '9:00', timeTo: '10:00' },
      { timeFrom: '09:30', timeTo: '10:30' },
    ),
    true,
  );
});

test('09:00 a 9:00 dávají stejný výsledek', async () => {
  const { doesReservationIntervalOverlap } = await import('../lib/services/reservations');

  const padded = doesReservationIntervalOverlap(
    { timeFrom: '09:00', timeTo: '10:00' },
    { timeFrom: '10:00', timeTo: '11:00' },
  );

  const nonPadded = doesReservationIntervalOverlap(
    { timeFrom: '9:00', timeTo: '10:00' },
    { timeFrom: '10:00', timeTo: '11:00' },
  );

  assert.equal(padded, nonPadded);
});

test('touching intervals nejsou kolize', async () => {
  const { doesReservationIntervalOverlap } = await import('../lib/services/reservations');
  assert.equal(
    doesReservationIntervalOverlap(
      { timeFrom: '09:00', timeTo: '10:00' },
      { timeFrom: '10:00', timeTo: '11:00' },
    ),
    false,
  );
});

test('partial overlap je kolize', async () => {
  const { doesReservationIntervalOverlap } = await import('../lib/services/reservations');
  assert.equal(
    doesReservationIntervalOverlap(
      { timeFrom: '09:00', timeTo: '10:30' },
      { timeFrom: '10:00', timeTo: '11:00' },
    ),
    true,
  );
});

test('full overlap je kolize', async () => {
  const { doesReservationIntervalOverlap } = await import('../lib/services/reservations');
  assert.equal(
    doesReservationIntervalOverlap(
      { timeFrom: '09:00', timeTo: '12:00' },
      { timeFrom: '10:00', timeTo: '11:00' },
    ),
    true,
  );
});

test('checkReservationSlotAvailability: pending a approved blokují slot, cancelled neblokuje', async () => {
  const { checkReservationSlotAvailability } = await import('../lib/services/reservations');

  let capturedUrl = '';
  globalThis.fetch = async (input) => {
    capturedUrl = String(input);
    return new Response(
      JSON.stringify([
        { time_from: '08:00', time_to: '09:00', status: 'cancelled' },
        { time_from: '09:30', time_to: '10:30', status: 'pending' },
        { time_from: '11:00', time_to: '12:00', status: 'approved' },
      ]),
      { status: 200 },
    );
  };

  const available = await checkReservationSlotAvailability({
    courtId: 2,
    reservationDate: '2026-05-20',
    timeFrom: '10:00',
    timeTo: '11:00',
  });

  assert.equal(available, false);

  const parsedUrl = new URL(capturedUrl);
  assert.equal(parsedUrl.pathname, '/rest/v1/reservation_public_occupancy');
  assert.equal(parsedUrl.searchParams.get('select'), 'court_id,reservation_date,time_from,time_to,status');
  assert.equal(parsedUrl.searchParams.get('court_id'), 'eq.2');
  assert.equal(parsedUrl.searchParams.get('reservation_date'), 'eq.2026-05-20');
  assert.equal(parsedUrl.searchParams.get('status'), 'in.(pending,approved)');
});

test('checkReservationSlotAvailability: nepoužívá session token a volá anonymní read bez user filtru', async () => {
  let requestedAuth = '';
  let requestedUrl = '';
  const { checkReservationSlotAvailability } = await import('../lib/services/reservations');

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requestedAuth = String(headers.Authorization ?? '');
    return new Response(JSON.stringify([]), { status: 200 });
  };

  await checkReservationSlotAvailability({
    courtId: 1,
    reservationDate: '2026-05-20',
    timeFrom: '09:00',
    timeTo: '10:00',
  });

  const parsedUrl = new URL(requestedUrl);
  assert.equal(requestedAuth, 'Bearer anon-key');
  assert.equal(parsedUrl.searchParams.get('user_id'), null);
});

test('checkReservationSlotAvailability: bez overlapu vrací true', async () => {
  const { checkReservationSlotAvailability } = await import('../lib/services/reservations');

  globalThis.fetch = async () => new Response(
    JSON.stringify([{ time_from: '08:00', time_to: '09:00', status: 'pending' }]),
    { status: 200 },
  );

  const available = await checkReservationSlotAvailability({
    courtId: 2,
    reservationDate: '2026-05-20',
    timeFrom: '09:00',
    timeTo: '10:00',
  });

  assert.equal(available, true);
});

test('checkReservationSlotAvailability: při read chybě vrací read/precheck chybu, ne reservation-write', async () => {
  const { checkReservationSlotAvailability, ReservationAvailabilityReadError } = await import('../lib/services/reservations');

  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: 'forbidden' }),
    { status: 403, statusText: 'Forbidden' },
  );

  await assert.rejects(
    () => checkReservationSlotAvailability({
      courtId: 2,
      reservationDate: '2026-05-20',
      timeFrom: '09:00',
      timeTo: '10:00',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ReservationAvailabilityReadError);
      assert.ok(!String((error as Error).message).includes('reservation-write'));
      return true;
    },
  );
});

test('checkReservationSlotAvailability: cancelled rezervace nevrací conflict', async () => {
  const { checkReservationSlotAvailability } = await import('../lib/services/reservations');

  globalThis.fetch = async () => new Response(
    JSON.stringify([{ time_from: '09:30', time_to: '10:30', status: 'cancelled' }]),
    { status: 200 },
  );

  const available = await checkReservationSlotAvailability({
    courtId: 2,
    reservationDate: '2026-05-20',
    timeFrom: '10:00',
    timeTo: '11:00',
  });

  assert.equal(available, true);
});
