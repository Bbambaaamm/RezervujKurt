export type GoPayEnvironment = 'sandbox' | 'production';

export type PaymentDynamicFlags = {
  gopayCreateEnabled?: boolean;
  gopayWebhookProcessingEnabled?: boolean;
  paymentExpirationEnabled?: boolean;
  autoRefundEnabled?: boolean;
  paymentAdminMonitoringEnabled?: boolean;
};

export type PaymentFeatureFlagRow = {
  flag_name?: unknown;
  enabled?: unknown;
};

const dynamicFlagNames = {
  gopay_create_enabled: 'gopayCreateEnabled',
  gopay_webhook_processing_enabled: 'gopayWebhookProcessingEnabled',
  payment_expiration_enabled: 'paymentExpirationEnabled',
  auto_refund_enabled: 'autoRefundEnabled',
  payment_admin_monitoring_enabled: 'paymentAdminMonitoringEnabled',
} as const satisfies Record<string, keyof PaymentDynamicFlags>;

export const DEFAULT_PAYMENT_DYNAMIC_FLAGS: Required<PaymentDynamicFlags> = {
  gopayCreateEnabled: false,
  gopayWebhookProcessingEnabled: false,
  paymentExpirationEnabled: false,
  autoRefundEnabled: false,
  paymentAdminMonitoringEnabled: false,
};

function createDefaultPaymentDynamicFlags(): Required<PaymentDynamicFlags> {
  return { ...DEFAULT_PAYMENT_DYNAMIC_FLAGS };
}

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

export function mapPaymentFeatureFlagRows(rows: unknown): Required<PaymentDynamicFlags> {
  const dynamicFlags = createDefaultPaymentDynamicFlags();

  if (!Array.isArray(rows)) return dynamicFlags;

  const seenFlagNames = new Set<keyof typeof dynamicFlagNames>();
  const duplicatedDynamicFlagNames = new Set<keyof PaymentDynamicFlags>();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;

    const flagName = (row as PaymentFeatureFlagRow).flag_name;
    if (typeof flagName !== 'string') continue;

    const dynamicFlagName = dynamicFlagNames[flagName as keyof typeof dynamicFlagNames];
    if (!dynamicFlagName) continue;

    if (seenFlagNames.has(flagName as keyof typeof dynamicFlagNames)) {
      duplicatedDynamicFlagNames.add(dynamicFlagName);
      dynamicFlags[dynamicFlagName] = false;
      continue;
    }

    seenFlagNames.add(flagName as keyof typeof dynamicFlagNames);

    const enabled = (row as PaymentFeatureFlagRow).enabled;
    dynamicFlags[dynamicFlagName] = enabled === true;
  }

  for (const dynamicFlagName of duplicatedDynamicFlagNames) {
    dynamicFlags[dynamicFlagName] = false;
  }

  return dynamicFlags;
}
