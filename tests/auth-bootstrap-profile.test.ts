import test from 'node:test';
import assert from 'node:assert/strict';

import { buildE2eProfileUpsertData } from '../e2e/helpers/auth-bootstrap';

test('buildE2eProfileUpsertData doplní povinné full_name z e-mailu', () => {
  const profile = buildE2eProfileUpsertData({
    id: 'user-id',
    email: 'e2e.member@example.com',
    role: 'member',
  });

  assert.deepEqual(profile, {
    id: 'user-id',
    email: 'e2e.member@example.com',
    full_name: 'e2e.member',
    role: 'member',
  });
});

test('buildE2eProfileUpsertData použije bezpečný fallback pro prázdnou lokální část e-mailu', () => {
  const profile = buildE2eProfileUpsertData({
    id: 'admin-id',
    email: '@example.com',
    role: 'admin',
  });

  assert.equal(profile.full_name, 'E2E uživatel');
  assert.equal(profile.role, 'admin');
});
