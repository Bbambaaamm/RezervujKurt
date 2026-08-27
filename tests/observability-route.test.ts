import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';

import { POST } from '../app/api/observability/route';

async function post(payload: unknown) {
  return POST(new Request('http://localhost/api/observability', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as NextRequest);
}

test('observability route přijme povolený pevný auth error code', async () => {
  const originalWarn = console.warn;
  const loggedEvents: unknown[] = [];
  console.warn = (event: unknown) => loggedEvents.push(event);

  try {
    const response = await post({
      level: 'warn',
      operation: 'auth.magic_link',
      errorCode: 'AUTH_MAGIC_LINK_FAILED',
    });

    assert.equal(response.status, 200);
    assert.equal(loggedEvents.length, 1);
    assert.equal((loggedEvents[0] as { errorCode: string }).errorCode, 'AUTH_MAGIC_LINK_FAILED');
  } finally {
    console.warn = originalWarn;
  }
});

test('observability route odmítne e-mail i nekontrolovaný Error.message v metadata', async () => {
  const originalWarn = console.warn;
  const loggedEvents: unknown[] = [];
  console.warn = (event: unknown) => loggedEvents.push(event);

  try {
    const response = await post({
      level: 'warn',
      operation: 'auth.magic_link',
      errorCode: 'AUTH_MAGIC_LINK_FAILED',
      metadata: { errorMessage: 'Přihlášení uzivatel@example.cz selhalo' },
    });

    assert.equal(response.status, 400);
    assert.deepEqual(loggedEvents, []);
  } finally {
    console.warn = originalWarn;
  }
});

test('observability route odmítne token a Authorization hodnotu i v neočekávaných polích', async () => {
  for (const extra of [
    { token: 'secret-access-token' },
    { authorization: 'Bearer secret-access-token' },
    { message: 'Bearer secret-access-token' },
  ]) {
    const response = await post({
      level: 'warn',
      operation: 'auth.sign_out',
      errorCode: 'AUTH_SIGN_OUT_FAILED',
      ...extra,
    });
    assert.equal(response.status, 400);
  }
});

test('observability route odmítne nepovolenou operaci, level a error code', async () => {
  const payloads = [
    { level: 'error', operation: 'reservation.create', errorCode: 'RESERVATION_WRITE_FAILED' },
    { level: 'error', operation: 'auth.magic_link', errorCode: 'AUTH_MAGIC_LINK_FAILED' },
    { level: 'warn', operation: 'auth.magic_link', errorCode: 'LIBOVOLNY_KOD' },
  ];

  for (const payload of payloads) {
    assert.equal((await post(payload)).status, 400);
  }
});
