import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStaleRecoveryAccessToken } from '../app/admin/stale-recovery';

test('stale pending recovery: chybějící refreshed token vrátí user-visible chybu', () => {
  assert.deepEqual(resolveStaleRecoveryAccessToken(undefined), {
    ok: false,
    error: 'Pro obnovení administrace je potřeba přihlášení.',
  });
  assert.deepEqual(resolveStaleRecoveryAccessToken(null), {
    ok: false,
    error: 'Pro obnovení administrace je potřeba přihlášení.',
  });
});

test('stale pending recovery: při tokenu nevrací chybu (no throw path)', () => {
  assert.doesNotThrow(() => {
    assert.deepEqual(resolveStaleRecoveryAccessToken('token'), { ok: true, token: 'token' });
  });
});
