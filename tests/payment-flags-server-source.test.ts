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

test('GoPay create guard zůstává server-only, bez vlastního process.env čtení a bez logování', () => {
  assert.match(serverModule, /export async function requireGoPayCreateEnabledFromDatabase/);
  assert.match(serverModule, /const result = await readPaymentFeatureFlagsFromDatabase\(env, fetchFn, options\)/);
  assert.doesNotMatch(serverModule, /process\.env\.ENABLE_GOPAY|process\.env\.PAYMENTS_GOPAY_CODE_AVAILABLE/);
  assert.doesNotMatch(serverModule, /console\.(?:log|info|warn|error)|serviceRoleKey[\s\S]*console|response[\s\S]*console/);
});

test('GoPay create guard pouze rozhoduje a nedělá platební side effect', () => {
  const guardMatch = serverModule.match(
    /export async function requireGoPayCreateEnabledFromDatabase[\s\S]*?\n}\n\nexport async function readPaymentFeatureFlagsFromDatabase/,
  );

  assert.ok(guardMatch, 'Guard musí zůstat samostatná malá funkce před DB loaderem');
  const guardSource = guardMatch[0];

  assert.match(guardSource, /readPaymentFeatureFlagsFromDatabase\(env, fetchFn, options\)/);
  assert.match(guardSource, /requireGoPayCreateEnabled\(result\.flags\)/);
  assert.doesNotMatch(guardSource, /\bfetch\(|payments?\?|reservations?\?|\.(?:insert|update|upsert|delete)\(|audit|console\./i);
});
