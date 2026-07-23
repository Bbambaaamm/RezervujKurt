import 'server-only';

import { normalizeReservationPaymentSlotInput } from './payment-create-core';
import { PaymentFeatureDisabledError } from './payment-flags-core';

export type CreateGoPayPaymentRouteEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
};

export type AuthenticatedPaymentUser = {
  userId: string;
};

export type PaymentRouteAuthServiceErrorCode = 'timeout' | 'network_error' | 'upstream_error' | 'invalid_response';

export type CreateGoPayPaymentRouteDependencies = {
  requireGoPayCreateEnabled: () => Promise<unknown>;
  reportUnexpectedError?: (error: unknown) => void;
};

export type VerifySupabaseAccessTokenOptions = {
  timeoutMs?: number;
};

export type CreateGoPayPaymentRouteResponse = {
  status: number;
  body: { error: string };
};

type CreateGoPayPaymentPayload = {
  courtId?: unknown;
  reservationDate?: unknown;
  timeFrom?: unknown;
  timeTo?: unknown;
  note?: unknown;
};

const ALLOWED_CREATE_PAYLOAD_KEYS = new Set(['courtId', 'reservationDate', 'timeFrom', 'timeTo', 'note']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_AUTH_TIMEOUT_MS = 4000;
const SUPABASE_AUTH_MIN_TIMEOUT_MS = 100;
const SUPABASE_AUTH_MAX_TIMEOUT_MS = 30_000;

export class PaymentRouteAuthenticationError extends Error {
  constructor(message = 'Přihlášení pro platební rezervaci není platné.') {
    super(message);
    this.name = 'PaymentRouteAuthenticationError';
  }
}

export class PaymentRouteAuthServiceError extends Error {
  readonly code: PaymentRouteAuthServiceErrorCode;
  readonly httpStatus: number | null;

  constructor(code: PaymentRouteAuthServiceErrorCode, message: string, httpStatus: number | null = null) {
    super(message);
    this.name = 'PaymentRouteAuthServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class PaymentRouteConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRouteConfigurationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractBearerToken(authorizationHeader: string | null): string | null {
  const match = authorizationHeader?.trim().match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function hasOnlyAllowedPayloadKeys(payload: Record<string, unknown>) {
  return Object.keys(payload).every((key) => ALLOWED_CREATE_PAYLOAD_KEYS.has(key));
}

export function normalizeCreateGoPayPaymentPayload(body: unknown) {
  if (!isRecord(body) || !hasOnlyAllowedPayloadKeys(body)) return null;

  const payload = body as CreateGoPayPaymentPayload;
  if (typeof payload.note !== 'undefined' && payload.note !== null && typeof payload.note !== 'string') return null;

  const normalizedNote = payload.note?.trim() || null;
  if (normalizedNote !== null && normalizedNote.length > 500) return null;

  try {
    return {
      ...normalizeReservationPaymentSlotInput(payload),
      note: normalizedNote,
    };
  } catch {
    return null;
  }
}

function resolveAuthTimeoutMs(timeoutMs: number | undefined) {
  if (timeoutMs === undefined) return SUPABASE_AUTH_TIMEOUT_MS;

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < SUPABASE_AUTH_MIN_TIMEOUT_MS || timeoutMs > SUPABASE_AUTH_MAX_TIMEOUT_MS) {
    throw new PaymentRouteConfigurationError('Timeout pro ověření Supabase Auth není platný.');
  }

  return timeoutMs;
}

function buildSupabaseAuthUserEndpoint(supabaseUrl: string) {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new PaymentRouteConfigurationError('Supabase URL pro ověření platebního požadavku není platná.');
  }

  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new PaymentRouteConfigurationError('Supabase Auth URL musí používat HTTPS mimo lokální vývojové prostředí.');
  }

  return new URL('/auth/v1/user', url).toString();
}

export async function verifySupabaseAccessToken(
  token: string,
  env: CreateGoPayPaymentRouteEnvironment = process.env as CreateGoPayPaymentRouteEnvironment,
  fetchFn: typeof fetch = fetch,
  options: VerifySupabaseAccessTokenOptions = {},
): Promise<AuthenticatedPaymentUser> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new PaymentRouteConfigurationError('Chybí konfigurace Supabase Auth pro ověření platebního požadavku.');
  }

  const endpoint = buildSupabaseAuthUserEndpoint(supabaseUrl);
  const timeoutMs = resolveAuthTimeoutMs(options.timeoutMs);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
      signal: abortController.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new PaymentRouteAuthenticationError();
    }

    if (!response.ok) {
      throw new PaymentRouteAuthServiceError('upstream_error', 'Supabase Auth vrátil neočekávaný stav.', response.status);
    }

    let data: { id?: unknown };
    try {
      data = await response.json() as { id?: unknown };
    } catch {
      if (abortController.signal.aborted) {
        throw new PaymentRouteAuthServiceError('timeout', 'Ověření Supabase Auth vypršelo.');
      }

      throw new PaymentRouteAuthServiceError('invalid_response', 'Supabase Auth vrátil neplatné JSON tělo.');
    }

    if (typeof data.id !== 'string' || !UUID_PATTERN.test(data.id)) {
      throw new PaymentRouteAuthServiceError('invalid_response', 'Supabase Auth vrátil neplatnou identitu uživatele.');
    }

    return { userId: data.id };
  } catch (error) {
    if (error instanceof PaymentRouteAuthenticationError || error instanceof PaymentRouteAuthServiceError) {
      throw error;
    }

    if (abortController.signal.aborted) {
      throw new PaymentRouteAuthServiceError('timeout', 'Ověření Supabase Auth vypršelo.');
    }

    throw new PaymentRouteAuthServiceError('network_error', 'Supabase Auth ověření selhalo na síti.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function handleAuthenticatedCreateGoPayPaymentRequest(
  input: { authenticatedUser: AuthenticatedPaymentUser; body: unknown },
  dependencies: CreateGoPayPaymentRouteDependencies,
): Promise<CreateGoPayPaymentRouteResponse> {
  const payload = normalizeCreateGoPayPaymentPayload(input.body);
  if (!payload) {
    return { status: 400, body: { error: 'Neplatný požadavek na vytvoření platební rezervace.' } };
  }

  try {
    await dependencies.requireGoPayCreateEnabled();
  } catch (error) {
    if (error instanceof PaymentFeatureDisabledError) {
      return { status: 503, body: { error: 'GoPay platební flow je aktuálně vypnuté.' } };
    }

    dependencies.reportUnexpectedError?.(error);
    return { status: 503, body: { error: 'Platební flow je dočasně nedostupné.' } };
  }

  return { status: 501, body: { error: 'Serverové vytvoření GoPay platby zatím není dokončené.' } };
}
