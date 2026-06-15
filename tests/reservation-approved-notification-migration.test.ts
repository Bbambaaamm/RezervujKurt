import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260615150000_user_reservation_approved_notification.sql',
  ),
  'utf8',
);

test('pending → approved vytvoří právě jeden idempotentní approved event', () => {
  assert.match(
    migrationSql,
    /after\s+update\s+of\s+status\s+on\s+public\.reservations[\s\S]*?when\s*\(\s*old\.status\s*=\s*'pending'\s+and\s+new\.status\s*=\s*'approved'\s*\)/i,
  );
  assert.match(migrationSql, /'reservation\.approved'/i);
  assert.match(
    migrationSql,
    /on\s+conflict\s*\(\s*event_type\s*,\s*reservation_id\s*\)\s+do\s+nothing/i,
  );
});

test('cancelled ani opakované uložení approved nesplní podmínku triggeru', () => {
  const whenCondition = migrationSql.match(/when\s*\(([^)]+)\)/i)?.[1] ?? '';

  assert.match(whenCondition, /old\.status\s*=\s*'pending'/i);
  assert.match(whenCondition, /new\.status\s*=\s*'approved'/i);
  assert.doesNotMatch(whenCondition, /cancelled/i);
});
