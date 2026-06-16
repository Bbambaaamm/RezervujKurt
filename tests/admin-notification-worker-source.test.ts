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
  assert.match(workerSource, /if\s*\(reservation\.status\s*!==\s*expectedStatus\)\s*return\s+null/);
  assert.match(
    workerSource,
    /if\s*\(!detail\)\s*\{[\s\S]*?complete_notification_outbox[\s\S]*?return;/,
  );
});

test('worker rozlišuje created a approved příjemce a chybějící e-mail bezpečně dokončí', () => {
  assert.match(workerSource, /event\.event_type\s*!==\s*'reservation\.created'/);
  assert.match(workerSource, /event\.event_type\s*!==\s*'reservation\.approved'/);
  assert.match(workerSource, /event\.event_type\s*===\s*'reservation\.created'[\s\S]*?loadAdminRecipients/);
  assert.match(workerSource, /buildReservationApprovedEmail/);
  assert.match(
    workerSource,
    /if\s*\(!message\)\s*\{[\s\S]*?complete_notification_outbox[\s\S]*?return;/,
  );
});

test('worker před prvním odesláním uloží payload a při retry použije snapshot', () => {
  assert.match(workerSource, /getNotificationPayload\(event\.payload\)/);
  assert.match(workerSource, /snapshot_notification_outbox_payload/);
  assert.match(workerSource, /messages:\s*payload\.messages/);
});

test('worker používá název kurtu načtený z public.courts.name', () => {
  assert.match(workerSource, /courts\?select=name&id=eq\.\$\{reservation\.court_id\}/);
  assert.match(workerSource, /courtName:\s*court\.name/);
});
