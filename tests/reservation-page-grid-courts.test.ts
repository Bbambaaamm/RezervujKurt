import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Court, Reservation } from '../lib/types/domain';

const originalFetch = globalThis.fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: 'reservation-test',
    courtId: 1,
    date: '2026-06-16',
    fromHour: 9,
    toHour: 10,
    status: 'potvrzeno',
    userType: 'clen',
    name: 'Testovací rezervace',
    email: 'test@example.com',
    phone: '123456789',
    paymentMethod: 'online_placeholder',
    createdAt: '2026-06-16T09:00:00Z',
    ...overrides,
  };
}

function ensureTestAliasBridge() {
  const libDir = path.join(process.cwd(), 'node_modules', '@', 'lib');
  fs.mkdirSync(path.join(libDir, 'services'), { recursive: true });
  fs.writeFileSync(path.join(libDir, 'mockData.js'), "module.exports = require('../../../.tmp-tests/lib/mockData.js');\n");
  fs.writeFileSync(path.join(libDir, 'services', 'court-display.js'), "module.exports = require('../../../../.tmp-tests/lib/services/court-display.js');\n");
  fs.writeFileSync(path.join(libDir, 'services', 'reservation-slot-state.js'), "module.exports = require('../../../../.tmp-tests/lib/services/reservation-slot-state.js');\n");
}

async function renderGrid(courts: Court[], reservations: Reservation[]) {
  ensureTestAliasBridge();
  const { ReservationGrid } = await import('../components/reservation-grid');

  return renderToStaticMarkup(
    React.createElement(ReservationGrid, { selectedDate: '2026-06-16', courts, reservations }),
  );
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('/rezervace dostane aktivní courts s aktuálními názvy z public.courts.name', async () => {
  globalThis.fetch = async () => createJsonResponse([
    { id: 1, name: 'Kurt 3', is_active: true },
    { id: 2, name: 'Kurt 4', is_active: true },
    { id: 3, name: 'Kurt 5', is_active: true },
  ]);

  const { getCourtsReadOnly } = await import('../lib/services/read-only');
  const courts = await getCourtsReadOnly();

  assert.deepEqual(courts.map((court) => court.name), ['Kurt 3', 'Kurt 4', 'Kurt 5']);
  assert.deepEqual(courts.map((court) => court.id), [1, 2, 3]);
});

test('/rezervace grid vykreslí názvy kurtů a obsazenost podle court_id', async () => {
  const courts: Court[] = [
    { id: 1, name: 'Kurt 3', surface: 'antuka' },
    { id: 2, name: 'Kurt 4', surface: 'antuka' },
    { id: 3, name: 'Kurt 5', surface: 'antuka' },
  ];
  const reservations = [
    createReservation({ id: 'r1', courtId: 1, note: 'Rezervace pro Kurt 3' }),
    createReservation({ id: 'r2', courtId: 2, fromHour: 10, toHour: 11, note: 'Rezervace pro Kurt 4' }),
    createReservation({ id: 'r3', courtId: 3, fromHour: 11, toHour: 12, note: 'Rezervace pro Kurt 5' }),
  ];

  const markup = await renderGrid(courts, reservations);

  assert.match(markup, /Kurt 3/);
  assert.match(markup, /Kurt 4/);
  assert.match(markup, /Kurt 5/);
  assert.match(markup, /Kurt 3, 9:00 až 9:30, stav obsazeno, poznámka Rezervace pro Kurt 3/);
  assert.match(markup, /Kurt 4, 10:00 až 10:30, stav obsazeno, poznámka Rezervace pro Kurt 4/);
  assert.match(markup, /Kurt 5, 11:00 až 11:30, stav obsazeno, poznámka Rezervace pro Kurt 5/);
});

test('/rezervace grid nezmizí, když lookup názvů kurtů vrátí prázdný seznam', async () => {
  const markup = await renderGrid([], [createReservation({ courtId: 1 })]);

  assert.match(markup, /Čas/);
  assert.match(markup, /Kurt 1/);
  assert.match(markup, /Kurt 2/);
  assert.match(markup, /Kurt 3/);
});
