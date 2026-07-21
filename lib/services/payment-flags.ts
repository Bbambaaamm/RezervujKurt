export type GoPayEnvironment = 'sandbox' | 'production';

export type PaymentDynamicFlags = {
  gopayCreateEnabled?: boolean;
  gopayWebhookProcessingEnabled?: boolean;
  paymentExpirationEnabled?: boolean;
  autoRefundEnabled?: boolean;
  paymentAdminMonitoringEnabled?: boolean;
};

export type PaymentFeatureFlags = {
  gopayCodeAvailable: boolean;
  gopayEnvironment: GoPayEnvironment;
  gopayCreateEnabled: boolean;
  gopayWebhookProcessingEnabled: boolean;
  paymentExpirationEnabled: boolean;
  autoRefundEnabled: boolean;
  paymentAdminMonitoringEnabled: boolean;
};

type PaymentFeatureFlagEnvironment = {
  PAYMENTS_GOPAY_CODE_AVAILABLE?: string;
  PAYMENTS_GOPAY_ENV?: string;
};

function isEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function resolveGoPayEnvironment(value: string | undefined): GoPayEnvironment {
  return value?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
}

export function readPaymentFeatureFlags(
  env: PaymentFeatureFlagEnvironment = process.env as PaymentFeatureFlagEnvironment,
  dynamicFlags: PaymentDynamicFlags = {},
): PaymentFeatureFlags {
  return {
    gopayCodeAvailable: isEnabled(env.PAYMENTS_GOPAY_CODE_AVAILABLE),
    gopayEnvironment: resolveGoPayEnvironment(env.PAYMENTS_GOPAY_ENV),
    gopayCreateEnabled: dynamicFlags.gopayCreateEnabled === true,
    gopayWebhookProcessingEnabled: dynamicFlags.gopayWebhookProcessingEnabled === true,
    paymentExpirationEnabled: dynamicFlags.paymentExpirationEnabled === true,
    autoRefundEnabled: dynamicFlags.autoRefundEnabled === true,
    paymentAdminMonitoringEnabled: dynamicFlags.paymentAdminMonitoringEnabled === true,
  };
}

export function canCreateGoPayPayment(flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'gopayCreateEnabled'>) {
  return flags.gopayCodeAvailable && flags.gopayCreateEnabled;
}

export function requireGoPayCreateEnabled(flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'gopayCreateEnabled'>) {
  if (!canCreateGoPayPayment(flags)) {
    throw new Error('Vytváření GoPay plateb je vypnuté.');
  }
}
