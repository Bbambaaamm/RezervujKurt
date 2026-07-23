import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractBearerToken,
  handleAuthenticatedCreateGoPayPaymentRequest,
  normalizeCreateGoPayPaymentPayload,
  PaymentRouteUserRoleReadError,
  readAuthenticatedPaymentUserRoleFromDatabase,
  PaymentRouteAuthenticationError,
  PaymentRouteAuthServiceError,
  PaymentRouteConfigurationError,
  verifySupabaseAccessToken,
} from '../lib/services/gopay-create-route-core';
import { PaymentFeatureDisabledError } from '../lib/services/payment-flags-core';

const authenticatedUser = { userId: '123e4567-e89b-42d3-a456-426614174000' };
const authEnv = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' };
const serverEnv = { ...authEnv, SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' };
const validBody = { courtId: 1, reservationDate: '2026-08-01', timeFrom: '10:00:00', timeTo: '11:00:00' };

test('GoPay create handler validuje payload před read-only feature guardem', async () => {
  let guardCalls = 0;
  const response = await handleAuthenticatedCreateGoPayPaymentRequest(
    {
      authenticatedUser,
      body: { courtId: 1, reservationDate: '2026-08-01', timeFrom: '10:00', timeTo: '10:00' },
    },
    { requireGoPayCreateEnabled: async () => { guardCalls += 1; } },
  );

  assert.equal(response.status, 400);
  assert.equal(guardCalls, 0);
});

test('GoPay create handler mapuje vypnutý guard, neočekávaný guard error a zapnutý guard bezpečně', async () => {
  const disabled = await handleAuthenticatedCreateGoPayPaymentRequest({ authenticatedUser, body: validBody }, {
    requireGoPayCreateEnabled: async () => { throw new PaymentFeatureDisabledError('gopay_create_disabled'); },
  });
  assert.equal(disabled.status, 503);

  let reportedError: unknown = null;
  const unexpected = await handleAuthenticatedCreateGoPayPaymentRequest({ authenticatedUser, body: validBody }, {
    requireGoPayCreateEnabled: async () => { throw new Error('db down'); },
    reportUnexpectedError: (error) => { reportedError = error; },
  });
  assert.equal(unexpected.status, 503);
  assert.ok(reportedError instanceof Error);

  const enabled = await handleAuthenticatedCreateGoPayPaymentRequest({ authenticatedUser, body: validBody }, {
    requireGoPayCreateEnabled: async () => undefined,
    readAuthenticatedUserRole: async () => 'user',
  });
  assert.equal(enabled.status, 501);
});

test('GoPay create handler po zapnutém guardu rozliší role a členy neposílá do platební větve', async () => {
  const member = await handleAuthenticatedCreateGoPayPaymentRequest({ authenticatedUser, body: validBody }, {
    requireGoPayCreateEnabled: async () => undefined,
    readAuthenticatedUserRole: async () => 'member',
  });
  assert.equal(member.status, 409);

  const admin = await handleAuthenticatedCreateGoPayPaymentRequest({ authenticatedUser, body: validBody }, {
    requireGoPayCreateEnabled: async () => undefined,
    readAuthenticatedUserRole: async () => 'admin',
  });
  assert.equal(admin.status, 409);

  const user = await handleAuthenticatedCreateGoPayPaymentRequest({ authenticatedUser, body: validBody }, {
    requireGoPayCreateEnabled: async () => undefined,
    readAuthenticatedUserRole: async () => 'user',
  });
  assert.equal(user.status, 501);
});

test('GoPay create handler při chybě načtení role fail-closed bez platebního side effectu', async () => {
  let reportedError: unknown = null;
  const response = await handleAuthenticatedCreateGoPayPaymentRequest({ authenticatedUser, body: validBody }, {
    requireGoPayCreateEnabled: async () => undefined,
    readAuthenticatedUserRole: async () => { throw new PaymentRouteUserRoleReadError('upstream_error', 'db down', 503); },
    reportUnexpectedError: (error) => { reportedError = error; },
  });

  assert.equal(response.status, 503);
  assert.ok(reportedError instanceof PaymentRouteUserRoleReadError);
});

test('GoPay create payload odmítá neznámá pole a kanonizuje čas na HH:MM', () => {
  assert.equal(
    normalizeCreateGoPayPaymentPayload({
      courtId: 1,
      reservationDate: '2026-08-01',
      timeFrom: '10:00',
      timeTo: '11:00',
      userId: '123e4567-e89b-42d3-a456-426614174000',
    }),
    null,
  );

  assert.deepEqual(
    normalizeCreateGoPayPaymentPayload({ courtId: 1, reservationDate: '2026-08-01', timeFrom: '10:00:00', timeTo: '11:00:00' }),
    { courtId: 1, reservationDate: '2026-08-01', timeFrom: '10:00', timeTo: '11:00', note: null },
  );
});

test('GoPay create payload limituje poznámku až po trimu', () => {
  assert.deepEqual(
    normalizeCreateGoPayPaymentPayload({
      ...validBody,
      note: `   ${'a'.repeat(500)}   `,
    }),
    { courtId: 1, reservationDate: '2026-08-01', timeFrom: '10:00', timeTo: '11:00', note: 'a'.repeat(500) },
  );

  assert.equal(normalizeCreateGoPayPaymentPayload({ ...validBody, note: 'a'.repeat(501) }), null);
});

test('Supabase auth ověření používá bezpečné hlavičky, no-store a abort signal', async () => {
  const calls: Array<{ url: string; authorization: string | null; apikey: string | null; cache: RequestCache | undefined; signal: AbortSignal | null }> = [];
  const user = await verifySupabaseAccessToken(
    'platny-token',
    authEnv,
    async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(url),
        authorization: headers.get('authorization'),
        apikey: headers.get('apikey'),
        cache: init?.cache,
        signal: init?.signal ?? null,
      });
      return new Response(JSON.stringify({ id: authenticatedUser.userId }), { status: 200 });
    },
  );

  assert.equal(user.userId, authenticatedUser.userId);
  assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/user');
  assert.equal(calls[0].authorization, 'Bearer platny-token');
  assert.equal(calls[0].apikey, 'anon-key');
  assert.equal(calls[0].cache, 'no-store');
  assert.ok(calls[0].signal instanceof AbortSignal);
});

