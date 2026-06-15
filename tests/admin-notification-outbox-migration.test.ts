import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260615120000_admin_reservation_notification_outbox.sql',
  ),
  'utf8',
);

test('pending rezervace vytvoří idempotentní outbox událost', () => {
  assert.match(migrationSql, /if\s+new\.status\s*<>\s*'pending'\s+then[\s\S]*?return\s+new/i);
  assert.match(migrationSql, /insert\s+into\s+public\.notification_outbox[\s\S]*?'reservation\.created'/i);
  assert.match(migrationSql, /unique\s*\(\s*event_type\s*,\s*reservation_id\s*\)/i);
  assert.match(migrationSql, /on\s+conflict\s*\(\s*event_type\s*,\s*reservation_id\s*\)\s+do\s+nothing/i);
});

test('trigger se spouští pouze po vložení rezervace', () => {
  assert.match(
    migrationSql,
    /create\s+trigger\s+trg_reservation_created_notification[\s\S]*?after\s+insert\s+on\s+public\.reservations/i,
  );
  assert.doesNotMatch(
    migrationSql,
    /create\s+trigger\s+trg_reservation_created_notification[\s\S]*?after\s+(?:update|delete)/i,
  );
});

test('outbox má RLS bez klientských policies a explicitně odebraná práva', () => {
  assert.match(migrationSql, /alter\s+table\s+public\.notification_outbox\s+enable\s+row\s+level\s+security/i);
  assert.doesNotMatch(migrationSql, /create\s+policy[\s\S]*?on\s+public\.notification_outbox/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.notification_outbox\s+from\s+anon/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.notification_outbox\s+from\s+authenticated/i);
});

test('claim události je atomický a chráněný tokenem workeru', () => {
  assert.match(migrationSql, /for\s+update\s+skip\s+locked/i);
  assert.match(migrationSql, /status\s*=\s*'processing'/i);
  assert.match(migrationSql, /lock_token\s*=\s*p_worker_token/i);
  assert.match(
    migrationSql,
    /where\s+id\s*=\s*p_event_id[\s\S]*?status\s*=\s*'processing'[\s\S]*?lock_token\s*=\s*p_worker_token/i,
  );
});

test('chyba workeru plánuje retry a nemění rezervaci', () => {
  assert.match(migrationSql, /create\s+or\s+replace\s+function\s+public\.fail_notification_outbox/i);
  assert.match(migrationSql, /next_attempt_at\s*=\s*case\s+when\s+p_terminal/i);

  const failureFunction = migrationSql.split(
    /create\s+or\s+replace\s+function\s+public\.fail_notification_outbox/i,
  )[1];
  assert.ok(failureFunction);
  assert.doesNotMatch(failureFunction, /update\s+public\.reservations/i);
});

test('terminální failed událost už claim funkce znovu nepřevezme', () => {
  const claimFunction = migrationSql
    .split(/create\s+or\s+replace\s+function\s+public\.claim_notification_outbox/i)[1]
    ?.split(/create\s+or\s+replace\s+function\s+public\.complete_notification_outbox/i)[0];

  assert.ok(claimFunction);
  assert.match(claimFunction, /o\.status\s*=\s*'pending'/i);
  assert.doesNotMatch(claimFunction, /o\.status\s+in\s*\(\s*'pending'\s*,\s*'failed'\s*\)/i);
});
