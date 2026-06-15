import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workerSource = readFileSync(
  resolve(
    process.cwd(),
    'supabase/functions/process-notification-outbox/index.ts',
  ),
  'utf8',
);

test('worker před odesláním ověří, že rezervace stále čeká na schválení', () => {
  assert.match(workerSource, /select=id,reservation_date,time_from,time_to,note,court_id,user_id,status/);
  assert.match(workerSource, /if\s*\(reservation\.status\s*!==\s*'pending'\)\s*return\s+null/);
  assert.match(
    workerSource,
    /if\s*\(!detail\)\s*\{[\s\S]*?complete_notification_outbox[\s\S]*?return;/,
  );
});