test('Supabase auth 401 a 403 znamenají neplatné přihlášení', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      () => verifySupabaseAccessToken('token', authEnv, async () => new Response('denied', { status })),
      PaymentRouteAuthenticationError,
    );
  }
});

test('Supabase auth upstream a nevalidní úspěšná odpověď se mapují na auth service error', async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    await assert.rejects(
      () => verifySupabaseAccessToken('token', authEnv, async () => new Response('upstream', { status })),
      (error: unknown) => error instanceof PaymentRouteAuthServiceError
        && error.code === 'upstream_error'
        && error.httpStatus === status,
    );
  }

  await assert.rejects(
    () => verifySupabaseAccessToken('token', authEnv, async () => new Response('not-json', { status: 200 })),
    (error: unknown) => error instanceof PaymentRouteAuthServiceError && error.code === 'invalid_response',
  );

  await assert.rejects(
    () => verifySupabaseAccessToken('token', authEnv, async () => new Response(JSON.stringify({ id: null }), { status: 200 })),
    (error: unknown) => error instanceof PaymentRouteAuthServiceError && error.code === 'invalid_response',
  );
});

test('Supabase auth timeout a síťové selhání mají stabilní service error kód', async () => {
  await assert.rejects(
    () => verifySupabaseAccessToken('token', authEnv, async (_url, init) => {
      await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return new Response('{}', { status: 200 });
    }, { timeoutMs: 100 }),
    (error: unknown) => error instanceof PaymentRouteAuthServiceError && error.code === 'timeout',
  );

  await assert.rejects(
    () => verifySupabaseAccessToken('token', authEnv, async () => { throw new TypeError('network down'); }),
    (error: unknown) => error instanceof PaymentRouteAuthServiceError && error.code === 'network_error',
  );
});

test('Supabase auth timeout zůstává aktivní i během čtení JSON těla', async () => {
  await assert.rejects(
    () => verifySupabaseAccessToken('token', authEnv, async (_url, init) => ({
      ok: true,
      status: 200,
      json: async () => {
        await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      },
    } as Response), { timeoutMs: 100 }),
    (error: unknown) => error instanceof PaymentRouteAuthServiceError && error.code === 'timeout',
  );
});

test('Supabase auth konfigurace validuje povinné hodnoty, URL a timeout bez úniku tokenu nebo anon key', async () => {
  for (const env of [
    {},
    { NEXT_PUBLIC_SUPABASE_URL: 'not a url', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-secret' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-secret' },
  ]) {
    await assert.rejects(
      () => verifySupabaseAccessToken('very-secret-token', env, async () => new Response('{}')),
      (error: unknown) => error instanceof PaymentRouteConfigurationError
        && !String(error.message).includes('very-secret-token')
        && !String(error.message).includes('anon-secret'),
    );
  }

  await assert.rejects(
    () => verifySupabaseAccessToken('token', authEnv, async () => new Response('{}'), { timeoutMs: 99 }),
    PaymentRouteConfigurationError,
  );
});

