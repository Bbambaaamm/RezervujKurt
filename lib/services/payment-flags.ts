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
  mapPaymentFeatureFlagRows,
  resolvePaymentFeatureFlags,
  type PaymentDynamicFlags,
  type PaymentFeatureFlagEnvironment,
  type PaymentFeatureFlags,
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
  mapPaymentFeatureFlagRows,
  resolvePaymentFeatureFlags,
};
export type {
  GoPayEnvironment,
  PaymentDynamicFlags,
  PaymentFeatureDisabledReason,
  PaymentFeatureFlagEnvironment,
  PaymentFeatureFlags,
} from './payment-flags-core';

export type PaymentFeatureFlagFetchEnvironment = PaymentFeatureFlagEnvironment & {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type PaymentFeatureFlagFetchResult = {
  flags: PaymentFeatureFlags;
  loadedFromDatabase: boolean;
};

export type PaymentFeatureFlagFetchOptions = {
  timeoutMs?: number;
};

const PAYMENT_FEATURE_FLAGS_TIMEOUT_MS = 4000;

function buildPaymentFeatureFlagsEndpoint(supabaseUrl: string) {
  const url = new URL('/rest/v1/payment_feature_flags', supabaseUrl);
  url.searchParams.set('select', 'flag_name,enabled');
  return url.toString();
}

function resolveFallbackPaymentFeatureFlags(env: PaymentFeatureFlagEnvironment) {
  return resolvePaymentFeatureFlags(env, mapPaymentFeatureFlagRows([]));
}

export function readPaymentFeatureFlags(
  env: PaymentFeatureFlagEnvironment = process.env as PaymentFeatureFlagEnvironment,
  dynamicFlags: PaymentDynamicFlags = {},
) {
  return resolvePaymentFeatureFlags(env, dynamicFlags);
}

export async function readPaymentFeatureFlagsFromDatabase(
  env: PaymentFeatureFlagFetchEnvironment = process.env as PaymentFeatureFlagFetchEnvironment,
  fetchFn: typeof fetch = fetch,
  options: PaymentFeatureFlagFetchOptions = {},
): Promise<PaymentFeatureFlagFetchResult> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      flags: resolveFallbackPaymentFeatureFlags(env),
      loadedFromDatabase: false,
    };
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), options.timeoutMs ?? PAYMENT_FEATURE_FLAGS_TIMEOUT_MS);

  try {
    const response = await fetchFn(buildPaymentFeatureFlagsEndpoint(supabaseUrl), {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
      signal: abortController.signal,
    });

    if (!response.ok) {
      return {
        flags: resolveFallbackPaymentFeatureFlags(env),
        loadedFromDatabase: false,
      };
    }

    const rows = await response.json();

    return {
      flags: resolvePaymentFeatureFlags(env, mapPaymentFeatureFlagRows(rows)),
      loadedFromDatabase: Array.isArray(rows),
    };
  } catch {
    return {
      flags: resolveFallbackPaymentFeatureFlags(env),
      loadedFromDatabase: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
