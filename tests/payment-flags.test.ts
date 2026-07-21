import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canCreateGoPayPayment,
  canExpirePayment,
  canProcessGoPayWebhook,
  canStartAutomaticRefund,
  PaymentFeatureDisabledError,
  resolvePaymentFeatureFlags,
  requireAutomaticRefundEnabled,
  requireGoPayCreateEnabled,
  requireGoPayWebhookEnabled,
  requirePaymentExpirationEnabled,
} from '../lib/services/payment-flags-core';

test('platební flagy jsou ve výchozím stavu bezpečně vypnuté', () => {
  const flags = resolvePaymentFeatureFlags({});

  assert.equal(flags.gopayCodeAvailable, false);
  assert.equal(flags.gopayEnvironment, 'sandbox');
  assert.equal(flags.gopayCreateEnabled, false);
  assert.equal(flags.gopayWebhookProcessingEnabled, false);
  assert.equal(flags.paymentExpirationEnabled, false);
  assert.equal(flags.autoRefundEnabled, false);
  assert.equal(flags.paymentAdminMonitoringEnabled, false);
  assert.equal(canCreateGoPayPayment(flags), false);
});

test('capability flag je zapnutý pouze při přesné hodnotě true', () => {
  for (const value of ['', 'false', 'TRUE', 'True', '1', 'yes']) {
    const flags = resolvePaymentFeatureFlags({
      PAYMENTS_GOPAY_CODE_AVAILABLE: value,
    });

    assert.equal(
      flags.gopayCodeAvailable,
      false,
      `Hodnota "${value}" nesmí capability flag aktivovat`,
    );
  }
});

test('neplatné GoPay prostředí bezpečně spadne na sandbox', () => {
  const flags = resolvePaymentFeatureFlags({
    PAYMENTS_GOPAY_ENV: 'invalid',
  });

  assert.equal(flags.gopayEnvironment, 'sandbox');
  assert.equal(
    resolvePaymentFeatureFlags({ PAYMENTS_GOPAY_ENV: '' }).gopayEnvironment,
    'sandbox',
  );
});

test('GoPay create flow zůstane vypnutý, pokud chybí capability flag nebo dynamický kill switch', () => {
  assert.equal(
    canCreateGoPayPayment(resolvePaymentFeatureFlags({ PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' })),
    false,
  );
  assert.equal(
    canCreateGoPayPayment(resolvePaymentFeatureFlags({}, { gopayCreateEnabled: true })),
    false,
  );
});

test('GoPay create flow lze povolit jen kombinací capability flagu a dynamického flagu', () => {
  const flags = resolvePaymentFeatureFlags(
    { PAYMENTS_GOPAY_CODE_AVAILABLE: 'true', PAYMENTS_GOPAY_ENV: 'production' },
    { gopayCreateEnabled: true },
  );

  assert.equal(flags.gopayEnvironment, 'production');
  assert.equal(canCreateGoPayPayment(flags), true);
});

test('serverový guard odmítne budoucí vytvoření platby při vypnutém flow', () => {
  assert.throws(
    () => requireGoPayCreateEnabled(resolvePaymentFeatureFlags({ PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' })),
    /Payment feature is disabled/,
  );
});

test('serverový guard povolený GoPay create flow neodmítne', () => {
  const flags = resolvePaymentFeatureFlags(
    {
      PAYMENTS_GOPAY_CODE_AVAILABLE: 'true',
      PAYMENTS_GOPAY_ENV: 'sandbox',
    },
    {
      gopayCreateEnabled: true,
    },
  );

  assert.doesNotThrow(() => requireGoPayCreateEnabled(flags));
});

test('GoPay webhook processing vyžaduje capability flag i dynamický flag', () => {
  assert.equal(
    canProcessGoPayWebhook(resolvePaymentFeatureFlags({}, { gopayWebhookProcessingEnabled: true })),
    false,
  );
  assert.equal(
    canProcessGoPayWebhook(resolvePaymentFeatureFlags({ PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' })),
    false,
  );
  assert.equal(
    canProcessGoPayWebhook(
      resolvePaymentFeatureFlags(
        { PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' },
        { gopayWebhookProcessingEnabled: true },
      ),
    ),
    true,
  );
});


test('guard pro vypnuté vytváření GoPay plateb vrací mapovatelnou platební chybu', () => {
  assert.throws(
    () => requireGoPayCreateEnabled(resolvePaymentFeatureFlags({ PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' })),
    (error: unknown) => {
      assert.equal(error instanceof PaymentFeatureDisabledError, true);
      assert.equal((error as PaymentFeatureDisabledError).reason, 'gopay_create_disabled');
      assert.equal((error as PaymentFeatureDisabledError).httpStatus, 503);
      return true;
    },
  );
});

test('expirace plateb a automatický refund používají capability-aware helpery', () => {
  assert.equal(
    canExpirePayment(resolvePaymentFeatureFlags({}, { paymentExpirationEnabled: true })),
    false,
  );
  assert.equal(
    canStartAutomaticRefund(resolvePaymentFeatureFlags({}, { autoRefundEnabled: true })),
    false,
  );

  const flags = resolvePaymentFeatureFlags(
    { PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' },
    { paymentExpirationEnabled: true, autoRefundEnabled: true },
  );

  assert.equal(canExpirePayment(flags), true);
  assert.equal(canStartAutomaticRefund(flags), true);
});

test('guardy pro budoucí platební operace vrací konkrétní důvody vypnutí', () => {
  const flags = resolvePaymentFeatureFlags({ PAYMENTS_GOPAY_CODE_AVAILABLE: 'true' });

  assert.throws(
    () => requireGoPayWebhookEnabled(flags),
    (error: unknown) => error instanceof PaymentFeatureDisabledError
      && error.reason === 'gopay_webhook_disabled',
  );
  assert.throws(
    () => requirePaymentExpirationEnabled(flags),
    (error: unknown) => error instanceof PaymentFeatureDisabledError
      && error.reason === 'payment_expiration_disabled',
  );
  assert.throws(
    () => requireAutomaticRefundEnabled(flags),
    (error: unknown) => error instanceof PaymentFeatureDisabledError
      && error.reason === 'auto_refund_disabled',
  );
});
