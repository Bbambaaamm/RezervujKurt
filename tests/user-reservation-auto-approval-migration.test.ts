import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationSql = readFileSync(
  'supabase/migrations/20260810120000_auto_approve_user_reservations.sql',
  'utf8',
);

test('auto approve funkce schvaluje pending rezervace všech přihlášených rolí po 1 minutě', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+function\s+public\.auto_approve_member_reservations\(\)/i);
  assert.match(migrationSql, /security\s+definer/i);
  assert.match(migrationSql, /p\.role\s+in\s*\(\s*'user'\s*,\s*'member'\s*,\s*'admin'\s*\)/i);
  assert.match(migrationSql, /r\.status\s*=\s*'pending'/i);
  assert.match(migrationSql, /r\.created_at\s*<=\s*now\(\)\s*-\s*interval\s+'1 minute'/i);
  assert.match(migrationSql, /status\s*=\s*'approved'/i);
});

test('rozšířené auto approve nezasahuje do čekajících plateb ani již vyřízených rezervací', () => {
  const functionBody = migrationSql.match(/create\s+or\s+replace\s+function\s+public\.auto_approve_member_reservations\(\)[\s\S]*?\$\$;/i)?.[0] ?? '';
  const updateStatement = functionBody.match(/update\s+public\.reservations\s+as\s+r[\s\S]*?get\s+diagnostics/i)?.[0] ?? '';
  const whereClause = updateStatement.match(/where[\s\S]*?(?=get\s+diagnostics)/i)?.[0] ?? '';

  assert.deepEqual(whereClause.match(/\br\.status\b/gi) ?? [], ['r.status']);
  assert.match(whereClause, /\br\.status\s*=\s*'pending'/i);
  assert.doesNotMatch(whereClause, /waiting_for_payment|approved|cancelled/i);
});

test('rozšířené auto approve zachovává systémový audit a přístup pouze pro service role', () => {
  assert.match(migrationSql, /set_config\(\s*'app\.reservation_auto_approval'\s*,\s*'true'\s*,\s*true\s*\)/i);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.auto_approve_member_reservations\(\)\s+from\s+public/i);
  assert.match(migrationSql, /grant\s+execute\s+on\s+function\s+public\.auto_approve_member_reservations\(\)\s+to\s+service_role/i);
});
