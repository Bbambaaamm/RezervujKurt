import 'server-only';

export type PaymentStatusChangeSource = 'app_server' | 'gopay_webhook' | 'reconciliation' | 'admin_tool' | 'db_migration';
export type PaymentState = 'created' | 'awaiting_payment' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'requires_manual_review';
export type PaymentStateRpcErrorCode = 'timeout' | 'network_error' | 'http_error' | 'invalid_response';

export type PaymentStateChangeInput = {
  paymentId: string;
  newStatus: Exclude<PaymentState, 'created'>;
  source: PaymentStatusChangeSource;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  providerPaymentId?: string | null;
  expiresAt?: Date | string | null;
  paidAt?: Date | string | null;
  failedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  lastError?: string | null;
  incrementAttemptCount?: boolean;
};

export type PaymentStateRpcEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type PaymentStateRpcOptions = {
  timeoutMs?: number;
};

export class PaymentStateRpcConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentStateRpcConfigurationError';
  }
}

export class PaymentStateRpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentStateRpcValidationError';
  }
}

export class PaymentStateRpcError extends Error {
  readonly code: PaymentStateRpcErrorCode;
  readonly httpStatus: number | null;
  readonly safeDetails: string | null;

  constructor(message: string, code: PaymentStateRpcErrorCode, httpStatus: number | null = null, safeDetails: string | null = null) {
    super(message);
    this.name = 'PaymentStateRpcError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.safeDetails = safeDetails;
  }
}

const PAYMENT_STATE_RPC_TIMEOUT_MS = 4000;
const PAYMENT_STATE_RPC_MIN_TIMEOUT_MS = 100;
const PAYMENT_STATE_RPC_MAX_TIMEOUT_MS = 30_000;
const PAYMENT_STATE_RPC_MAX_METADATA_BYTES = 8192;
const PAYMENT_STATE_RPC_MAX_SAFE_DETAIL_LENGTH = 500;
const PAYMENT_TEXT_LIMITS = {
  providerPaymentId: 255,
  reason: 1000,
  lastError: 1000,
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_WITH_TIMEZONE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const PAYMENT_STATE_CHANGE_SOURCES = new Set<PaymentStatusChangeSource>([
  'app_server',
  'gopay_webhook',
  'reconciliation',
  'admin_tool',
  'db_migration',
]);
const PAYMENT_STATE_CHANGE_TARGETS = new Set<PaymentState>([
  'awaiting_payment',
  'paid',
  'failed',
  'cancelled',
  'expired',
  'requires_manual_review',
]);

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSerializableJsonValue(value: unknown, seen: WeakSet<object>): void {
  if (value === null) return;

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return;
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new PaymentStateRpcValidationError('metadata pro změnu stavu platby musí být JSON serializovatelný objekt.');
    case 'object':
      break;
    default:
      throw new PaymentStateRpcValidationError('metadata pro změnu stavu platby musí být JSON serializovatelný objekt.');
  }

  if (seen.has(value)) {
    throw new PaymentStateRpcValidationError('metadata pro změnu stavu platby nesmí obsahovat kruhové reference.');
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) assertSerializableJsonValue(item, seen);
    seen.delete(value);
    return;
  }

  if (!isPlainJsonObject(value)) {
    throw new PaymentStateRpcValidationError('metadata pro změnu stavu platby musí obsahovat pouze čisté JSON objekty.');
  }

  for (const item of Object.values(value)) assertSerializableJsonValue(item, seen);
  seen.delete(value);
}

function normalizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (value === undefined) return {};

  if (!isPlainJsonObject(value)) {
    throw new PaymentStateRpcValidationError('metadata pro změnu stavu platby musí být čistý JSON objekt.');
  }

  assertSerializableJsonValue(value, new WeakSet<object>());

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new PaymentStateRpcValidationError('metadata pro změnu stavu platby musí být JSON serializovatelný objekt.');
  }

  if (Buffer.byteLength(serialized, 'utf8') > PAYMENT_STATE_RPC_MAX_METADATA_BYTES) {
    throw new PaymentStateRpcValidationError('metadata pro změnu stavu platby překračují povolenou velikost.');
  }

  return JSON.parse(serialized) as Record<string, unknown>;
}

function normalizeOptionalText(value: unknown, name: 'reason' | 'providerPaymentId' | 'lastError'): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'string') {
    throw new PaymentStateRpcValidationError(`Hodnota ${name} musí být text nebo null.`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) return null;

  if (normalized.length > PAYMENT_TEXT_LIMITS[name]) {
    throw new PaymentStateRpcValidationError(`Hodnota ${name} překračuje povolenou délku.`);
  }

  return normalized;
}

