import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260611220000_fix_public_occupancy_and_profile_bootstrap.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

test('oprava occupancy nezpřístupní anon roli zdrojovou tabulku reservations', () => {
  assert.match(
    migrationSql,
    /revoke\s+all\s+privileges\s+on\s+public\.reservations\s+from\s+anon/i,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant\s+select\s+on\s+public\.reservations\s+to\s+anon/i,
  );
});

test('veřejný occupancy pohled má bezpečnou projekci a jednotná práva pro anon i authenticated', () => {
  assert.match(
    migrationSql,
    /with\s*\(security_invoker\s*=\s*false,\s*security_barrier\s*=\s*true\)/i,
  );
  assert.match(migrationSql, /where\s+r\.status\s+in\s*\('pending',\s*'approved'\)/i);
  assert.doesNotMatch(migrationSql, /\b(user_id|note|email|phone)\b[\s,]+from\s+public\.reservations/i);
  assert.match(
    migrationSql,
    /grant\s+select\s+on\s+public\.reservation_public_occupancy\s+to\s+anon/i,
  );
  assert.match(
    migrationSql,
    /grant\s+select\s+on\s+public\.reservation_public_occupancy\s+to\s+authenticated/i,
  );
});

test('bootstrap profilu obnoví trigger a doplní uživatele vytvořené před migrací', () => {
  assert.match(migrationSql, /security\s+definer/i);
  assert.match(migrationSql, /drop\s+trigger\s+if\s+exists\s+on_auth_user_created\s+on\s+auth\.users/i);
  assert.match(migrationSql, /create\s+trigger\s+on_auth_user_created[\s\S]+after\s+insert\s+on\s+auth\.users/i);
  assert.match(migrationSql, /insert\s+into\s+public\.profiles[\s\S]+from\s+auth\.users\s+u/i);
  assert.match(migrationSql, /where\s+not\s+exists/i);
  assert.match(migrationSql, /on\s+conflict\s*\(id\)\s+do\s+nothing/i);
});
