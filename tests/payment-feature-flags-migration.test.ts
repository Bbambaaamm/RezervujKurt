import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260721150000_payment_feature_flags.sql', 'utf8');

const expectedFlags = [
  'gopay_create_enabled',
  'gopay_webhook_processing_enabled',
  'payment_expiration_enabled',
  'auto_refund_enabled',
  'payment_admin_monitoring_enabled',
];

test('migrace zakládá serverové platební flagy bezpečně vypnuté', () => {
  assert.match(migration, /create table public\.payment_feature_flags/);
  assert.match(migration, /alter table public\.payment_feature_flags enable row level security/);
  assert.match(migration, /revoke all privileges on public\.payment_feature_flags from anon, authenticated/);

  for (const flag of expectedFlags) {
    assert.match(migration, new RegExp(`'${flag}'`));
  }

  assert.equal(
    [...migration.matchAll(/'gopay_create_enabled',[\s\S]*?false,/g)].length,
    1,
    'GoPay create kill switch musí být inicializovaný jako vypnutý',
  );
});

test('migrace auditně eviduje inicializaci platebních flagů', () => {
  assert.match(migration, /create table public\.payment_feature_flag_audit_log/);
  assert.match(migration, /alter table public\.payment_feature_flag_audit_log enable row level security/);
  assert.match(migration, /revoke all privileges on public\.payment_feature_flag_audit_log from anon, authenticated/);
  assert.match(migration, /'Inicializace bezpečně vypnutých platebních provozních flagů\.'/);
});

test('migrace dokumentuje vlastníka a podmínku odstranění každého dočasného flagu', () => {
  const insertedRows = [...migration.matchAll(/\(\s*'[^']+',\s*false,\s*'[^']+',\s*'[^']+',\s*'[^']+'\s*\)/g)];

  assert.equal(insertedRows.length, expectedFlags.length);
});

test('migrace nezasahuje do rezervací, platebního flow ani externích volání', () => {
  const forbiddenPatterns = [
    /alter\s+table\s+public\.reservations/i,
    /update\s+public\.reservations/i,
    /insert\s+into\s+public\.payments/i,
    /https?:\/\//i,
    /gopay\.com|payments\/payment|oauth2\/token/i,
    /cron/i,
    /create\s+trigger[\s\S]+reservations/i,
    /on\s+public\.reservations/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(migration, pattern);
  }
});

test('migrace nevytváří jiné explicitní DB objekty než povolené tabulky', () => {
  assert.deepEqual(
    [...migration.matchAll(/create\s+table\s+public\.([a-z_]+)/gi)].map((match) => match[1]),
    ['payment_feature_flags', 'payment_feature_flag_audit_log'],
  );
  assert.doesNotMatch(migration, /create\s+(?:or\s+replace\s+)?function/i);
  assert.doesNotMatch(migration, /create\s+trigger/i);
  assert.doesNotMatch(migration, /create\s+(?:unique\s+)?index/i);
  assert.doesNotMatch(migration, /references\s+public\.(?!payment_feature_flags|payment_feature_flag_audit_log)/i);
});
