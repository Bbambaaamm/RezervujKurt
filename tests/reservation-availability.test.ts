import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

test.afterEach(() => {
  globalThis.fetch = originalFetch;
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
    accessToken: 'token',
    courtId: 2,
    reservationDate: '2026-05-20',
    timeFrom: '10:00',
    timeTo: '11:00',
  });

  assert.equal(available, false);

  const parsedUrl = new URL(capturedUrl);
  assert.equal(parsedUrl.pathname, '/rest/v1/reservations');
  assert.equal(parsedUrl.searchParams.get('select'), 'time_from,time_to,status');
  assert.equal(parsedUrl.searchParams.get('court_id'), 'eq.2');
  assert.equal(parsedUrl.searchParams.get('reservation_date'), 'eq.2026-05-20');
  assert.equal(parsedUrl.searchParams.get('status'), 'in.(pending,approved)');
});

test('checkReservationSlotAvailability: bez overlapu vrací true', async () => {
  const { checkReservationSlotAvailability } = await import('../lib/services/reservations');

  globalThis.fetch = async () => new Response(
    JSON.stringify([{ time_from: '08:00', time_to: '09:00', status: 'pending' }]),
    { status: 200 },
  );

  const available = await checkReservationSlotAvailability({
    accessToken: 'token',
    courtId: 2,
    reservationDate: '2026-05-20',
    timeFrom: '09:00',
    timeTo: '10:00',
  });

  assert.equal(available, true);
});
