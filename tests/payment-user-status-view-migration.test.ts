import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260721170000_payment_user_status_view.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

test('uživatelský platební view používá security_invoker a neveřejný helper', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+function\s+private\.payment_user_statuses_rows\(\)/i);
  assert.match(migrationSql, /security\s+definer/i);
  assert.match(migrationSql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+private\.payment_user_statuses_rows\(\)\s+from\s+public/i);
  assert.match(migrationSql, /create\s+or\s+replace\s+view\s+public\.payment_user_statuses/i);
  assert.match(migrationSql, /with\s*\(security_invoker\s*=\s*true,\s*security_barrier\s*=\s*true\)/i);
  assert.match(migrationSql, /from\s+private\.payment_user_statuses_rows\(\)/i);
});

test('uživatelský platební helper vystavuje pouze bezpečný výřez vlastní platby', () => {
  assert.match(migrationSql, /p\.reservation_id/i);
  assert.match(migrationSql, /p\.amount_cents/i);
  assert.match(migrationSql, /p\.currency/i);
  assert.match(migrationSql, /p\.status/i);
  assert.match(migrationSql, /p\.refund_status/i);
  assert.match(migrationSql, /p\.expires_at/i);
  assert.match(migrationSql, /p\.paid_at/i);
  assert.match(migrationSql, /p\.refunded_at/i);
  assert.match(migrationSql, /join\s+public\.reservations\s+r\s+on\s+r\.id\s*=\s*rp\.reservation_id/i);
  assert.match(migrationSql, /where\s+r\.user_id\s*=\s*auth\.uid\(\)/i);
  assert.doesNotMatch(migrationSql, /provider_payment_id/i);
  assert.doesNotMatch(migrationSql, /provider_refund_id/i);
  assert.doesNotMatch(migrationSql, /idempotency_key/i);
  assert.doesNotMatch(migrationSql, /last_error/i);
});

test('uživatelský platební view je dostupný jen přihlášeným uživatelům', () => {
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.payment_user_statuses\s+from\s+public/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.payment_user_statuses\s+from\s+anon/i);
  assert.match(migrationSql, /grant\s+select\s+on\s+public\.payment_user_statuses\s+to\s+authenticated/i);
  assert.match(migrationSql, /grant\s+execute\s+on\s+function\s+private\.payment_user_statuses_rows\(\)\s+to\s+authenticated,\s*service_role/i);
});

test('uživatelský platební view vrací nejvýše jeden deterministický platební pokus na rezervaci', () => {
  assert.match(migrationSql, /row_number\s*\(\s*\)\s+over\s*\(/i);
  assert.match(migrationSql, /partition\s+by\s+p\.reservation_id/i);
  assert.match(migrationSql, /when\s+p\.status\s+in\s*\('created',\s*'awaiting_payment',\s*'paid',\s*'requires_manual_review'\)\s+then\s+0/i);
  assert.match(migrationSql, /p\.updated_at\s+desc/i);
  assert.match(migrationSql, /p\.created_at\s+desc/i);
  assert.match(migrationSql, /p\.id\s+desc/i);
  assert.match(migrationSql, /and\s+rp\.payment_rank\s*=\s*1/i);
});