function normalizeSupabaseUrl(value: string | undefined): string {
  const trimmedUrl = value?.trim();
  if (!trimmedUrl) {
    throw new PaymentStateRpcConfigurationError('Pro serverovou změnu stavu platby chybí Supabase URL.');
  }

  let url: URL;
  try {
    url = new URL(trimmedUrl);
  } catch {
    throw new PaymentStateRpcConfigurationError('Supabase URL pro serverovou změnu stavu platby není platná.');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new PaymentStateRpcConfigurationError('Supabase URL musí používat HTTPS; HTTP je povolené pouze pro localhost.');
  }

  return url.toString();
}

function resolveTimeoutMs(value: number | undefined): number {
  if (value === undefined) return PAYMENT_STATE_RPC_TIMEOUT_MS;

  if (!Number.isSafeInteger(value) || value < PAYMENT_STATE_RPC_MIN_TIMEOUT_MS || value > PAYMENT_STATE_RPC_MAX_TIMEOUT_MS) {
    throw new PaymentStateRpcValidationError('timeoutMs pro serverovou změnu stavu platby musí být celé číslo v rozsahu 100 až 30000 ms.');
  }

  return value;
}

function buildPaymentStateRpcEndpoint(supabaseUrl: string) {
  return new URL('/rest/v1/rpc/record_payment_state_change', supabaseUrl).toString();
}

function serializeOptionalTimestamp(value: Date | string | null | undefined, name: string): string | null {
  if (value === undefined || value === null) return null;

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new PaymentStateRpcValidationError(`Časová hodnota ${name} není platná.`);
    }

    return value.toISOString();
  }

  if (typeof value !== 'string' || !ISO_TIMESTAMP_WITH_TIMEZONE_PATTERN.test(value)) {
    throw new PaymentStateRpcValidationError(`Časová hodnota ${name} musí být Date nebo ISO timestamp s časovou zónou.`);
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new PaymentStateRpcValidationError(`Časová hodnota ${name} není platná.`);
  }

  return date.toISOString();
}

function assertNoExtraTimestamps(input: PaymentStateChangeInput, allowed: Array<keyof PaymentStateChangeInput>) {
  const timestampFields: Array<keyof PaymentStateChangeInput> = ['expiresAt', 'paidAt', 'failedAt', 'cancelledAt'];

  for (const field of timestampFields) {
    if (!allowed.includes(field) && input[field] !== undefined && input[field] !== null) {
      throw new PaymentStateRpcValidationError(`Stav ${input.newStatus} nepovoluje hodnotu ${field}.`);
    }
  }
}

function readSafeResponseDetails(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isPlainJsonObject(parsed)) {
      const message = typeof parsed.message === 'string' ? parsed.message : null;
      const code = typeof parsed.code === 'string' ? parsed.code : null;
      const details = [code, message].filter(Boolean).join(': ');
      return details ? details.slice(0, PAYMENT_STATE_RPC_MAX_SAFE_DETAIL_LENGTH) : null;
    }
  } catch {
    // Nevalidní JSON odpověď může být bezpečně zkrácený text, nikdy ji nelogujeme celou.
  }

  return trimmed.slice(0, PAYMENT_STATE_RPC_MAX_SAFE_DETAIL_LENGTH);
}

