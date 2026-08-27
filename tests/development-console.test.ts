import test from 'node:test';
import assert from 'node:assert/strict';

import { developmentConsole } from '../lib/services/development-console';

test('vývojový logger nepropustí e-mail, token, Authorization ani Error.message', () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalError = console.error;
  const loggedValues: unknown[][] = [];

  Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true, writable: true });
  console.error = (...values: unknown[]) => loggedValues.push(values);

  try {
    developmentConsole.error('test failure', {
      email: 'uzivatel@example.cz',
      token: 'secret-access-token',
      authorization: 'Bearer secret-access-token',
      error: new Error('Selhání uživatele uzivatel@example.cz'),
      status: 401,
    });

    const serialized = JSON.stringify(loggedValues);
    assert.equal(serialized.includes('uzivatel@example.cz'), false);
    assert.equal(serialized.includes('secret-access-token'), false);
    assert.equal(serialized.includes('Bearer'), false);
    assert.equal(serialized.includes('Selhání uživatele'), false);
    assert.equal(serialized.includes('401'), true);
  } finally {
    console.error = originalError;
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnvironment, configurable: true, writable: true });
  }
});
