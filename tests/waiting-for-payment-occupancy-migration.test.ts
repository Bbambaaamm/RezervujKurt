import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationSql = readFileSync('supabase/migrations/20260721133000_waiting_for_payment_occupancy.sql', 'utf8');

test('waiting_for_payment migrace nastaví krátký lock timeout před prvním ALTER TABLE a na konci jej resetuje', () => {
  const setLockTimeoutIndex = migrationSql.search(/set\s+lock_timeout\s*=\s*'5s'/i);
  const firstAlterTableIndex = migrationSql.search(/alter\s+table/i);
  const resetLockTimeoutIndex = migrationSql.search(/reset\s+lock_timeout/i);

  assert.notEqual(setLockTimeoutIndex, -1);
  assert.notEqual(firstAlterTableIndex, -1);
  assert.notEqual(resetLockTimeoutIndex, -1);
  assert.ok(setLockTimeoutIndex < firstAlterTableIndex);
  assert.ok(resetLockTimeoutIndex > firstAlterTableIndex);
});

test('waiting_for_payment migrace rozšiřuje povolené stavy rezervací a auditu', () => {
  assert.match(migrationSql, /drop\s+constraint\s+if\s+exists\s+reservations_status_check/i);
  assert.match(migrationSql, /check\s*\(status\s+in\s*\(\s*'waiting_for_payment'\s*,\s*'pending'\s*,\s*'approved'\s*,\s*'cancelled'\s*\)\s*\)/i);
  assert.match(migrationSql, /drop\s+constraint\s+if\s+exists\s+reservation_audit_log_check/i);
  assert.match(migrationSql, /old_status\s+is\s+null\s+or\s+old_status\s+in\s*\(\s*'waiting_for_payment'\s*,\s*'pending'\s*,\s*'approved'\s*,\s*'cancelled'\s*\)/i);
});

test('waiting_for_payment migrace zahrnuje nový stav do overlap constraintu', () => {
  assert.match(migrationSql, /drop\s+constraint\s+if\s+exists\s+reservations_no_overlap_excl/i);
  assert.match(migrationSql, /where\s*\(status\s+in\s*\(\s*'waiting_for_payment'\s*,\s*'pending'\s*,\s*'approved'\s*\)\s*\)/i);
});

test('veřejný occupancy pohled maskuje čekání na platbu před anonymním klientem', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+view\s+public\.reservation_public_occupancy/i);
  assert.match(migrationSql, /when\s+r\.status\s*=\s*'waiting_for_payment'\s+then\s+'approved'/i);
  assert.match(migrationSql, /from\s+public\.reservations\s+r\s+where\s+r\.status\s+in\s*\(\s*'waiting_for_payment'\s*,\s*'pending'\s*,\s*'approved'\s*\)/i);
  assert.doesNotMatch(migrationSql, /grant\s+select\s+on\s+public\.reservations\s+to\s+anon/i);
  assert.match(migrationSql, /grant\s+select\s+on\s+public\.reservation_public_occupancy\s+to\s+anon/i);
});

test('member occupancy pohled zachovává konkrétní stav čekání na platbu jen pro authenticated', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+view\s+public\.reservation_member_occupancy_notes/i);
  assert.match(migrationSql, /r\.status,\s*r\.note/i);
  assert.match(migrationSql, /where\s+r\.status\s+in\s*\(\s*'waiting_for_payment'\s*,\s*'pending'\s*,\s*'approved'\s*\)/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.reservation_member_occupancy_notes\s+from\s+anon/i);
  assert.match(migrationSql, /grant\s+select\s+on\s+public\.reservation_member_occupancy_notes\s+to\s+authenticated/i);
});
