import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260617123000_tournament_poster_storage.sql'),
  'utf8',
);

test('migrace připravuje veřejný bucket pro plakáty turnajů', () => {
  assert.match(migrationSql, /insert\s+into\s+storage\.buckets[\s\S]*'tournament-posters'/i);
  assert.match(migrationSql, /public\s*=\s*excluded\.public/i);
  assert.match(migrationSql, /file_size_limit\s*=\s*excluded\.file_size_limit/i);
  assert.match(migrationSql, /allowed_mime_types\s*=\s*excluded\.allowed_mime_types/i);
});

test('migrace povoluje čtení plakátů veřejně a nahrávání jen administrátorům', () => {
  assert.match(migrationSql, /create\s+policy\s+"tournament_posters_select_public"[\s\S]*?using\s*\(bucket_id\s*=\s*'tournament-posters'\)/i);
  assert.match(migrationSql, /create\s+policy\s+"tournament_posters_insert_admin"[\s\S]*?with\s+check\s*\(bucket_id\s*=\s*'tournament-posters'\s+and\s+public\.is_admin\(\)\)/i);
});
