import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEmailRedirectTo } from '../lib/supabase/auth-redirect';

test('buildEmailRedirectTo vrací Codespaces URL s /rezervace', () => {
  const redirectTo = buildEmailRedirectTo({
    windowOrigin: 'https://example-3000.app.github.dev',
  });

  assert.equal(redirectTo, 'https://example-3000.app.github.dev/rezervace');
});
