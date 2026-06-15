import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260615140000_grant_notification_worker_read_privileges.sql',
  ),
  'utf8',
);

test('service_role může číst všechny zdrojové tabulky notifikačního workeru', () => {
  for (const table of ['reservations', 'courts', 'profiles']) {
    assert.match(
      migrationSql,
      new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+service_role`, 'i'),
    );
  }
});

test('migrace neuděluje workeru zápis ani přístup k dalším objektům', () => {
  assert.doesNotMatch(migrationSql, /\bgrant\s+(?:all|insert|update|delete|truncate|references|trigger)\b/i);
  assert.doesNotMatch(migrationSql, /\bgrant\b[\s\S]*?\bon\s+(?:sequence|function|schema)\b/i);
  assert.doesNotMatch(migrationSql, /\bnotification_outbox\b[\s\S]*?\bto\s+service_role\b/i);

  const grantedTables = [...migrationSql.matchAll(
    /grant\s+select\s+on\s+table\s+public\.([a-z_]+)\s+to\s+service_role/gi,
  )].map((match) => match[1]);

  assert.deepEqual(grantedTables.sort(), ['courts', 'profiles', 'reservations']);
});
