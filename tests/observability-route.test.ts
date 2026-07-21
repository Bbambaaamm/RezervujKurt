import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';

import { POST } from '../app/api/observability/route';

test('observability route přijme povolenou auth událost a zaloguje ji na serveru', async () => {
  const originalWarn = console.warn;
  const loggedEvents: unknown[] = [];
  console.warn = (event: unknown) => {
    loggedEvents.push(event);
  };

  try {
    const response = await POST(new Request('http://localhost/api/observability', {
      method: 'POST',
      body: JSON.stringify({
        level: 'warn',
        operation: 'auth.magic_link',
        message: 'Odeslání magic linku selhalo.',
        metadata: { errorMessage: 'Email rate limit exceeded', email: 'user@example.com' },
      }),
    }) as NextRequest);

    assert.equal(response.status, 200);
    assert.equal(loggedEvents.length, 1);
    assert.equal((loggedEvents[0] as { operation: string }).operation, 'auth.magic_link');
    assert.equal(
      ((loggedEvents[0] as { metadata: Record<string, unknown> }).metadata).email,
      '[redacted]',
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('observability route odmítne nepovolenou klientskou operaci', async () => {
  const response = await POST(new Request('http://localhost/api/observability', {
    method: 'POST',
    body: JSON.stringify({
      level: 'error',
      operation: 'reservation.create',
      message: 'Nepovolená klientská událost.',
    }),
  }) as NextRequest);

  assert.equal(response.status, 400);
});
