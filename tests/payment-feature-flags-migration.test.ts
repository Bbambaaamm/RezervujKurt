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

function extractConstraintFlags(constraintName: string) {
  const constraintPattern = new RegExp(
    `${constraintName}\\s+check\\s*\\([\\s\\S]*?flag_name\\s+in\\s*\\(([\\s\\S]*?)\\)\\s*\\)`,
    'i',
  );
  const match = migration.match(constraintPattern);

  assert.ok(match, `Constraint ${constraintName} musí v migraci existovat.`);

  return [...match[1].matchAll(/'([^']+)'/g)].map((flagMatch) => flagMatch[1]);
}

test('migrace zakládá serverové platební flagy bezpečně vypnuté', () => {
  assert.match(migration, /create table public\.payment_feature_flags/);
  assert.match(migration, /alter table public\.payment_feature_flags enable row level security/);
  assert.match(migration, /revoke all privileges on public\.payment_feature_flags from anon, authenticated/);
});

test('všechny očekávané flagy jsou inicializované přesně jednou jako false', () => {
  const insertedFlags = [
    ...migration.matchAll(
      /\(\s*'([^']+)',\s*false,\s*'[^']+',\s*'[^']+',\s*'[^']+'\s*\)/g,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(insertedFlags, expectedFlags);
});

test('check constrainty povolují přesně očekávané platební flagy', () => {
  assert.deepEqual(extractConstraintFlags('payment_feature_flags_name_chk'), expectedFlags);
  assert.deepEqual(extractConstraintFlags('payment_feature_flag_audit_log_flag_name_chk'), expectedFlags);
});

test('migrace auditně eviduje inicializaci platebních flagů', () => {
  assert.match(migration, /create table public\.payment_feature_flag_audit_log/);
  assert.match(migration, /'Inicializace bezpečně vypnutých platebních provozních flagů\.'/);
});

test('migrace dokumentuje vlastníka a podmínku odstranění každého dočasného flagu', () => {
  const insertedRows = [...migration.matchAll(/\(\s*'[^']+',\s*false,\s*'[^']+',\s*'[^']+',\s*'[^']+'\s*\)/g)];

  assert.equal(insertedRows.length, expectedFlags.length);
});

test('migrace nastavuje práva pro běžné role a serverové čtení kill switchů', () => {
  assert.match(migration, /revoke all privileges on public\.payment_feature_flags from anon, authenticated/);
  assert.match(migration, /revoke all privileges on public\.payment_feature_flag_audit_log from anon, authenticated/);
  assert.match(
    migration,
    /revoke all privileges on sequence public\.payment_feature_flag_audit_log_id_seq from anon, authenticated/,
  );
  assert.match(migration, /grant select on table public\.payment_feature_flags to service_role/);
  assert.doesNotMatch(migration, /grant\s+(?:all|insert|update|delete)[\s\S]+payment_feature_flags[\s\S]+service_role/i);
});

test('migrace nezasahuje do rezervací, platebního flow ani externích volání', () => {
  const forbiddenPatterns = [
    /alter\s+table\s+public\.reservations/i,
    /update\s+public\.reservations/i,
    /insert\s+into\s+public\.payments/i,
    /net\.http_(?:get|post|delete)\s*\(/i,
    /gopay\.com|payments\/payment|oauth2\/token/i,
    /cron\.schedule\s*\(/i,
    /create\s+extension\s+.*pg_cron/i,
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
