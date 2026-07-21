import 'server-only';

import {
  canCreateGoPayPayment,
  canProcessGoPayWebhook,
  requireGoPayCreateEnabled,
  resolvePaymentFeatureFlags,
  type PaymentDynamicFlags,
  type PaymentFeatureFlagEnvironment,
} from './payment-flags-core';

export {
  canCreateGoPayPayment,
  canProcessGoPayWebhook,
  requireGoPayCreateEnabled,
  resolvePaymentFeatureFlags,
};
export type {
  GoPayEnvironment,
  PaymentDynamicFlags,
  PaymentFeatureFlagEnvironment,
  PaymentFeatureFlags,
} from './payment-flags-core';

export function readPaymentFeatureFlags(
  env: PaymentFeatureFlagEnvironment = process.env as PaymentFeatureFlagEnvironment,
  dynamicFlags: PaymentDynamicFlags = {},
) {
  return resolvePaymentFeatureFlags(env, dynamicFlags);
}
