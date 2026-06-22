import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationSql = readFileSync(
  'supabase/migrations/20260622120000_auto_approve_member_reservations.sql',
  'utf8',
);

const schedulerSql = readFileSync(
  'supabase/snippets/schedule_member_reservation_auto_approval.sql',
  'utf8',
);

test('auto approve funkce schvaluje jen pending rezervace členů a adminů po 1 minutě', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+function\s+public\.auto_approve_member_reservations\(\)/i);
  assert.match(migrationSql, /security\s+definer/i);
  assert.match(migrationSql, /p\.role\s+in\s*\(\s*'member'\s*,\s*'admin'\s*\)/i);
  assert.match(migrationSql, /r\.status\s*=\s*'pending'/i);
  assert.match(migrationSql, /r\.created_at\s*<=\s*now\(\)\s*-\s*interval\s+'1 minute'/i);
  assert.match(migrationSql, /status\s*=\s*'approved'/i);
});

test('auto approve funkce neumožní spuštění běžné public roli', () => {
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.auto_approve_member_reservations\(\)\s+from\s+public/i);
  assert.match(migrationSql, /grant\s+execute\s+on\s+function\s+public\.auto_approve_member_reservations\(\)\s+to\s+service_role/i);
});

test('auto approve scheduler spouští databázovou funkci každou minutu', () => {
  assert.match(
    schedulerSql,
    /cron\.schedule\(\s*'auto-approve-member-reservations-every-minute'\s*,\s*'\* \* \* \* \*'/,
  );
  assert.match(schedulerSql, /select\s+public\.auto_approve_member_reservations\(\)/i);
});