function normalizePaymentStateChangePayload(input: PaymentStateChangeInput) {
  if (!UUID_PATTERN.test(input.paymentId)) {
    throw new PaymentStateRpcValidationError('paymentId pro změnu stavu platby není platné UUID.');
  }

  if (!PAYMENT_STATE_CHANGE_TARGETS.has(input.newStatus)) {
    throw new PaymentStateRpcValidationError('Cílový stav platby není podporovaný.');
  }

  if (!PAYMENT_STATE_CHANGE_SOURCES.has(input.source)) {
    throw new PaymentStateRpcValidationError('source pro změnu stavu platby není podporovaný.');
  }

  if (input.incrementAttemptCount !== undefined && typeof input.incrementAttemptCount !== 'boolean') {
    throw new PaymentStateRpcValidationError('incrementAttemptCount musí být boolean.');
  }

  const metadata = normalizeMetadata(input.metadata);
  const reason = normalizeOptionalText(input.reason, 'reason');
  const providerPaymentId = normalizeOptionalText(input.providerPaymentId, 'providerPaymentId');
  const lastError = normalizeOptionalText(input.lastError, 'lastError');

  if (input.incrementAttemptCount && input.newStatus !== 'awaiting_payment') {
    throw new PaymentStateRpcValidationError('attempt_count lze navýšit pouze při přechodu na awaiting_payment.');
  }

  switch (input.newStatus) {
    case 'awaiting_payment':
      if (!providerPaymentId) throw new PaymentStateRpcValidationError('Přechod na awaiting_payment vyžaduje providerPaymentId.');
      if (!input.expiresAt) throw new PaymentStateRpcValidationError('Přechod na awaiting_payment vyžaduje expiresAt.');
      if (lastError !== null) throw new PaymentStateRpcValidationError('Přechod na awaiting_payment nepovoluje lastError.');
      assertNoExtraTimestamps(input, ['expiresAt']);
      break;
    case 'paid':
      if (!input.paidAt) throw new PaymentStateRpcValidationError('Přechod na paid vyžaduje paidAt.');
      if (providerPaymentId || input.expiresAt || input.failedAt || input.cancelledAt || lastError) {
        throw new PaymentStateRpcValidationError('Přechod na paid povoluje pouze paidAt.');
      }
      break;
    case 'failed':
      if (!input.failedAt) throw new PaymentStateRpcValidationError('Přechod na failed vyžaduje failedAt.');
      if (providerPaymentId || input.expiresAt || input.paidAt || input.cancelledAt) {
        throw new PaymentStateRpcValidationError('Přechod na failed povoluje pouze failedAt a volitelný lastError.');
      }
      break;
    case 'cancelled':
      if (!input.cancelledAt) throw new PaymentStateRpcValidationError('Přechod na cancelled vyžaduje cancelledAt.');
      if (providerPaymentId || input.expiresAt || input.paidAt || input.failedAt || lastError) {
        throw new PaymentStateRpcValidationError('Přechod na cancelled povoluje pouze cancelledAt.');
      }
      break;
    case 'expired':
    case 'requires_manual_review':
      if (providerPaymentId || input.expiresAt || input.paidAt || input.failedAt || input.cancelledAt || lastError) {
        throw new PaymentStateRpcValidationError('Přechod na expired nebo requires_manual_review nepovoluje změny provider údajů, časových sloupců ani lastError.');
      }
      break;
    default: {
      const exhaustiveCheck: never = input.newStatus;
      throw new PaymentStateRpcValidationError(`Nepodporovaný cílový stav platby: ${String(exhaustiveCheck)}`);
    }
  }

  return {
    p_payment_id: input.paymentId,
    p_new_status: input.newStatus,
    p_source: input.source,
    p_reason: reason,
    p_metadata: metadata,
    p_provider_payment_id: providerPaymentId,
    p_expires_at: serializeOptionalTimestamp(input.expiresAt, 'expiresAt'),
    p_paid_at: serializeOptionalTimestamp(input.paidAt, 'paidAt'),
    p_failed_at: serializeOptionalTimestamp(input.failedAt, 'failedAt'),
    p_cancelled_at: serializeOptionalTimestamp(input.cancelledAt, 'cancelledAt'),
    p_last_error: lastError,
    p_increment_attempt_count: input.incrementAttemptCount ?? false,
  };
}

export async function recordPaymentStateChange(
  input: PaymentStateChangeInput,
  env: PaymentStateRpcEnvironment = process.env as PaymentStateRpcEnvironment,
  fetchFn: typeof fetch = fetch,
  options: PaymentStateRpcOptions = {},
): Promise<string> {
  const supabaseUrl = normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new PaymentStateRpcConfigurationError('Pro serverovou změnu stavu platby chybí service-role klíč.');
  }

  const payload = normalizePaymentStateChangePayload(input);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchFn(buildPaymentStateRpcEndpoint(supabaseUrl), {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: abortController.signal,
    });

    if (!response.ok) {
      const safeDetails = readSafeResponseDetails(await response.text());
      throw new PaymentStateRpcError('Serverová změna stavu platby selhala.', 'http_error', response.status, safeDetails);
    }

    const result = await response.json();

    if (typeof result !== 'string' || !UUID_PATTERN.test(result)) {
      throw new PaymentStateRpcError('Serverová změna stavu platby vrátila neplatnou odpověď.', 'invalid_response', response.status);
    }

    return result;
  } catch (error) {
    if (error instanceof PaymentStateRpcError) throw error;

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new PaymentStateRpcError('Serverová změna stavu platby vypršela na timeout.', 'timeout');
    }

    throw new PaymentStateRpcError('Serverová změna stavu platby selhala na transportní chybě.', 'network_error');
  } finally {
    clearTimeout(timeoutId);
  }
}
