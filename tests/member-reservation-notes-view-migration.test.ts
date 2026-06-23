import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationSql = readFileSync('supabase/migrations/20260623100000_member_reservation_notes_view.sql', 'utf8');

test('member/admin pohled na poznámky nevrací osobní údaje a zachová vlastní poznámky běžných uživatelů', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+view\s+public\.reservation_member_occupancy_notes/i);
  assert.match(migrationSql, /r\.user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migrationSql, /p\.role\s+in\s*\(\s*'member'\s*,\s*'admin'\s*\)/i);
  assert.match(migrationSql, /grant\s+select\s+on\s+public\.reservation_member_occupancy_notes\s+to\s+authenticated/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.reservation_member_occupancy_notes\s+from\s+anon/i);

  const selectProjection = migrationSql.match(/select([\s\S]*?)from\s+public\.reservations/i)?.[1] ?? '';
  assert.doesNotMatch(selectProjection, /\buser_id\b/i);
});
