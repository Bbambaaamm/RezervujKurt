import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEmailRedirectTo } from '../lib/supabase/auth-redirect';

test('buildEmailRedirectTo vrací Codespaces URL s /rezervace', () => {
  const redirectTo = buildEmailRedirectTo({
    windowOrigin: 'https://example-3000.app.github.dev',
  });

  assert.equal(redirectTo, 'https://example-3000.app.github.dev/rezervace');
});

test('buildEmailRedirectTo pro Vercel Preview preferuje aktuální origin před env redirectem', () => {
  const redirectTo = buildEmailRedirectTo({
    envRedirectUrl: 'https://rezervuj-kurt-ax39brp77-bbambaaamms-projects.vercel.app/rezervace',
    windowOrigin: 'https://rezervuj-kurt-git-codex-find-possib-6b682e-bbambaaamms-projects.vercel.app',
  });

  assert.equal(
    redirectTo,
    'https://rezervuj-kurt-git-codex-find-possib-6b682e-bbambaaamms-projects.vercel.app/rezervace',
  );
});

test('buildEmailRedirectTo pro produkční doménu preferuje produkční env redirect', () => {
  const redirectTo = buildEmailRedirectTo({
    envRedirectUrl: 'https://www.rezervujkurt.cz/rezervace',
    windowOrigin: 'https://www.rezervujkurt.cz',
  });

  assert.equal(redirectTo, 'https://www.rezervujkurt.cz/rezervace');
});

test('buildEmailRedirectTo pro localhost bez env vrací localhost s /rezervace', () => {
  const redirectTo = buildEmailRedirectTo({
    windowOrigin: 'http://localhost:3000',
  });

  assert.equal(redirectTo, 'http://localhost:3000/rezervace');
});

test('buildEmailRedirectTo bez hodnot vrací relativní /rezervace', () => {
  const redirectTo = buildEmailRedirectTo({});

  assert.equal(redirectTo, '/rezervace');
});
