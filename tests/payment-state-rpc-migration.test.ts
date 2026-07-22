import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migrationSql = readFileSync(
  'supabase/migrations/20260722100000_service_role_payment_state_rpc.sql',
  'utf8',
);

const paymentUpdateMatch = migrationSql.match(
  /update\s+public\.payments\s+set\s+([\s\S]*?)\s+where\s+id\s*=\s*v_old_payment\.id\s+returning\s+\*\s+into\s+v_new_payment\s*;/i,
);

assert.ok(paymentUpdateMatch, 'Migrace musí obsahovat očekávaný UPDATE public.payments v RPC.');

const paymentUpdateSetClause = paymentUpdateMatch[1];

const transitionDecisionMatch = migrationSql.match(
  /if\s+not\s+\(\s*([\s\S]*?)\s*\)\s+then\s+raise\s+exception\s+'Nepovolený přechod stavu platby z % na %'/i,
);

assert.ok(transitionDecisionMatch, 'Migrace musí obsahovat očekávaný blok povolených stavových přechodů.');

const transitionDecision = transitionDecisionMatch[1];

const normalizedTransitionDecision = transitionDecision.replace(/\s+/g, ' ').trim();

const expectedTransitionDecision = "(v_old_payment.status = 'created' and p_new_status in ('awaiting_payment', 'failed', 'cancelled')) or (v_old_payment.status = 'awaiting_payment' and p_new_status in ('paid', 'failed', 'cancelled', 'expired')) or (v_old_payment.status = 'failed' and p_new_status = 'requires_manual_review')";

test('RPC pro změnu platebního stavu je dostupné pouze service_role', () => {
  assert.match(
    migrationSql,
    /create\s+or\s+replace\s+function\s+public\.record_payment_state_change\s*\([^;]+\)\s+returns\s+uuid\s+language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*public\s*,\s*pg_temp/i,
  );
  assert.match(
    migrationSql,
    /revoke\s+all\s+on\s+function\s+public\.record_payment_state_change\s*\([^;]+\)\s+from\s+anon\s*,\s*authenticated\s*;/i,
  );
  assert.match(
    migrationSql,
    /grant\s+execute\s+on\s+function\s+public\.record_payment_state_change\s*\([^;]+\)\s+to\s+service_role\s*;/i,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant\s+execute\s+on\s+function\s+public\.record_payment_state_change\s*\([^;]+\)\s+to\s+(anon|authenticated|public)\s*;/i,
  );
});

test('RPC odmítá no-op, neexistující platbu a neplatný základní vstup před zápisem', () => {
  assert.match(migrationSql, /if\s+p_payment_id\s+is\s+null\s+then\s+raise\s+exception\s+'payment_id nesmí být prázdné'[^;]+;/i);
  assert.match(migrationSql, /if\s+not\s+found\s+then\s+raise\s+exception\s+'Platba % neexistuje'[^;]+errcode\s*=\s*'P0002'\s*;/i);
  assert.match(migrationSql, /if\s+p_new_status\s*=\s*v_old_payment\.status\s+then\s+raise\s+exception\s+'Platba % už je ve stavu %'[^;]+;/i);
  assert.match(migrationSql, /if\s+p_source\s+is\s+null\s+or\s+btrim\(p_source\)\s*=\s*''\s+then\s+raise\s+exception\s+'source nesmí být prázdný'[^;]+;/i);
  assert.match(migrationSql, /if\s+p_metadata\s+is\s+null\s+or\s+jsonb_typeof\(p_metadata\)\s+<>\s+'object'\s+then\s+raise\s+exception\s+'metadata musí být JSON objekt'[^;]+;/i);
});

test('RPC povoluje pouze přesně vyjmenované stavové přechody a vyžaduje cílové timestampy', () => {
  assert.equal(normalizedTransitionDecision, expectedTransitionDecision);
  assert.doesNotMatch(transitionDecision, /or\s+p_new_status\s*=/i);
  assert.match(migrationSql, /if\s+p_new_status\s*=\s*'paid'\s+and\s+p_paid_at\s+is\s+null\s+then\s+raise\s+exception\s+'Přechod na paid vyžaduje paid_at'[^;]+;/i);
  assert.match(migrationSql, /if\s+p_new_status\s*=\s*'failed'\s+and\s+p_failed_at\s+is\s+null\s+then\s+raise\s+exception\s+'Přechod na failed vyžaduje failed_at'[^;]+;/i);
});

test('RPC odmítá nesouvisející parametry pro cílový stav paid a chrání platební invarianty', () => {
  assert.match(migrationSql, /if\s+p_new_status\s*=\s*'paid'\s+and\s*\([^;]+p_failed_at\s+is\s+not\s+null[^;]+\)\s+then\s+raise\s+exception\s+'Přechod na paid povoluje pouze paid_at'[^;]+;/i);
  assert.match(migrationSql, /if\s+p_increment_attempt_count\s+and\s+p_new_status\s+<>\s*'awaiting_payment'\s+then\s+raise\s+exception\s+'attempt_count lze navýšit pouze při přechodu na awaiting_payment'[^;]+;/i);
  assert.match(migrationSql, /when\s+'paid'\s+then\s+'payment_verified'/i);
  assert.doesNotMatch(paymentUpdateSetClause, /\bamount_cents\s*=/i);
  assert.doesNotMatch(paymentUpdateSetClause, /\bcurrency\s*=/i);
  assert.doesNotMatch(paymentUpdateSetClause, /\bidempotency_key\s*=/i);
  assert.doesNotMatch(paymentUpdateSetClause, /\brefund_status\s*=/i);
  assert.doesNotMatch(paymentUpdateSetClause, /\brefunded_amount_cents\s*=/i);
  assert.doesNotMatch(paymentUpdateSetClause, /\bprovider_refund_id\s*=/i);
});
