import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260728160000_bind_payment_attempt_snapshot.sql'),
  'utf8',
);

test('platební pokus používá UUID sloupec s globální unikátností a cenovým snapshotem', () => {
  assert.match(migrationSql, /add\s+column\s+payment_attempt_id\s+uuid/i);
  assert.match(migrationSql, /add\s+column\s+price_per_hour_cents\s+integer/i);
  assert.match(migrationSql, /unique\s+index\s+payments_payment_attempt_id_uq[\s\S]+payment_attempt_id/i);
  assert.match(migrationSql, /payment_attempt_id\s+is\s+not\s+null\s+and\s+price_per_hour_cents\s*>\s*0/i);
});

test('lock timeout je omezený pouze na transakci migrace a po DDL se obnoví', () => {
  assert.match(migrationSql, /set\s+local\s+lock_timeout\s*=\s*'5s'/i);
  assert.match(migrationSql, /set\s+local\s+lock_timeout\s*=\s*'0'/i);
  assert.doesNotMatch(migrationSql, /^set\s+lock_timeout/gim);
});

test('create-or-get RPC je dostupné pouze service_role a zachovává staré overloady', () => {
  assert.match(migrationSql, /create\s+function\s+public\.create_or_get_payment_attempt/i);
  assert.match(migrationSql, /security\s+definer[\s\S]+set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migrationSql, /revoke\s+all[\s\S]+from\s+public/i);
  assert.match(migrationSql, /revoke\s+all[\s\S]+from\s+anon/i);
  assert.match(migrationSql, /revoke\s+all[\s\S]+from\s+authenticated/i);
  assert.match(migrationSql, /grant\s+execute[\s\S]+to\s+service_role/i);
  assert.doesNotMatch(migrationSql, /drop\s+function/i);
});

test('RPC serializuje pokus před čtením a atomicky rozlišuje existující a nový pokus', () => {
  const lockIndex = migrationSql.search(/pg_advisory_xact_lock\(v_advisory_lock_key\)/i);
  const attemptReadIndex = migrationSql.search(/where\s+payment_attempt_id\s*=\s*p_payment_attempt_id[\s\S]+for\s+update/i);
  const priceReadIndex = migrationSql.search(/from\s+public\.court_payment_prices/i);
  const reservationInsertIndex = migrationSql.search(/insert\s+into\s+public\.reservations/i);

  assert.ok(lockIndex > -1 && attemptReadIndex > lockIndex);
  assert.ok(priceReadIndex > attemptReadIndex && reservationInsertIndex > priceReadIndex);
  assert.match(migrationSql, /if\s+found\s+then[\s\S]+attempt_created\s*:=\s*false[\s\S]+return\s+next;[\s\S]+return;/i);
  assert.match(migrationSql, /attempt_created\s*:=\s*true/i);
});

test('advisory zámek používá stabilní 64bitový hash celého kanonického UUID', () => {
  assert.match(migrationSql, /v_advisory_lock_key\s+bigint/i);
  assert.match(migrationSql, /v_advisory_lock_key\s*:=\s*hashtextextended\(p_payment_attempt_id::text,\s*0\)/i);
  assert.match(migrationSql, /pg_advisory_xact_lock\(v_advisory_lock_key\)/i);
  assert.doesNotMatch(migrationSql, /left\(|right\(|substring\(/i);
});

test('retry ověřuje uživatele a celý neměnný rezervační payload jedním konfliktem', () => {
  assert.match(migrationSql, /v_existing_reservation\.user_id\s*<>\s*p_user_id/i);
  assert.match(migrationSql, /v_existing_reservation\.court_id\s*<>\s*p_court_id/i);
  assert.match(migrationSql, /v_existing_reservation\.reservation_date\s*<>\s*p_reservation_date/i);
  assert.match(migrationSql, /v_existing_reservation\.time_from\s*<>\s*p_time_from/i);
  assert.match(migrationSql, /v_existing_reservation\.time_to\s*<>\s*p_time_to/i);
  assert.match(migrationSql, /v_existing_reservation\.note\s+is\s+distinct\s+from/i);
  assert.match(migrationSql, /raise\s+exception\s+'payment_attempt_conflict'/i);
});

test('RPC nepřijme čas se sekundami mimo kanonický minutový kontrakt', () => {
  assert.match(migrationSql, /extract\(second\s+from\s+p_time_from\)\s*<>\s*0/i);
  assert.match(migrationSql, /extract\(second\s+from\s+p_time_to\)\s*<>\s*0/i);
});

test('retry vrací uložené snapshoty bez načtení ceny a bez výpočtu nové expirace', () => {
  const retryReturnIndex = migrationSql.search(/attempt_created\s*:=\s*false/i);
  const priceReadIndex = migrationSql.search(/from\s+public\.court_payment_prices/i);
  assert.ok(retryReturnIndex > -1 && priceReadIndex > retryReturnIndex);
  assert.match(migrationSql, /price_per_hour_cents\s*:=\s*v_existing_payment\.price_per_hour_cents/i);
  assert.match(migrationSql, /amount_cents\s*:=\s*v_existing_payment\.amount_cents/i);
  assert.match(migrationSql, /expires_at\s*:=\s*v_existing_payment\.expires_at/i);
  assert.doesNotMatch(migrationSql.slice(0, priceReadIndex), /make_interval/i);
});

test('nový pokus načte autoritativní cenu a uloží všechny snapshoty v jedné transakci', () => {
  assert.match(migrationSql, /from\s+public\.court_payment_prices[\s\S]+join\s+public\.courts[\s\S]+c\.is_active\s*=\s*true/i);
  assert.match(migrationSql, /v_amount_numeric\s*:=\s*\(extract\(epoch\s+from\s+\(p_time_to\s*-\s*p_time_from\)\)\s*\/\s*3600\)\s*\*\s*v_price_per_hour_cents/i);
  assert.match(migrationSql, /v_amount_numeric\s*<>\s*trunc\(v_amount_numeric\)/i);
  assert.match(migrationSql, /v_now\s*:=\s*clock_timestamp\(\)[\s\S]+v_expires_at\s*:=\s*v_now\s*\+\s*make_interval\(mins\s*=>\s*p_ttl_minutes\)/i);
  assert.match(migrationSql, /insert\s+into\s+public\.payments[\s\S]+payment_attempt_id[\s\S]+price_per_hour_cents[\s\S]+expires_at/i);
  assert.match(migrationSql, /'waiting_for_payment'[\s\S]+v_now,\s*v_now/i);
  assert.match(migrationSql, /'created',\s*v_expires_at,\s*p_metadata,[\s\S]+v_now,\s*v_now/i);
  assert.match(migrationSql, /'payment_created'[\s\S]+p_metadata,[\s\S]+v_now/i);
});

test('terminální pokus nelze recyklovat pro prodloužení checkoutu', () => {
  assert.match(migrationSql, /v_existing_payment\.status\s+in\s*\('failed',\s*'cancelled',\s*'expired'\)/i);
  assert.match(migrationSql, /raise\s+exception\s+'payment_attempt_terminal'/i);
});

test('paid retry vrací původní výsledek a není zařazený mezi odmítnuté terminální pokusy', () => {
  const terminalStatuses = migrationSql.match(/v_existing_payment\.status\s+in\s*\(([^)]+)\)/i)?.[1] ?? '';
  assert.doesNotMatch(terminalStatuses, /paid/i);
  assert.match(migrationSql, /status\s+in\s*\('failed',\s*'cancelled',\s*'expired'\)[\s\S]+reservation_id\s*:=\s*v_existing_payment\.reservation_id/i);
});
