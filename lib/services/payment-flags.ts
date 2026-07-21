import 'server-only';

import {
  canCreateGoPayPayment,
  canExpirePayment,
  canProcessGoPayWebhook,
  canStartAutomaticRefund,
  requireAutomaticRefundEnabled,
  requireGoPayCreateEnabled,
  PaymentFeatureDisabledError,
  requireGoPayWebhookEnabled,
  requirePaymentExpirationEnabled,
  resolvePaymentFeatureFlags,
  type PaymentDynamicFlags,
  type PaymentFeatureFlagEnvironment,
} from './payment-flags-core';

export {
  canCreateGoPayPayment,
  canExpirePayment,
  canProcessGoPayWebhook,
  canStartAutomaticRefund,
  requireAutomaticRefundEnabled,
  requireGoPayCreateEnabled,
  PaymentFeatureDisabledError,
  requireGoPayWebhookEnabled,
  requirePaymentExpirationEnabled,
  resolvePaymentFeatureFlags,
};
export type {
  GoPayEnvironment,
  PaymentDynamicFlags,
  PaymentFeatureDisabledReason,
  PaymentFeatureFlagEnvironment,
  PaymentFeatureFlags,
} from './payment-flags-core';

export function readPaymentFeatureFlags(
  env: PaymentFeatureFlagEnvironment = process.env as PaymentFeatureFlagEnvironment,
  dynamicFlags: PaymentDynamicFlags = {},
) {
  return resolvePaymentFeatureFlags(env, dynamicFlags);
}
