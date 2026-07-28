import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260728140000_set_payment_reservation_expiration.sql'),
  'utf8',
);

test('nový overload create_payment_reservation přijímá povinnou expiraci a zachovává starý kontrakt', () => {
  assert.match(migrationSql, /p_expires_at\s+timestamptz/i);
  assert.doesNotMatch(migrationSql, /drop\s+function/i);
  assert.match(migrationSql, /grant\s+execute\s+on\s+function\s+public\.create_payment_reservation\(uuid, bigint, date, time, time, text, text, integer, timestamptz, text, jsonb\)\s+to\s+service_role/i);
  assert.match(migrationSql, /revoke\s+all[\s\S]+timestamptz[\s\S]+from\s+authenticated/i);
  assert.match(migrationSql, /revoke\s+all[\s\S]+timestamptz[\s\S]+from\s+anon/i);
});

test('RPC odmítne chybějící nebo prošlou expiraci před zápisem', () => {
  assert.match(migrationSql, /p_expires_at\s+is\s+null\s+or\s+p_expires_at\s+<=\s+clock_timestamp\(\)/i);
  const validationIndex = migrationSql.search(/p_expires_at\s+is\s+null/i);
  const reservationInsertIndex = migrationSql.search(/insert\s+into\s+public\.reservations/i);
  assert.ok(validationIndex > -1 && reservationInsertIndex > validationIndex);
});

test('idempotentní retry přijme pouze původní snapshot expirace', () => {
  assert.match(migrationSql, /v_existing_payment\.expires_at\s+is\s+distinct\s+from\s+p_expires_at/i);
  assert.match(migrationSql, /v_existing_payment\.expires_at\s+is\s+distinct\s+from\s+p_expires_at[\s\S]+idempotency_key_reused_with_different_payload/i);

  const payloadConflictIndex = migrationSql.search(/idempotency_key_reused_with_different_payload/i);
  const idempotentReturnIndex = migrationSql.search(/reservation_id\s*:=\s*v_existing_payment\.reservation_id/i);
  assert.ok(payloadConflictIndex > -1 && idempotentReturnIndex > payloadConflictIndex);
});

test('retry proti platbě starého overloadu s null expires_at selže fail-closed', () => {
  // IS DISTINCT FROM je na rozdíl od <> pravdivé i pro dvojici null a neprázdná expirace.
  assert.match(migrationSql, /expires_at\s*=\s*null/i);
  assert.match(migrationSql, /expires_at\s+is\s+distinct\s+from\s+p_expires_at/i);
  assert.doesNotMatch(migrationSql, /update\s+public\.payments[\s\S]+expires_at/i);
});

test('nová interní platba ukládá expires_at ve stejné transakci', () => {
  assert.match(migrationSql, /insert\s+into\s+public\.payments\s*\([\s\S]*expires_at[\s\S]*\)\s*values\s*\([\s\S]*p_expires_at/i);
});
