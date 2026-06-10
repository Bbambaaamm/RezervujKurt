import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOtpPayload,
  buildSupabaseOtpEndpoint,
  getSupabaseOtpRequestConfig,
  shouldUseOtpProxyForRuntime,
  resolveOtpEndpoint,
  normalizeOtpRedirectTo,
  getOtpFailureMessage,
} from '../lib/supabase/otp-proxy';

test('getSupabaseOtpRequestConfig používá anon klíč a endpoint /auth/v1/otp', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.local';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const config = getSupabaseOtpRequestConfig();

  assert.equal(config.endpoint, 'https://example.supabase.local/auth/v1/otp');
  assert.equal(config.headers.apikey, 'anon-key');
  assert.equal('Authorization' in config.headers, false);
  assert.notEqual(config.headers.apikey, process.env.SUPABASE_SERVICE_ROLE_KEY);
});

test('buildOtpPayload bez volby zachová login-only payload', () => {
  const payload = buildOtpPayload('user@example.com', 'https://example.com/rezervace');

  assert.equal(payload.email, 'user@example.com');
  assert.equal(payload.create_user, false);
  assert.equal(payload.redirect_to, 'https://example.com/rezervace');
});

test('buildOtpPayload umožní veřejnému magic-link flow vytvořit uživatele', () => {
  const payload = buildOtpPayload('user@example.com', 'https://example.com/rezervace', { createUser: true });

  assert.equal(payload.create_user, true);
});


test('normalizeOtpRedirectTo zachová pathname /rezervace', () => {
  const redirectTo = normalizeOtpRedirectTo('https://example.app.github.dev/rezervace');
  assert.equal(redirectTo, 'https://example.app.github.dev/rezervace');
});
test('diagnostika non-2xx čte status a body response', async () => {
  const response = new Response('{"error":"denied"}', {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });

  const responseBody = await response.text();

  assert.equal(response.ok, false);
  assert.equal(response.status, 400);
  assert.equal(responseBody, '{"error":"denied"}');
});

test('v Codespaces development runtime se aktivuje OTP proxy', () => {
  process.env.NODE_ENV = 'development';

  assert.equal(shouldUseOtpProxyForRuntime('https://space-3000.app.github.dev'), true);
  assert.equal(shouldUseOtpProxyForRuntime('http://localhost:3000'), false);
});

test('klient v Codespaces dev nepoužije cross-origin endpoint přímo', () => {
  process.env.NODE_ENV = 'development';
  const endpoint = resolveOtpEndpoint('https://example.supabase.local/auth/v1/otp', 'https://space-3000.app.github.dev');
  assert.equal(endpoint, '/api/auth/otp');
});

test('getOtpFailureMessage vysvětlí vypnutý email OTP signup v Supabase', () => {
  const message = getOtpFailureMessage(422, '{"code":422,"error_code":"otp_disabled","msg":"Signups not allowed for otp"}');

  assert.match(message, /otp_disabled/);
  assert.match(message, /enable_signup/);
  assert.match(message, /npx supabase stop && npx supabase start/);
  assert.match(message, /--ignore-health-check/);
  assert.match(message, /npx supabase status/);
});

test('getOtpFailureMessage zachová obecnou Supabase zprávu pro neznámou chybu', () => {
  const message = getOtpFailureMessage(400, '{"msg":"Invalid login credentials"}');

  assert.equal(message, 'Supabase Auth OTP selhalo (400). Invalid login credentials');
});

test('buildSupabaseOtpEndpoint přidá redirect_to jako query parametr Supabase OTP endpointu', () => {
  const endpoint = buildSupabaseOtpEndpoint(
    'http://127.0.0.1:54321/auth/v1/otp',
    'http://127.0.0.1:3000/rezervace',
  );
  const url = new URL(endpoint);

  assert.equal(url.origin, 'http://127.0.0.1:54321');
  assert.equal(url.pathname, '/auth/v1/otp');
  assert.equal(url.searchParams.get('redirect_to'), 'http://127.0.0.1:3000/rezervace');
});

test('buildSupabaseOtpEndpoint bez redirectu zachová původní endpoint', () => {
  const endpoint = 'http://127.0.0.1:54321/auth/v1/otp';

  assert.equal(buildSupabaseOtpEndpoint(endpoint), endpoint);
});
