import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveProfileSaveErrorMessage } from '../lib/services/profile-save-error';

test('resolveProfileSaveErrorMessage: HTTP chyba zachová existující hlášku', () => {
  const message = resolveProfileSaveErrorMessage(null, false);

  assert.equal(message, 'Uložení jména se nepodařilo. Zkuste to prosím znovu.');
});

test('resolveProfileSaveErrorMessage: transport failure vrátí síťovou hlášku', () => {
  const message = resolveProfileSaveErrorMessage(new Error('Failed to fetch'));

  assert.equal(message, 'Profil se nepodařilo uložit. Zkontrolujte připojení a zkuste to znovu.');
});
