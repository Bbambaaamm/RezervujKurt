import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260728120000_court_payment_pricing.sql'),
  'utf8',
);

test('ceník kurtů je aditivní a bez domyšlených produkčních cen', () => {
  assert.match(migrationSql, /create\s+table\s+public\.court_payment_prices/i);
  assert.match(migrationSql, /court_id\s+bigint\s+primary\s+key\s+references\s+public\.courts/i);
  assert.match(migrationSql, /price_per_hour_cents\s+integer\s+not\s+null/i);
  assert.match(migrationSql, /price_per_hour_cents\s+between\s+1\s+and\s+89478485/i);
  assert.match(migrationSql, /currency\s*=\s*'CZK'/i);
  assert.doesNotMatch(migrationSql, /insert\s+into\s+public\.court_payment_prices/i);
  assert.doesNotMatch(migrationSql, /alter\s+table\s+public\.(courts|reservations)/i);
});

test('ceník ani cenové RPC nejsou dostupné klientským rolím', () => {
  assert.match(migrationSql, /alter\s+table\s+public\.court_payment_prices\s+enable\s+row\s+level\s+security/i);
  assert.match(migrationSql, /revoke\s+all\s+privileges\s+on\s+public\.court_payment_prices\s+from\s+anon,\s*authenticated/i);
  assert.match(migrationSql, /grant\s+select\s+on\s+public\.court_payment_prices\s+to\s+service_role/i);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.get_court_payment_price\(bigint\)\s+from\s+public/i);
  assert.match(migrationSql, /revoke\s+execute\s+on\s+function\s+public\.get_court_payment_price\(bigint\)\s+from\s+anon/i);
  assert.match(migrationSql, /revoke\s+execute\s+on\s+function\s+public\.get_court_payment_price\(bigint\)\s+from\s+authenticated/i);
  assert.match(migrationSql, /grant\s+execute\s+on\s+function\s+public\.get_court_payment_price\(bigint\)\s+to\s+service_role/i);
});

test('cenové RPC vrací cenu pouze pro aktivní existující kurt', () => {
  assert.match(migrationSql, /security\s+definer/i);
  assert.match(migrationSql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migrationSql, /join\s+public\.court_payment_prices\s+as\s+price\s+on\s+price\.court_id\s*=\s*court\.id/i);
  assert.match(migrationSql, /court\.id\s*=\s*p_court_id/i);
  assert.match(migrationSql, /court\.is_active\s*=\s*true/i);
});
