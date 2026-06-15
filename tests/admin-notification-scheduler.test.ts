import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schedulerSql = readFileSync(
  'supabase/snippets/schedule_notification_outbox_worker.sql',
  'utf8',
);

test('notifikační scheduler spouští Edge Function každou minutu přes Vault', () => {
  assert.match(
    schedulerSql,
    /cron\.schedule\(\s*'process-notification-outbox-every-minute',\s*'\* \* \* \* \*'/,
  );
  assert.match(
    schedulerSql,
    /\/functions\/v1\/process-notification-outbox/,
  );
  assert.match(
    schedulerSql,
    /vault\.decrypted_secrets[\s\S]*?notification_worker_service_role_key/,
  );
  assert.match(
    schedulerSql,
    /'Authorization',\s*'Bearer '\s*\|\|/,
  );
  assert.match(schedulerSql, /timeout_milliseconds\s*:=\s*30000/);
});

test('notifikační scheduler neobsahuje vložený Supabase klíč ani URL projektu', () => {
  assert.doesNotMatch(schedulerSql, /https:\/\/[a-z0-9]+\.supabase\.co/i);
  assert.doesNotMatch(schedulerSql, /\bsb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(schedulerSql, /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
});