test('Supabase auth dovolí HTTP pouze pro lokální vývojové prostředí', async () => {
  const user = await verifySupabaseAccessToken(
    'token',
    { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' },
    async () => new Response(JSON.stringify({ id: authenticatedUser.userId }), { status: 200 }),
  );

  assert.equal(user.userId, authenticatedUser.userId);
});

test('extractBearerToken vrací pouze ověřovatelnou hodnotu tokenu bez přijetí prázdné hlavičky', () => {
  assert.equal(extractBearerToken('Bearer abc.def'), 'abc.def');
  assert.equal(extractBearerToken('Bearer '), null);
  assert.equal(extractBearerToken(null), null);
});

test('serverové načtení role platebního uživatele používá úzký service-role REST dotaz bez cache', async () => {
  const calls: Array<{ url: string; apikey: string | null; authorization: string | null; cache: RequestCache | undefined; signal: AbortSignal | null }> = [];
  const role = await readAuthenticatedPaymentUserRoleFromDatabase(authenticatedUser, serverEnv, async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      apikey: headers.get('apikey'),
      authorization: headers.get('authorization'),
      cache: init?.cache,
      signal: init?.signal ?? null,
    });
    return new Response(JSON.stringify([{ id: authenticatedUser.userId, role: 'member' }]), { status: 200 });
  });

  assert.equal(role, 'member');
  const requestedUrl = new URL(calls[0].url);
  assert.equal(requestedUrl.origin + requestedUrl.pathname, 'https://example.supabase.co/rest/v1/profiles');
  assert.equal(requestedUrl.searchParams.get('select'), 'id,role');
  assert.equal(requestedUrl.searchParams.get('id'), `eq.${authenticatedUser.userId}`);
  assert.equal(requestedUrl.searchParams.get('limit'), '2');
  assert.equal(calls[0].apikey, 'service-role-key');
  assert.equal(calls[0].authorization, 'Bearer service-role-key');
  assert.equal(calls[0].cache, 'no-store');
  assert.ok(calls[0].signal instanceof AbortSignal);
});

test('serverové načtení role platebního uživatele přijme pouze existující profil s přesnou podporovanou rolí', async () => {
  for (const role of ['user', 'member', 'admin'] as const) {
    assert.equal(
      await readAuthenticatedPaymentUserRoleFromDatabase(authenticatedUser, serverEnv, async () => new Response(JSON.stringify([{ id: authenticatedUser.userId, role }]), { status: 200 })),
      role,
    );
  }
});

test('serverové načtení role platebního uživatele validuje konfiguraci a HTTP chyby bez úniku těla odpovědi', async () => {
  await assert.rejects(
    () => readAuthenticatedPaymentUserRoleFromDatabase(authenticatedUser, { NEXT_PUBLIC_SUPABASE_URL: 'http://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret' }, async () => new Response('[]')),
    PaymentRouteConfigurationError,
  );

  await assert.rejects(
    () => readAuthenticatedPaymentUserRoleFromDatabase(authenticatedUser, serverEnv, async () => new Response('secret response body', { status: 403 })),
    (error: unknown) => error instanceof PaymentRouteUserRoleReadError
      && error.code === 'upstream_error'
      && error.httpStatus === 403
      && !error.message.includes('secret response body'),
  );
});

test('serverové načtení role platebního uživatele fail-closed odmítne neplatný tvar odpovědi', async () => {
  const invalidBodies: unknown[] = [
    [],
    [{ id: authenticatedUser.userId, role: 'user' }, { id: authenticatedUser.userId, role: 'user' }],
    { id: authenticatedUser.userId, role: 'user' },
    [{ role: 'user' }],
    [{ id: authenticatedUser.userId }],
    [{ id: '123e4567-e89b-42d3-a456-426614174999', role: 'admin' }],
    [{ id: authenticatedUser.userId, role: 'User' }],
    [{ id: authenticatedUser.userId, role: 'USER' }],
    [{ id: authenticatedUser.userId, role: '' }],
    [{ id: authenticatedUser.userId, role: 'unexpected' }],
  ];

  for (const body of invalidBodies) {
    await assert.rejects(
      () => readAuthenticatedPaymentUserRoleFromDatabase(authenticatedUser, serverEnv, async () => new Response(JSON.stringify(body), { status: 200 })),
      (error: unknown) => error instanceof PaymentRouteUserRoleReadError && error.code === 'invalid_response',
    );
  }
});

test('serverové načtení role platebního uživatele mapuje timeout a síťovou chybu stabilním kódem', async () => {
  await assert.rejects(
    () => readAuthenticatedPaymentUserRoleFromDatabase(authenticatedUser, serverEnv, async (_url, init) => {
      await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return new Response('[]', { status: 200 });
    }, { timeoutMs: 100 }),
    (error: unknown) => error instanceof PaymentRouteUserRoleReadError && error.code === 'timeout',
  );

  await assert.rejects(
    () => readAuthenticatedPaymentUserRoleFromDatabase(authenticatedUser, serverEnv, async () => { throw new TypeError('network down'); }),
    (error: unknown) => error instanceof PaymentRouteUserRoleReadError && error.code === 'network_error',
  );
});
