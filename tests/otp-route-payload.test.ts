import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOtpPayload } from '../lib/supabase/otp-proxy';
import { resolveOtpRouteRedirectTo } from '../lib/supabase/otp-route-payload';

test('route helper podporuje emailRedirectTo a zachová /rezervace', () => {
  const redirectTo = resolveOtpRouteRedirectTo({
    emailRedirectTo: 'https://example.app.github.dev/rezervace',
  });

  const payload = buildOtpPayload('user@example.com', redirectTo);
  assert.equal(payload.redirect_to, 'https://example.app.github.dev/rezervace');
  assert.equal('emailRedirectTo' in payload, false);
});

test('route helper upřednostní redirect_to a neoreže pathname', () => {
  const redirectTo = resolveOtpRouteRedirectTo({
    redirect_to: 'https://example.app.github.dev/rezervace',
    emailRedirectTo: 'https://example.app.github.dev/jina-cesta',
  });

  assert.equal(redirectTo, 'https://example.app.github.dev/rezervace');
});


test('route helper vytvoří veřejný magic-link payload s create_user true', () => {
  const redirectTo = resolveOtpRouteRedirectTo({
    redirect_to: 'https://example.app.github.dev/rezervace',
  });

  const payload = buildOtpPayload('new.user@example.com', redirectTo, { createUser: true });
  assert.equal(payload.create_user, true);
});
