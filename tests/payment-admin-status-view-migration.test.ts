import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync('supabase/migrations/20260722090000_payment_admin_status_view.sql', 'utf8');
const profilePrivilegeSql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260611223000_restrict_authenticated_reservation_writes.sql'), 'utf8');

test('admin platební view je omezené na administrátory přes profil přihlášeného uživatele', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+view\s+public\.payment_admin_statuses/i);
  assert.match(migrationSql, /with\s*\(\s*security_invoker\s*=\s*false\s*,\s*security_barrier\s*=\s*true\s*\)/i);
  assert.match(migrationSql, /admin_profile\.id\s*=\s*auth\.uid\(\)/i);
  assert.match(migrationSql, /admin_profile\.role\s*=\s*'admin'/i);
});

test('admin platební view nezpřístupňuje interní nebo rizikové platební údaje', () => {
  const viewSelect = migrationSql.slice(
    migrationSql.search(/select/i),
    migrationSql.search(/from\s+public\.payments/i),
  );

  assert.doesNotMatch(viewSelect, /idempotency_key/i);
  assert.doesNotMatch(viewSelect, /metadata/i);
  assert.doesNotMatch(viewSelect, /last_error/i);
});

test('admin platební view neposkytuje přímý přístup anonymní ani běžné authenticated roli mimo filtrovaný view kontrakt', () => {
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.payment_admin_statuses\s+from\s+anon/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.payment_admin_statuses\s+from\s+authenticated/i);
  assert.match(migrationSql, /grant\s+select\s+on\s+public\.payment_admin_statuses\s+to\s+authenticated/i);
  assert.doesNotMatch(migrationSql, /grant\s+(insert|update|delete|all)/i);
});

test('admin platební view má explicitní kontrakt všech platebních pokusů', () => {
  assert.match(migrationSql, /záměrně vrací všechny platební pokusy/i);
  assert.match(migrationSql, /comment\s+on\s+view\s+public\.payment_admin_statuses/i);
  assert.match(migrationSql, /každý platební pokus má vlastní řádek/i);
  assert.match(migrationSql, /nejde o latest payment agregaci/i);
  assert.doesNotMatch(migrationSql, /row_number\s*\(/i);
});

test('admin platební view nespoléhá na join profilů ani implicitní řazení', () => {
  assert.doesNotMatch(migrationSql, /left\s+join\s+public\.profiles/i);
  assert.doesNotMatch(migrationSql, /left\s+join\s+profiles/i);
  assert.doesNotMatch(migrationSql, /order\s+by/i);
  assert.match(migrationSql, /exists\s*\([\s\S]*?admin_profile\.id\s*=\s*auth\.uid\(\)[\s\S]*?admin_profile\.role\s*=\s*'admin'[\s\S]*?\)/i);
});

test('bezpečnost admin view stojí na nemožnosti klientsky měnit profiles.role', () => {
  assert.match(profilePrivilegeSql, /revoke\s+all\s+privileges\s+on\s+public\.profiles\s+from\s+authenticated/i);
  assert.match(profilePrivilegeSql, /grant\s+update\s*\(\s*full_name\s*\)\s+on\s+public\.profiles\s+to\s+authenticated/i);
  assert.doesNotMatch(profilePrivilegeSql, /grant\s+(?:insert|update)\s*\([^)]*\brole\b/i);
});
