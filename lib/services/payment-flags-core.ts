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

export type PaymentFeatureFlagEnvironment = {
  PAYMENTS_GOPAY_CODE_AVAILABLE?: string;
  PAYMENTS_GOPAY_ENV?: string;
};

export type PaymentFeatureDisabledReason =
  | 'gopay_create_disabled'
  | 'gopay_webhook_disabled'
  | 'payment_expiration_disabled'
  | 'auto_refund_disabled';

export class PaymentFeatureDisabledError extends Error {
  readonly httpStatus = 503;

  constructor(readonly reason: PaymentFeatureDisabledReason) {
    super('Payment feature is disabled');
    this.name = 'PaymentFeatureDisabledError';
  }
}

function isEnabled(value: string | undefined) {
  return value === 'true';
}

function resolveGoPayEnvironment(value: string | undefined): GoPayEnvironment {
  return value?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
}

export function resolvePaymentFeatureFlags(
  env: PaymentFeatureFlagEnvironment,
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

export function canProcessGoPayWebhook(
  flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'gopayWebhookProcessingEnabled'>,
) {
  return flags.gopayCodeAvailable && flags.gopayWebhookProcessingEnabled;
}

export function canExpirePayment(flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'paymentExpirationEnabled'>) {
  return flags.gopayCodeAvailable && flags.paymentExpirationEnabled;
}

export function canStartAutomaticRefund(flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'autoRefundEnabled'>) {
  return flags.gopayCodeAvailable && flags.autoRefundEnabled;
}

export function requireGoPayCreateEnabled(flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'gopayCreateEnabled'>) {
  if (!canCreateGoPayPayment(flags)) {
    throw new PaymentFeatureDisabledError('gopay_create_disabled');
  }
}

export function requireGoPayWebhookEnabled(
  flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'gopayWebhookProcessingEnabled'>,
) {
  if (!canProcessGoPayWebhook(flags)) {
    throw new PaymentFeatureDisabledError('gopay_webhook_disabled');
  }
}

export function requirePaymentExpirationEnabled(
  flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'paymentExpirationEnabled'>,
) {
  if (!canExpirePayment(flags)) {
    throw new PaymentFeatureDisabledError('payment_expiration_disabled');
  }
}

export function requireAutomaticRefundEnabled(flags: Pick<PaymentFeatureFlags, 'gopayCodeAvailable' | 'autoRefundEnabled'>) {
  if (!canStartAutomaticRefund(flags)) {
    throw new PaymentFeatureDisabledError('auto_refund_disabled');
  }
}
