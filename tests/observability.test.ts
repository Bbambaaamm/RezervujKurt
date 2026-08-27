import test from 'node:test';
import assert from 'node:assert/strict';

import { buildObservabilityEvent } from '../lib/services/observability';

test('observability event uchová pouze povolené technické údaje', () => {
  const event = buildObservabilityEvent({
    level: 'error',
    environment: 'preview',
    operation: 'reservation.create',
    errorCode: 'RESERVATION_WRITE_FAILED',
    metadata: { status: 500 },
  });

  assert.equal(event.environment, 'staging');
  assert.equal(event.operation, 'reservation.create');
  assert.equal(event.level, 'error');
  assert.equal(event.errorCode, 'RESERVATION_WRITE_FAILED');
  assert.deepEqual(event.metadata, { status: 500 });
  assert.equal('message' in event, false);
});

test('observability event nemá obecná metadata pro citlivé hodnoty', () => {
  const event = buildObservabilityEvent({
    level: 'warn',
    environment: 'production',
    operation: 'auth.magic_link',
    errorCode: 'AUTH_MAGIC_LINK_FAILED',
  });

  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes('uzivatel@example.cz'), false);
  assert.equal(serialized.includes('Bearer secret-access-token'), false);
  assert.equal('metadata' in event, false);
});
