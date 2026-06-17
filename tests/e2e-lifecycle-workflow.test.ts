import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/e2e-lifecycle.yml', 'utf8');

test('E2E lifecycle workflow: nespouští edge-runtime pro auth smoke', () => {
  assert.match(workflow, /supabase start --exclude edge-runtime/);
});
