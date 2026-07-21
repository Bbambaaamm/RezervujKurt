import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canCreateGoPayPayment,
  readPaymentFeatureFlags,
  requireGoPayCreateEnabled,
} from '../lib/services/payment-flags';

test('platební flagy jsou ve výchozím stavu bezpečně vypnuté', () => {
  const flags = readPaymentFeatureFlags({});

  assert.equal(flags.gopayCodeAvailable, false);
  assert.equal(flags.gopayEnvironment, 'sandbox');
  assert.equal(flags.gopayCreateEnabled, false);
  assert.equal(flags.gopayWebhookProcessingEnabled, false);
  assert.equal(flags.paymentExpirationEnabled, false);
  assert.equal(flags.autoRefundEnabled, false);
  assert.equal(flags.paymentAdminMonitoringEnabled, false);
  assert.equal(canCreateGoPayPayment(flags), false);
});

test('GoPay create flow zůstane vypnutý, pokud chybí capability flag nebo dynamický kill switch', () => {
  assert.equal(
    canCreateGoPayPayment(readPaymentFeatureFlags({ PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' })),
    false,
  );
  assert.equal(
    canCreateGoPayPayment(readPaymentFeatureFlags({}, { gopayCreateEnabled: true })),
    false,
  );
});

test('GoPay create flow lze povolit jen kombinací capability flagu a dynamického flagu', () => {
  const flags = readPaymentFeatureFlags(
    { PAYMENTS_GOPAY_CODE_AVAILABLE: 'true', PAYMENTS_GOPAY_ENV: 'production' },
    { gopayCreateEnabled: true },
  );

  assert.equal(flags.gopayEnvironment, 'production');
  assert.equal(canCreateGoPayPayment(flags), true);
});

test('serverový guard odmítne budoucí vytvoření platby při vypnutém flow', () => {
  assert.throws(
    () => requireGoPayCreateEnabled(readPaymentFeatureFlags({ PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' })),
    /Vytváření GoPay plateb je vypnuté\./,
  );
});
