import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260617090000_allow_anon_read_active_courts.sql'),
  'utf8',
);

test('migrace povolí anonymní čtení pouze aktivních kurtů', () => {
  assert.match(migration, /grant\s+select\s+on\s+public\.courts\s+to\s+anon/i);
  assert.match(migration, /create\s+policy\s+"courts_select_active_anon"\s+on\s+public\.courts\s+for\s+select\s+to\s+anon\s+using\s*\(\s*is_active\s*=\s*true\s*\)/i);
  assert.doesNotMatch(migration, /for\s+(insert|update|delete|all)\b/i);
});
