import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function prepareServerOnlyStub() {
  const stubDirectory = join(__dirname, '..', 'node_modules', 'server-only');
  mkdirSync(stubDirectory, { recursive: true });
  writeFileSync(join(stubDirectory, 'package.json'), '{"name":"server-only","main":"index.js"}');
  writeFileSync(join(stubDirectory, 'index.js'), 'module.exports = {};');
}

async function loadPaymentFlagsServerModule() {
  prepareServerOnlyStub();
  return import('../lib/services/payment-flags');
}

const serverEnv = {
  PAYMENTS_GOPAY_CODE_AVAILABLE: 'true',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

test('serverový loader runtime předává fetchi omezený REST endpoint, no-store a service role hlavičky', async () => {
  const { readPaymentFeatureFlagsFromDatabase } = await loadPaymentFlagsServerModule();
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const fetchMock: typeof fetch = async (url, init) => {
    requestedUrl = String(url);
    requestedInit = init;

    return new Response(JSON.stringify([
      { flag_name: 'gopay_create_enabled', enabled: true },
      { flag_name: 'gopay_webhook_processing_enabled', enabled: true },
      { flag_name: 'payment_expiration_enabled', enabled: true },
      { flag_name: 'auto_refund_enabled', enabled: true },
      { flag_name: 'payment_admin_monitoring_enabled', enabled: true },
    ]), { status: 200 });
  };

  const result = await readPaymentFeatureFlagsFromDatabase(serverEnv, fetchMock);

  assert.equal(result.loadedFromDatabase, true);
  assert.equal(result.flags.gopayCreateEnabled, true);
  assert.equal(result.flags.paymentAdminMonitoringEnabled, true);
  assert.equal(requestedUrl, 'https://example.supabase.co/rest/v1/payment_feature_flags?select=flag_name%2Cenabled');
  assert.deepEqual(requestedInit?.headers, {
    apikey: 'service-role-key',
    Authorization: 'Bearer service-role-key',
  });
  assert.equal(requestedInit?.cache, 'no-store');
  assert.equal(requestedInit?.signal instanceof AbortSignal, true);
});

test('serverový loader runtime vrací fail-closed výsledek při nevalidním JSON', async () => {
  const { readPaymentFeatureFlagsFromDatabase } = await loadPaymentFlagsServerModule();
  const result = await readPaymentFeatureFlagsFromDatabase(
    serverEnv,
    async () => new Response('{', { status: 200 }),
  );

  assert.equal(result.loadedFromDatabase, false);
  assert.equal(result.flags.gopayCreateEnabled, false);
  assert.equal(result.flags.autoRefundEnabled, false);
});

test('serverový loader runtime vrací fail-closed výsledek při HTTP chybě a výjimce z fetch', async () => {
  const { readPaymentFeatureFlagsFromDatabase } = await loadPaymentFlagsServerModule();
  const unauthorized = await readPaymentFeatureFlagsFromDatabase(
    serverEnv,
    async () => new Response('denied', { status: 403 }),
  );
  const failedFetch = await readPaymentFeatureFlagsFromDatabase(serverEnv, async () => {
    throw new Error('síťová chyba');
  });

  assert.equal(unauthorized.flags.gopayCreateEnabled, false);
  assert.equal(unauthorized.loadedFromDatabase, false);
  assert.equal(failedFetch.flags.gopayCreateEnabled, false);
  assert.equal(failedFetch.loadedFromDatabase, false);
});

test('serverový loader runtime při timeoutu abortuje fetch a vrátí všechny dynamické flagy vypnuté', async () => {
  const { readPaymentFeatureFlagsFromDatabase } = await loadPaymentFlagsServerModule();
  let aborted = false;
  const fetchMock: typeof fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      aborted = true;
      reject(new DOMException('Abortováno timeoutem', 'AbortError'));
    });
  });

  const result = await readPaymentFeatureFlagsFromDatabase(serverEnv, fetchMock, { timeoutMs: 10 });

  assert.equal(aborted, true);
  assert.equal(result.loadedFromDatabase, false);
  assert.equal(result.flags.gopayCreateEnabled, false);
  assert.equal(result.flags.gopayWebhookProcessingEnabled, false);
  assert.equal(result.flags.paymentExpirationEnabled, false);
  assert.equal(result.flags.autoRefundEnabled, false);
  assert.equal(result.flags.paymentAdminMonitoringEnabled, false);
});

test('serverový loader runtime při chybějící URL nebo service role key nevolá fetch a vrátí false', async () => {
  const { readPaymentFeatureFlagsFromDatabase } = await loadPaymentFlagsServerModule();
  let fetchCalled = false;
  const fetchMock: typeof fetch = async () => {
    fetchCalled = true;
    return new Response('[]');
  };

  const result = await readPaymentFeatureFlagsFromDatabase({ PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' }, fetchMock);

  assert.equal(fetchCalled, false);
  assert.equal(result.loadedFromDatabase, false);
  assert.equal(result.flags.gopayCreateEnabled, false);
});
