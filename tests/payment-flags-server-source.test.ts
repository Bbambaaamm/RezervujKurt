import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverModule = readFileSync('lib/services/payment-flags.ts', 'utf8');
const coreModule = readFileSync('lib/services/payment-flags-core.ts', 'utf8');

test('modul, který čte service role klíč, je přímo označený jako server-only', () => {
  assert.match(serverModule, /^import 'server-only';/);
  assert.doesNotMatch(coreModule, /SUPABASE_SERVICE_ROLE_KEY|process\.env|fetchFn|Authorization: `Bearer/);
});

test('serverové čtení platebních flagů používá omezený REST dotaz bez cache a se service role hlavičkami', () => {
  assert.match(serverModule, /new URL\('\/rest\/v1\/payment_feature_flags', supabaseUrl\)/);
  assert.match(serverModule, /url\.searchParams\.set\('select', 'flag_name,enabled'\)/);
  assert.match(serverModule, /apikey: serviceRoleKey/);
  assert.match(serverModule, /Authorization: `Bearer \$\{serviceRoleKey\}`/);
  assert.match(serverModule, /cache: 'no-store'/);
});

test('serverové čtení platebních flagů má timeout a fail-closed větve pro chybové stavy', () => {
  assert.match(serverModule, /const PAYMENT_FEATURE_FLAGS_TIMEOUT_MS = 4000/);
  assert.match(serverModule, /new AbortController\(\)/);
  assert.match(serverModule, /setTimeout\(\(\) => abortController\.abort\(\), options\.timeoutMs \?\? PAYMENT_FEATURE_FLAGS_TIMEOUT_MS\)/);
  assert.match(serverModule, /catch \{/);
  assert.match(serverModule, /!response\.ok/);
  assert.match(serverModule, /resolveFallbackPaymentFeatureFlags\(env\)/);
});
