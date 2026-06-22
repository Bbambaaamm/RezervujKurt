import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAdminGuardState } from '../lib/services/admin-guard';

test('admin guard decision: anonymous -> unauthorized', () => {
  assert.equal(resolveAdminGuardState('anonymous'), 'unauthorized');
});

test('admin guard decision: authenticated non-admin -> forbidden', () => {
  assert.equal(resolveAdminGuardState('user'), 'forbidden');
});

test('admin guard decision: member -> forbidden', () => {
  assert.equal(resolveAdminGuardState('member'), 'forbidden');
});

test('admin guard decision: admin -> allowed', () => {
  assert.equal(resolveAdminGuardState('admin'), 'allowed');
});
