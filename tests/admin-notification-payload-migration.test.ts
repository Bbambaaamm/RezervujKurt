import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260615130000_snapshot_notification_outbox_payload.sql',
  ),
  'utf8',
);

test('snapshot payloadu může uložit pouze worker, který vlastní processing událost', () => {
  assert.match(migrationSql, /status\s*=\s*'processing'/i);
  assert.match(migrationSql, /lock_token\s*=\s*p_worker_token/i);
  assert.match(
    migrationSql,
    /revoke\s+all\s+on\s+function\s+public\.snapshot_notification_outbox_payload[\s\S]*?from\s+authenticated/i,
  );
  assert.match(
    migrationSql,
    /grant\s+execute\s+on\s+function\s+public\.snapshot_notification_outbox_payload[\s\S]*?to\s+service_role/i,
  );
});

test('již uložený snapshot se při retry nepřepíše', () => {
  assert.match(
    migrationSql,
    /when\s+jsonb_typeof\(payload\s*->\s*'messages'\)\s*=\s*'array'\s+then\s+payload/i,
  );
  assert.match(migrationSql, /else\s+p_payload/i);
  assert.match(migrationSql, /returning\s+payload\s+into\s+v_payload/i);
});
