import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260723100000_create_payment_reservation_rpc.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');
const paymentsFoundationSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260721120000_create_payments_foundation.sql'),
  'utf8',
);

test('RPC pro založení platební rezervace je service-role kontrakt bez GoPay volání', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+function\s+public\.create_payment_reservation/i);
  assert.match(migrationSql, /security\s+definer/i);
  assert.match(migrationSql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.create_payment_reservation[\s\S]+from\s+public/i);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.create_payment_reservation[\s\S]+from\s+authenticated/i);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.create_payment_reservation[\s\S]+from\s+anon/i);
  assert.match(migrationSql, /grant\s+execute\s+on\s+function\s+public\.create_payment_reservation[\s\S]+to\s+service_role/i);
  assert.doesNotMatch(migrationSql, /gopay\.com|payments\/payment|oauth2\/token|provider_payment_id\s*=|http/i);
});

test('RPC atomicky zakládá waiting_for_payment rezervaci, created payment a payment audit', () => {
  assert.match(migrationSql, /insert\s+into\s+public\.reservations[\s\S]+'waiting_for_payment'/i);
  assert.match(migrationSql, /insert\s+into\s+public\.payments[\s\S]+status[\s\S]+'created'/i);
  assert.match(migrationSql, /insert\s+into\s+public\.payment_audit_log[\s\S]+'payment_created'[\s\S]+'app_server'/i);
  assert.match(migrationSql, /returns\s+table\s*\([\s\S]*reservation_id\s+uuid,[\s\S]*payment_id\s+uuid/i);
});

test('RPC validuje vstupy, idempotency key a metadata před zápisem', () => {
  assert.match(migrationSql, /p_user_id\s+is\s+null/i);
  assert.match(migrationSql, /p_court_id\s+is\s+null\s+or\s+p_court_id\s+<=\s+0/i);
  assert.match(migrationSql, /p_time_from\s+is\s+null\s+or\s+p_time_to\s+is\s+null\s+or\s+p_time_from\s+>=\s+p_time_to/i);
  assert.match(migrationSql, /char_length\(btrim\(p_note\)\)\s*>\s*500/i);
  assert.match(migrationSql, /char_length\(v_idempotency_key\)\s+not\s+between\s+1\s+and\s+255/i);
  assert.match(migrationSql, /p_amount_cents\s+is\s+null\s+or\s+p_amount_cents\s+<=\s+0/i);
  assert.match(migrationSql, /p_currency\s+is\s+distinct\s+from\s+'CZK'/i);
  assert.match(migrationSql, /jsonb_typeof\(p_metadata\)\s+<>\s+'object'/i);
  assert.match(migrationSql, /octet_length\(p_metadata::text\)\s*>\s*8192/i);
});

test('opakované volání podle idempotency_key nezkouší vytvořit druhý blokující slot', () => {
  assert.match(migrationSql, /v_idempotency_key\s*:=\s*btrim\(p_idempotency_key\)/i);
  assert.match(migrationSql, /pg_advisory_xact_lock\(hashtextextended\(v_idempotency_key,\s*0\)\)/i);
  assert.match(migrationSql, /from\s+public\.payments\s+where\s+idempotency_key\s*=\s*v_idempotency_key\s+for\s+update/i);
  assert.match(migrationSql, /v_idempotency_key,[\s\S]+p_amount_cents/i);
  assert.match(migrationSql, /if\s+found\s+then[\s\S]+return\s+next;[\s\S]+return;/i);
});

test('stejný idempotency_key s odlišným payloadem vrací explicitní chybu', () => {
  assert.match(migrationSql, /from\s+public\.reservations[\s\S]+where\s+id\s*=\s*v_existing_payment\.reservation_id[\s\S]+for\s+update/i);
  assert.match(migrationSql, /v_existing_reservation\.user_id\s+<>\s+p_user_id/i);
  assert.match(migrationSql, /v_existing_reservation\.court_id\s+<>\s+p_court_id/i);
  assert.match(migrationSql, /v_existing_reservation\.reservation_date\s+<>\s+p_reservation_date/i);
  assert.match(migrationSql, /v_existing_reservation\.time_from\s+<>\s+p_time_from/i);
  assert.match(migrationSql, /v_existing_reservation\.time_to\s+<>\s+p_time_to/i);
  assert.match(migrationSql, /v_existing_payment\.amount_cents\s+<>\s+p_amount_cents/i);
  assert.match(migrationSql, /v_existing_payment\.currency\s+is\s+distinct\s+from\s+p_currency/i);
  assert.match(migrationSql, /idempotency_key_reused_with_different_payload/i);
});

test('payments.idempotency_key zůstává chráněný databázovou unikátností', () => {
  assert.match(paymentsFoundationSql, /unique\s+index\s+payments_idempotency_key_uq[\s\S]+on\s+public\.payments\s*\(idempotency_key\)/i);
});

test('jiný idempotency_key pro stejný slot se nesmí tiše převést na existující rezervaci', () => {
  const reservationInsertIndex = migrationSql.search(/insert\s+into\s+public\.reservations/i);
  const paymentInsertIndex = migrationSql.search(/insert\s+into\s+public\.payments/i);

  assert.ok(reservationInsertIndex > -1);
  assert.ok(paymentInsertIndex > reservationInsertIndex);
  assert.doesNotMatch(migrationSql, /on\s+conflict\s+do\s+nothing/i);
  assert.doesNotMatch(migrationSql, /exception\s+when/i);
});
