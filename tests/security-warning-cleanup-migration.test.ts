import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261005211500_security_warning_cleanup.sql'),
  'utf8',
);

test('payments updated_at trigger helper má pevný bezpečný search_path', () => {
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.set_payments_updated_at\(\)/i);
  assert.match(sql, /set\s+search_path\s*=\s*pg_catalog,\s*pg_temp/i);
});

test('btree_gist se přesouvá mimo exposed public schema pouze pokud je relocatable', () => {
  assert.match(sql, /e\.extname\s*=\s*'btree_gist'/i);
  assert.match(sql, /n\.nspname\s*=\s*'public'/i);
  assert.match(sql, /e\.extrelocatable/i);
  assert.match(sql, /alter\s+extension\s+btree_gist\s+set\s+schema\s+extensions/i);
});

test('migrace je idempotentní vůči už přesunutému btree_gist', () => {
  assert.match(sql, /if\s+exists\s*\(/i);
  assert.doesNotMatch(sql, /drop\s+extension/i);
});
