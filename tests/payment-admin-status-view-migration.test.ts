import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync('supabase/migrations/20260722090000_payment_admin_status_view.sql', 'utf8');
const profilePrivilegeSql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260611223000_restrict_authenticated_reservation_writes.sql'), 'utf8');

test('admin platební view používá security_invoker a neveřejný helper', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+function\s+private\.payment_admin_statuses_rows\(\)/i);
  assert.match(migrationSql, /security\s+definer/i);
  assert.match(migrationSql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+private\.payment_admin_statuses_rows\(\)\s+from\s+public/i);
  assert.match(migrationSql, /create\s+or\s+replace\s+view\s+public\.payment_admin_statuses/i);
  assert.match(migrationSql, /with\s*\(security_invoker\s*=\s*true,\s*security_barrier\s*=\s*true\)/i);
  assert.match(migrationSql, /from\s+private\.payment_admin_statuses_rows\(\)/i);
});

test('admin platební helper je omezený na administrátory přes profil přihlášeného uživatele', () => {
  assert.match(migrationSql, /admin_profile\.id\s*=\s*auth\.uid\(\)/i);
  assert.match(migrationSql, /admin_profile\.role\s*=\s*'admin'/i);
});

test('admin platební view nezpřístupňuje interní metadata a je read-only', () => {
  assert.doesNotMatch(migrationSql, /idempotency_key/i);
  assert.doesNotMatch(migrationSql, /metadata/i);
  assert.doesNotMatch(migrationSql, /last_error/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.payment_admin_statuses\s+from\s+anon/i);
  assert.match(migrationSql, /grant\s+select\s+on\s+public\.payment_admin_statuses\s+to\s+authenticated/i);
  assert.match(migrationSql, /grant\s+execute\s+on\s+function\s+private\.payment_admin_statuses_rows\(\)\s+to\s+authenticated,\s*service_role/i);
  assert.doesNotMatch(migrationSql, /grant\s+(insert|update|delete|all)/i);
});

test('admin platební view má explicitní kontrakt všech platebních pokusů', () => {
  assert.match(migrationSql, /každý platební pokus má vlastní řádek/i);
  assert.match(migrationSql, /comment\s+on\s+view\s+public\.payment_admin_statuses/i);
  assert.match(migrationSql, /nejde o latest payment agregaci/i);
  assert.doesNotMatch(migrationSql, /row_number\s*\(/i);
});

test('bezpečnost admin view stojí na nemožnosti klientsky měnit profiles.role', () => {
  assert.match(profilePrivilegeSql, /revoke\s+all\s+privileges\s+on\s+public\.profiles\s+from\s+authenticated/i);
  assert.match(profilePrivilegeSql, /grant\s+update\s*\(\s*full_name\s*\)\s+on\s+public\.profiles\s+to\s+authenticated/i);
  assert.doesNotMatch(profilePrivilegeSql, /grant\s+(?:insert|update)\s*\([^)]*\brole\b/i);
});
