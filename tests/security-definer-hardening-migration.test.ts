import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20261005203500_security_definer_hardening.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

test('security hardening přesouvá is_admin mimo exposed public schema', () => {
  assert.match(sql, /create\s+schema\s+if\s+not\s+exists\s+private/i);
  assert.match(sql, /create\s+or\s+replace\s+function\s+private\.is_admin\(\)/i);
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*public,\s*auth,\s*pg_temp/i);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+private\.is_admin\(\)\s+from\s+public/i);
  assert.match(sql, /drop\s+function\s+public\.is_admin\(\)/i);
});

test('RLS používá initPlan friendly auth a private admin helper', () => {
  assert.match(sql, /\(select\s+auth\.uid\(\)\)/i);
  assert.match(sql, /\(select\s+private\.is_admin\(\)\)/i);
  assert.doesNotMatch(sql, /using\s*\(\s*public\.is_admin\(\)/i);
});

test('reservation views jsou security_invoker a delegují do neveřejných helperů', () => {
  assert.match(
    sql,
    /create\s+or\s+replace\s+view\s+public\.reservation_public_occupancy\s+with\s*\(security_invoker\s*=\s*true\)/i,
  );
  assert.match(
    sql,
    /create\s+or\s+replace\s+view\s+public\.reservation_member_occupancy_notes\s+with\s*\(security_invoker\s*=\s*true\)/i,
  );
  assert.match(sql, /private\.reservation_public_occupancy_rows\(\)/i);
  assert.match(sql, /private\.reservation_member_occupancy_notes_rows\(\)/i);
});

test('payment hardening je podmíněný a neblokuje production bez GoPay schématu', () => {
  assert.match(sql, /to_regclass\('public\.payments'\)\s+is\s+not\s+null/i);
  assert.match(sql, /to_regclass\('public\.payment_user_statuses'\)\s+is\s+not\s+null/i);
  assert.match(sql, /to_regclass\('public\.payment_admin_statuses'\)\s+is\s+not\s+null/i);
  assert.match(sql, /security_invoker\s*=\s*true/i);
});

test('trigger helpery nejsou veřejně volatelné přes Data API RPC', () => {
  for (const name of [
    'enqueue_reservation_approved_notification',
    'enqueue_reservation_created_notification',
    'handle_new_user_profile',
    'log_reservation_create_audit',
    'log_reservation_update_audit',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+execute\\s+on\\s+function\\s+public\\.${name}\\(\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`,
        'i',
      ),
    );
  }
});

test('hardening nepřidává GoPay tabulky ani neaktivuje platební flow', () => {
  assert.doesNotMatch(sql, /create\s+table\s+public\.payments/i);
  assert.doesNotMatch(sql, /PAYMENTS_GOPAY_CODE_AVAILABLE\s*=\s*true/i);
});
