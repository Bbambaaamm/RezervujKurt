import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

async function loadProfileService() {
  return import('../lib/services/profile');
}

test.afterEach(async () => {
  const { clearCurrentUserRoleCache } = await loadProfileService();
  clearCurrentUserRoleCache();
  globalThis.fetch = originalFetch;
});

test('getCurrentUserRoleFromSession: anonymní session vrací anonymous', async () => {
  const { getCurrentUserRoleFromSession } = await loadProfileService();
  const role = await getCurrentUserRoleFromSession(null);
  assert.equal(role, 'anonymous');
});

test('getCurrentUserRoleFromSession: běžný uživatel vrací user', async () => {
  const { getCurrentUserRoleFromSession } = await loadProfileService();
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'user-1', role: 'user' }]), { status: 200 });

  const role = await getCurrentUserRoleFromSession({
    access_token: 'token-user',
    user: { id: 'user-1' },
  } as never);

  assert.equal(role, 'user');
});

test('getCurrentUserRoleFromSession: člen vrací member', async () => {
  const { getCurrentUserRoleFromSession } = await loadProfileService();
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'member-1', role: 'member' }]), { status: 200 });

  const role = await getCurrentUserRoleFromSession({
    access_token: 'token-member',
    user: { id: 'member-1' },
  } as never);

  assert.equal(role, 'member');
});

test('getCurrentUserRoleFromSession: admin uživatel vrací admin', async () => {
  const { getCurrentUserRoleFromSession } = await loadProfileService();
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'admin-1', role: 'admin' }]), { status: 200 });

  const role = await getCurrentUserRoleFromSession({
    access_token: 'token-admin',
    user: { id: 'admin-1' },
  } as never);

  assert.equal(role, 'admin');
});

test('getCurrentUserRoleFromSession: cache hit nevolá další fetch', async () => {
  const { getCurrentUserRoleFromSession } = await loadProfileService();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify([{ id: 'user-1', role: 'user' }]), { status: 200 });
  };

  const session = { access_token: 'token-user', user: { id: 'user-1' } } as never;

  const first = await getCurrentUserRoleFromSession(session);
  const second = await getCurrentUserRoleFromSession(session);

  assert.equal(first, 'user');
  assert.equal(second, 'user');
  assert.equal(fetchCalls, 1);
});

test('getCurrentUserRoleFromSession: in-flight dedupe sdílí jeden dotaz', async () => {
  const { getCurrentUserRoleFromSession } = await loadProfileService();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return new Response(JSON.stringify([{ id: 'user-1', role: 'user' }]), { status: 200 });
  };

  const session = { access_token: 'token-user', user: { id: 'user-1' } } as never;

  const [first, second] = await Promise.all([
    getCurrentUserRoleFromSession(session),
    getCurrentUserRoleFromSession(session),
  ]);

  assert.equal(first, 'user');
  assert.equal(second, 'user');
  assert.equal(fetchCalls, 1);
});
