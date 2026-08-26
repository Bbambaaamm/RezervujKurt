import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationSql = readFileSync('supabase/migrations/20260721133000_waiting_for_payment_occupancy.sql', 'utf8');

test('pohled poznámek zachová záměrný model owner/member/admin', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+view\s+public\.reservation_member_occupancy_notes/i);
  assert.match(migrationSql, /r\.user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migrationSql, /p\.role\s+in\s*\(\s*'member'\s*,\s*'admin'\s*\)/i);
  assert.match(migrationSql, /grant\s+select\s+on\s+public\.reservation_member_occupancy_notes\s+to\s+authenticated/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.reservation_member_occupancy_notes\s+from\s+anon/i);
  assert.doesNotMatch(migrationSql, /grant\s+select\s+on\s+public\.reservation_member_occupancy_notes\s+to\s+anon/i);

  const memberView = migrationSql.match(/create\s+or\s+replace\s+view\s+public\.reservation_member_occupancy_notes[\s\S]*?grant\s+select\s+on\s+public\.reservation_member_occupancy_notes\s+to\s+authenticated;/i)?.[0] ?? '';
  const selectProjection = memberView.match(/select([\s\S]*?)from\s+public\.reservations/i)?.[1] ?? '';
  assert.match(selectProjection, /r\.note/i);
  assert.doesNotMatch(selectProjection, /\buser_id\b/i);
  assert.doesNotMatch(selectProjection, /\b(?:email|full_name|phone)\b/i);
});

test('běžný user získá z pohledu pouze poznámku vlastní rezervace', () => {
  const memberView = migrationSql.match(/create\s+or\s+replace\s+view\s+public\.reservation_member_occupancy_notes[\s\S]*?grant\s+select\s+on\s+public\.reservation_member_occupancy_notes\s+to\s+authenticated;/i)?.[0] ?? '';

  assert.match(memberView, /r\.user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(memberView, /or\s+exists\s*\([\s\S]*?p\.id\s*=\s*auth\.uid\(\)[\s\S]*?p\.role\s+in\s*\(\s*'member'\s*,\s*'admin'\s*\)/i);
  assert.doesNotMatch(memberView, /p\.role\s+in\s*\([^)]*'user'/i);
});
