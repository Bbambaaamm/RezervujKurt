import test from 'node:test';
import assert from 'node:assert/strict';

import { buildObservabilityEvent } from '../lib/services/observability';

test('observability event rozlišuje prostředí a typ operace', () => {
  const event = buildObservabilityEvent({
    level: 'error',
    environment: 'preview',
    operation: 'reservation.create',
    message: 'Vytvoření rezervace selhalo.',
    metadata: { status: 500 },
  });

  assert.equal(event.environment, 'staging');
  assert.equal(event.operation, 'reservation.create');
  assert.equal(event.level, 'error');
  assert.equal(event.metadata.status, 500);
});

test('observability event rediguje citlivé hodnoty podle názvu klíče', () => {
  const event = buildObservabilityEvent({
    level: 'warn',
    environment: 'production',
    operation: 'auth.magic_link',
    message: 'Magic link selhal.',
    metadata: {
      accessToken: 'secret-token',
      authorizationHeader: 'Bearer secret-token',
      email: 'uzivatel@example.com',
      userId: 'safe-user-id',
      status: 429,
    },
  });

  assert.equal(event.metadata.accessToken, '[redacted]');
  assert.equal(event.metadata.authorizationHeader, '[redacted]');
  assert.equal(event.metadata.email, '[redacted]');
  assert.equal(event.metadata.userId, 'safe-user-id');
  assert.equal(event.metadata.status, 429);
});
