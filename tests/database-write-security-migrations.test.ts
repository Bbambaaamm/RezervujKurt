import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readMigration(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'supabase/migrations', fileName), 'utf8');
}

const initialGrantSql = readMigration('20260611205309_grant_authenticated_reservation_privileges.sql');
const correctionSql = readMigration('20260611223000_restrict_authenticated_reservation_writes.sql');

test('authenticated nemá obecný INSERT ani UPDATE grant na profiles', () => {
  for (const sql of [initialGrantSql, correctionSql]) {
    assert.doesNotMatch(sql, /grant\s+(?:[^;]*,\s*)?insert(?:\s*,[^;]*)?\s+on\s+public\.profiles/i);
    assert.doesNotMatch(sql, /grant\s+(?:[^;]*,\s*)?update(?:\s*,[^;]*)?\s+on\s+public\.profiles/i);
    assert.match(sql, /grant\s+update\s*\(\s*full_name\s*\)\s+on\s+public\.profiles\s+to\s+authenticated/i);
  }
});

test('authenticated nemůže měnit role profilů ani další profilové sloupce', () => {
  assert.match(correctionSql, /revoke\s+all\s+privileges\s+on\s+public\.profiles\s+from\s+authenticated/i);
  assert.doesNotMatch(correctionSql, /grant\s+(?:insert|update)\s*\([^)]*\brole\b/i);
  assert.doesNotMatch(correctionSql, /grant\s+insert\s*\([^)]*\)\s+on\s+public\.profiles/i);
});

test('authenticated může u rezervace aktualizovat pouze status', () => {
  for (const sql of [initialGrantSql, correctionSql]) {
    assert.doesNotMatch(sql, /grant\s+(?:[^;]*,\s*)?update(?:\s*,[^;]*)?\s+on\s+public\.reservations/i);
    assert.match(sql, /grant\s+update\s*\(\s*status\s*\)\s+on\s+public\.reservations\s+to\s+authenticated/i);
  }

  assert.match(correctionSql, /revoke\s+all\s+privileges\s+on\s+public\.reservations\s+from\s+authenticated/i);
});

test('člen může vložit pouze vlastní pending rezervaci', () => {
  assert.match(correctionSql, /create\s+policy\s+"reservations_insert_owner_pending"[\s\S]*?user_id\s*=\s*auth\.uid\(\)[\s\S]*?status\s*=\s*'pending'/i);
  assert.match(correctionSql, /create\s+policy\s+"reservations_insert_admin"[\s\S]*?with\s+check\s*\(public\.is_admin\(\)\)/i);
});

test('člen může aktivní rezervaci pouze zrušit a schválení zůstává adminovi', () => {
  assert.match(correctionSql, /create\s+policy\s+"reservations_cancel_owner"[\s\S]*?status\s+in\s*\('pending',\s*'approved'\)[\s\S]*?status\s*=\s*'cancelled'/i);
  assert.match(correctionSql, /create\s+policy\s+"reservations_update_admin"[\s\S]*?using\s*\(public\.is_admin\(\)\)[\s\S]*?with\s+check\s*\(public\.is_admin\(\)\)/i);
  assert.doesNotMatch(correctionSql, /create\s+policy\s+"reservations_update_owner_or_admin"/i);
});
