import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const originalFetch = globalThis.fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function ensureTestAliasBridge() {
  const supabaseDir = path.join(process.cwd(), 'node_modules', '@', 'lib', 'supabase');
  fs.mkdirSync(supabaseDir, { recursive: true });
  fs.writeFileSync(path.join(supabaseDir, 'client.js'), "module.exports = require('../../../../.tmp-tests/lib/supabase/client.js');\n");
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('/rezervace: grid používá názvy sloupců z načtených courts.name', async () => {
  const { getReservationGridColumnLabels } = await import('../lib/services/court-display');

  const labels = getReservationGridColumnLabels([
    { id: 1, name: 'Kurt 3', surface: 'antuka' },
    { id: 2, name: 'Kurt 4', surface: 'antuka' },
    { id: 3, name: 'Kurt 5', surface: 'antuka' },
  ]);

  assert.deepEqual(labels, ['Kurt 3', 'Kurt 4', 'Kurt 5']);
  assert.equal(labels.includes('Kurt 1'), false);
  assert.equal(labels.includes('Kurt 2'), false);
});

test('/moje-rezervace: mapuje court_id 1,2,3 na aktuální courts.name bez fallbacků', async () => {
  ensureTestAliasBridge();

  const responses = [
    [
      { id: 'r1', reservation_date: '2026-06-16', time_from: '09:00:00', time_to: '10:00:00', created_at: null, status: 'approved', note: null, court_id: 1, user_id: 'user-1' },
      { id: 'r2', reservation_date: '2026-06-16', time_from: '10:00:00', time_to: '11:00:00', created_at: null, status: 'approved', note: null, court_id: 2, user_id: 'user-1' },
      { id: 'r3', reservation_date: '2026-06-16', time_from: '11:00:00', time_to: '12:00:00', created_at: null, status: 'approved', note: null, court_id: 3, user_id: 'user-1' },
    ],
    [
      { id: 1, name: 'Kurt 3' },
      { id: 2, name: 'Kurt 4' },
      { id: 3, name: 'Kurt 5' },
    ],
  ];

  globalThis.fetch = async () => createJsonResponse(responses.shift() ?? []);

  const { getMyReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getMyReservationsReadOnly({ access_token: 'access-token', user: { id: 'user-1' } });

  assert.deepEqual(result.map((reservation) => reservation.courtName), ['Kurt 3', 'Kurt 4', 'Kurt 5']);
  assert.equal(result.some((reservation) => /^Kurt #/.test(reservation.courtName)), false);
});

test('/moje-rezervace: fallback Kurt #id použije až při prázdném courts lookupu', async () => {
  ensureTestAliasBridge();

  const responses = [
    [{ id: 'r1', reservation_date: '2026-06-16', time_from: '09:00:00', time_to: '10:00:00', created_at: null, status: 'approved', note: null, court_id: 1, user_id: 'user-1' }],
    [],
  ];

  globalThis.fetch = async () => createJsonResponse(responses.shift() ?? []);

  const { getMyReservationsReadOnly } = await import('../lib/services/read-only');
  const result = await getMyReservationsReadOnly({ access_token: 'access-token', user: { id: 'user-1' } });

  assert.equal(result[0].courtName, 'Kurt #1');
});
