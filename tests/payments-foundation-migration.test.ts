import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260721120000_create_payments_foundation.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

test('platební migrace je aditivní, ale při driftu schématu nesmí tiše pokračovat', () => {
  assert.match(migrationSql, /create\s+table\s+public\.payments\s*\(/i);
  assert.match(migrationSql, /create\s+table\s+public\.payment_audit_log\s*\(/i);
  assert.doesNotMatch(migrationSql, /create\s+table\s+if\s+not\s+exists\s+public\.(payments|payment_audit_log)/i);
  assert.doesNotMatch(migrationSql, /create\s+(unique\s+)?index\s+if\s+not\s+exists/i);
  assert.doesNotMatch(migrationSql, /alter\s+table\s+public\.reservations/i);
  assert.doesNotMatch(migrationSql, /waiting_for_payment/i);
  assert.doesNotMatch(migrationSql, /gopay\.com|payments\/payment|oauth2\/token/i);
});

test('payments obsahuje povinné bezpečnostní sloupce a vazbu na rezervaci', () => {
  assert.match(migrationSql, /id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i);
  assert.match(migrationSql, /reservation_id\s+uuid\s+not\s+null\s+references\s+public\.reservations\s*\(id\)\s+on\s+delete\s+restrict/i);
  assert.match(migrationSql, /provider_payment_id\s+text/i);
  assert.match(migrationSql, /idempotency_key\s+text\s+not\s+null/i);
  assert.match(migrationSql, /amount_cents\s+integer\s+not\s+null/i);
  assert.match(migrationSql, /currency\s+text\s+not\s+null\s+default\s+'CZK'/i);
  assert.match(migrationSql, /last_error\s+text/i);
  assert.match(migrationSql, /metadata\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i);
});

test('payments omezuje provider, externí identifikátory, částku, měnu, stavy a chyby', () => {
  assert.match(migrationSql, /payments_provider_chk\s+check\s*\(provider\s+in\s*\('gopay'\)\)/i);
  assert.match(migrationSql, /payments_provider_payment_id_length_chk[\s\S]+char_length\(provider_payment_id\)\s+between\s+1\s+and\s+255/i);
  assert.match(migrationSql, /payments_idempotency_key_length_chk\s+check\s*\(char_length\(idempotency_key\)\s+between\s+1\s+and\s+255\)/i);
  assert.match(migrationSql, /payments_provider_refund_id_length_chk[\s\S]+char_length\(provider_refund_id\)\s+between\s+1\s+and\s+255/i);
  assert.match(migrationSql, /payments_amount_cents_chk\s+check\s*\(amount_cents\s*>\s*0\)/i);
  assert.match(migrationSql, /payments_currency_chk\s+check\s*\(currency\s*=\s*'CZK'\)/i);
  assert.match(migrationSql, /'created'[\s\S]+'awaiting_payment'[\s\S]+'paid'[\s\S]+'requires_manual_review'/i);
  assert.match(migrationSql, /'not_requested'[\s\S]+'processing'[\s\S]+'manual_review'/i);
  assert.match(migrationSql, /refunded_amount_cents\s*>=\s*0[\s\S]+refunded_amount_cents\s*<=\s*amount_cents/i);
  assert.match(migrationSql, /last_error\s+is\s+null\s+or\s+char_length\(last_error\)\s*<=\s*1000/i);
});

test('payments vynucuje minimální časové invarianty a aktualizuje updated_at triggerem', () => {
  assert.match(migrationSql, /payments_paid_at_chk\s+check\s*\(status\s*<>\s*'paid'\s+or\s+paid_at\s+is\s+not\s+null\)/i);
  assert.match(migrationSql, /payments_refunded_at_chk\s+check\s*\(refund_status\s*<>\s*'succeeded'\s+or\s+refunded_at\s+is\s+not\s+null\)/i);
  assert.match(migrationSql, /create\s+function\s+public\.set_payments_updated_at\(\)[\s\S]+new\.updated_at\s*=\s*now\(\)/i);
  assert.match(migrationSql, /create\s+trigger\s+trg_payments_set_updated_at[\s\S]+before\s+update\s+on\s+public\.payments/i);
});

test('payments má idempotentní a provozní indexy s explicitním pravidlem hlavní platby', () => {
  assert.match(migrationSql, /payments_id_reservation_uq\s+unique\s*\(id,\s*reservation_id\)/i);
  assert.match(migrationSql, /create\s+unique\s+index\s+payments_idempotency_key_uq/i);
  assert.match(migrationSql, /create\s+unique\s+index\s+payments_provider_payment_id_uq[\s\S]+where\s+provider_payment_id\s+is\s+not\s+null/i);
  assert.match(migrationSql, /payments_one_open_or_successful_per_reservation_uq[\s\S]+where\s+status\s+in\s*\('created',\s*'awaiting_payment',\s*'paid',\s*'requires_manual_review'\)/i);
  assert.match(migrationSql, /po\s+paid\s+se\s+další\s+hlavní\s+platba\s+nevytváří\s+ani\s+po\s+refundu/i);
  assert.match(migrationSql, /payments_active_expires_at_idx[\s\S]+where\s+status\s+in\s*\('created',\s*'awaiting_payment'\)/i);
  assert.match(migrationSql, /payments_refund_attention_idx[\s\S]+where\s+refund_status\s+in\s*\('requested',\s*'processing',\s*'failed',\s*'manual_review'\)/i);
});

test('payments a payment audit nejsou přímo dostupné běžným rolím ani přes auditní sequence', () => {
  assert.match(migrationSql, /alter\s+table\s+public\.payments\s+enable\s+row\s+level\s+security/i);
  assert.match(migrationSql, /alter\s+table\s+public\.payment_audit_log\s+enable\s+row\s+level\s+security/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.payments\s+from\s+anon,\s*authenticated/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.payment_audit_log\s+from\s+anon,\s*authenticated/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+sequence\s+public\.payment_audit_log_id_seq\s+from\s+anon,\s*authenticated/i);
  assert.doesNotMatch(migrationSql, /grant\s+select\s+on\s+public\.payments\s+to\s+(anon|authenticated)/i);
});

test('payment_audit_log eviduje jen bezpečný technický audit oddělený od notification outboxu', () => {
  assert.match(migrationSql, /payment_id\s+uuid\s+not\s+null/i);
  assert.match(migrationSql, /reservation_id\s+uuid\s+not\s+null/i);
  assert.match(migrationSql, /foreign\s+key\s*\(payment_id,\s*reservation_id\)[\s\S]+references\s+public\.payments\s*\(id,\s*reservation_id\)[\s\S]+on\s+delete\s+cascade/i);
  assert.match(migrationSql, /event_type\s+text\s+not\s+null/i);
  assert.match(migrationSql, /'payment_created'[\s\S]+'payment_verified'[\s\S]+'refund_succeeded'[\s\S]+'reconciliation_completed'/i);
  assert.match(migrationSql, /old_refund_status\s+text/i);
  assert.match(migrationSql, /new_refund_status\s+text/i);
  assert.match(migrationSql, /payment_audit_log_refund_statuses_chk[\s\S]+'not_requested'[\s\S]+'processing'[\s\S]+'succeeded'[\s\S]+'manual_review'/i);
  assert.match(migrationSql, /payment_audit_log_metadata_size_chk\s+check\s*\(pg_column_size\(metadata\)\s*<=\s*8192\)/i);
  assert.match(migrationSql, /source\s+in\s*\('app_server',\s*'gopay_webhook',\s*'reconciliation',\s*'admin_tool',\s*'db_migration'\)/i);
  assert.doesNotMatch(migrationSql, /notification_outbox/i);
  assert.doesNotMatch(migrationSql, /authorization|access_token|refresh_token|client_secret/i);
});
