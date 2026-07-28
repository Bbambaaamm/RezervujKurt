import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migrationSql = readFileSync(
  'supabase/migrations/20260728150000_preserve_payment_expiration_on_state_change.sql',
  'utf8',
);

const paymentUpdateMatch = migrationSql.match(
  /update\s+public\.payments\s+set\s+([\s\S]*?)\s+where\s+id\s*=\s*v_old_payment\.id\s+returning\s+\*\s+into\s+v_new_payment\s*;/i,
);

assert.ok(paymentUpdateMatch, 'Migrace musí obsahovat očekávaný UPDATE public.payments.');

test('přechod na awaiting_payment vyžaduje přesný uložený snapshot expirace', () => {
  assert.match(
    migrationSql,
    /p_new_status\s*=\s*'awaiting_payment'[\s\S]+v_old_payment\.expires_at\s+is\s+distinct\s+from\s+p_expires_at[\s\S]+expires_at se neshoduje s uloženým snapshotem platby/i,
  );
});

test('stavový přechod nikdy nepřepisuje expires_at', () => {
  assert.doesNotMatch(paymentUpdateMatch[1], /\bexpires_at\s*=/i);
});

test('platba starého create overloadu bez expirace nemůže přejít na awaiting_payment', () => {
  // IS DISTINCT FROM je pro null a neprázdnou expiraci pravdivé, přechod proto skončí před UPDATE.
  const snapshotGuardIndex = migrationSql.search(/v_old_payment\.expires_at\s+is\s+distinct\s+from\s+p_expires_at/i);
  const updateIndex = migrationSql.search(/update\s+public\.payments/i);
  assert.ok(snapshotGuardIndex > -1 && updateIndex > snapshotGuardIndex);
});

