import 'server-only';

export type GoPayEnvironment = 'sandbox' | 'production';

export type GoPayClientEnvironment = {
  PAYMENTS_GOPAY_ENV?: string;
  GOPAY_CLIENT_ID?: string;
  GOPAY_CLIENT_SECRET?: string;
  GOPAY_GOID?: string;
  PAYMENTS_PUBLIC_ORIGIN?: string;
};

export type GoPayCreatePaymentInput = {
  paymentId: string;
  reservationId: string;
  amountCents: number;
  currency: 'CZK';
};

export type GoPayCreatePaymentPayload = {
  amount: number;
  currency: 'CZK';
  target: { type: 'ACCOUNT'; goid: string };
  order_number: string;
  order_description: string;
  items: Array<{ name: string; amount: number; count: 1 }>;
  callback: { return_url: string; notification_url: string };
  lang: 'CS';
};

export type GoPayAccessToken = {
  accessToken: string;
  expiresInSeconds: number;
};

export type GoPayCreatedPayment = {
  providerPaymentId: number;
  gatewayUrl: string;
  state: 'CREATED';
};

export type GoPayClientOptions = {
  timeoutMs?: number;
};

export type GoPayClientErrorCode = 'timeout' | 'network_error' | 'upstream_error' | 'invalid_response';

const GOPAY_ORIGINS: Record<GoPayEnvironment, string> = {
  sandbox: 'https://gw.sandbox.gopay.com',
  production: 'https://gate.gopay.cz',
};
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MAX_ACCESS_TOKEN_LENGTH = 4_096;
const MAX_ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAYMENT_AMOUNT_CENTS = 99_999_999;
const MAX_CALLBACK_URL_LENGTH = 2_048;
const MAX_GOID_LENGTH = 32;
const GOPAY_RETURN_PATH = '/gopay/return';
const GOPAY_NOTIFICATION_PATH = '/api/payments/gopay/notification';

export class GoPayClientConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoPayClientConfigurationError';
  }
}

export class GoPayClientError extends Error {
  readonly code: GoPayClientErrorCode;
  readonly httpStatus: number | null;

  constructor(message: string, code: GoPayClientErrorCode, httpStatus: number | null = null) {
    super(message);
    this.name = 'GoPayClientError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function resolveGoPayEnvironment(value: string | undefined): GoPayEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'sandbox' || normalized === 'production') return normalized;

  throw new GoPayClientConfigurationError('Prostředí GoPay musí být explicitně sandbox nebo production.');
}

function requireCredential(name: string, value: string | undefined): string {
  const credential = value?.trim();
  if (!credential || /[\r\n]/.test(credential)) {
    throw new GoPayClientConfigurationError(`Chybí nebo není platná konfigurace ${name}.`);
  }
  return credential;
}

function resolveTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new GoPayClientConfigurationError('GoPay timeout musí být celé číslo v rozsahu 100 až 30000 ms.');
  }
  return value;
}

function normalizePaymentUuid(name: string, value: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new GoPayClientConfigurationError(`${name} pro GoPay platbu není platné UUID.`);
  }
  return value.toLowerCase();
}

function normalizePublicOrigin(value: string | undefined): URL {
  const publicOrigin = value?.trim();
  if (!publicOrigin || publicOrigin.length > MAX_CALLBACK_URL_LENGTH) {
    throw new GoPayClientConfigurationError('Veřejný origin platebních callbacků není platný.');
  }

  let url: URL;
  try {
    url = new URL(publicOrigin);
  } catch {
    throw new GoPayClientConfigurationError('Veřejný origin platebních callbacků není platný.');
  }

  const isLocalHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((url.protocol !== 'https:' && !isLocalHttp)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash) {
    throw new GoPayClientConfigurationError('Veřejný origin platebních callbacků není bezpečný čistý origin.');
  }
  return url;
}

function normalizeGoId(value: string | undefined): string {
  const goId = value?.trim();
  if (!goId || goId.length > MAX_GOID_LENGTH || !/^\d+$/.test(goId)) {
    throw new GoPayClientConfigurationError('GoPay GoID není platně nakonfigurované.');
  }
  return goId;
}

/**
 * Sestaví pouze minimální, serverově odvozený payload. Kontaktní údaje plátce se
 * záměrně neposílají, dokud pro ně nebude schválený produktový a GDPR kontrakt.
 */
export function buildGoPayCreatePaymentPayload(
  input: GoPayCreatePaymentInput,
  env: GoPayClientEnvironment = process.env as GoPayClientEnvironment,
): GoPayCreatePaymentPayload {
  const paymentId = normalizePaymentUuid('Interní payment ID', input.paymentId);
  const reservationId = normalizePaymentUuid('Interní reservation ID', input.reservationId);
  if (paymentId === reservationId) {
    throw new GoPayClientConfigurationError('Interní payment ID a reservation ID musí být odlišné.');
  }

  if (!Number.isSafeInteger(input.amountCents)
    || input.amountCents <= 0
    || input.amountCents > MAX_PAYMENT_AMOUNT_CENTS) {
    throw new GoPayClientConfigurationError('Částka GoPay platby není platná.');
  }
  if (input.currency !== 'CZK') {
    throw new GoPayClientConfigurationError('Měna GoPay platby musí být CZK.');
  }

  const publicOrigin = normalizePublicOrigin(env.PAYMENTS_PUBLIC_ORIGIN);
  const goId = normalizeGoId(env.GOPAY_GOID);

  return {
    amount: input.amountCents,
    currency: 'CZK',
    target: { type: 'ACCOUNT', goid: goId },
    order_number: paymentId,
    order_description: `Rezervace kurtu ${reservationId}`,
    items: [{ name: 'Rezervace kurtu', amount: input.amountCents, count: 1 }],
    callback: {
      return_url: new URL(GOPAY_RETURN_PATH, publicOrigin).toString(),
      notification_url: new URL(GOPAY_NOTIFICATION_PATH, publicOrigin).toString(),
    },
    lang: 'CS',
  };
}

function parseAccessTokenResponse(value: unknown): GoPayAccessToken | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const response = value as Record<string, unknown>;
  if (typeof response.token_type !== 'string' || response.token_type.toLowerCase() !== 'bearer') return null;
  if (typeof response.access_token !== 'string'
    || response.access_token.length === 0
    || response.access_token.length > MAX_ACCESS_TOKEN_LENGTH
    || /\s/.test(response.access_token)) return null;
  if (!Number.isSafeInteger(response.expires_in)
    || (response.expires_in as number) <= 0
    || (response.expires_in as number) > MAX_ACCESS_TOKEN_TTL_SECONDS) return null;

  return {
    accessToken: response.access_token,
    expiresInSeconds: response.expires_in as number,
  };
}

function requireAccessToken(value: string): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ACCESS_TOKEN_LENGTH
    || /\s/.test(value)) {
    throw new GoPayClientConfigurationError('GoPay access token není platný.');
  }
  return value;
}

function parseCreatedPaymentResponse(
  value: unknown,
  environment: GoPayEnvironment,
): GoPayCreatedPayment | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const response = value as Record<string, unknown>;
  if (!Number.isSafeInteger(response.id) || (response.id as number) <= 0) return null;
  if (response.state !== 'CREATED'
    || typeof response.gw_url !== 'string'
    || response.gw_url.length === 0
    || response.gw_url !== response.gw_url.trim()
    || /[\u0000-\u001f\u007f]/.test(response.gw_url)) return null;

  let gatewayUrl: URL;
  try {
    gatewayUrl = new URL(response.gw_url);
  } catch {
    return null;
  }

  const expectedOrigin = new URL(GOPAY_ORIGINS[environment]);
  if (gatewayUrl.protocol !== 'https:'
    || gatewayUrl.origin !== expectedOrigin.origin
    || gatewayUrl.username
    || gatewayUrl.password
    || gatewayUrl.hash) return null;

  return {
    providerPaymentId: response.id as number,
    gatewayUrl: response.gw_url,
    state: 'CREATED',
  };
}

export async function requestGoPayAccessToken(
  env: GoPayClientEnvironment = process.env as GoPayClientEnvironment,
  fetchFn: typeof fetch = fetch,
  options: GoPayClientOptions = {},
): Promise<GoPayAccessToken> {
  const environment = resolveGoPayEnvironment(env.PAYMENTS_GOPAY_ENV);
  const clientId = requireCredential('GOPAY_CLIENT_ID', env.GOPAY_CLIENT_ID);
  const clientSecret = requireCredential('GOPAY_CLIENT_SECRET', env.GOPAY_CLIENT_SECRET);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchFn(new URL('/api/oauth2/token', GOPAY_ORIGINS[environment]), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'payment-create' }).toString(),
      cache: 'no-store',
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new GoPayClientError('GoPay odmítlo vydání přístupového tokenu.', 'upstream_error', response.status);
    }

    let body: unknown;
    try {
      body = await response.json() as unknown;
    } catch (error) {
      if (abortController.signal.aborted) throw error;
      throw new GoPayClientError('GoPay vrátilo neplatnou odpověď token endpointu.', 'invalid_response', response.status);
    }

    const token = parseAccessTokenResponse(body);
    if (!token) {
      throw new GoPayClientError('GoPay vrátilo neplatnou odpověď token endpointu.', 'invalid_response', response.status);
    }

    return token;
  } catch (error) {
    if (error instanceof GoPayClientError) throw error;
    if (abortController.signal.aborted) {
      throw new GoPayClientError('Požadavek na GoPay token vypršel.', 'timeout');
    }
    throw new GoPayClientError('Požadavek na GoPay token selhal na síti.', 'network_error');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Odešle izolovaný provider create požadavek. Funkce sama nemění databázový stav
 * a nesmí být volána bez nadřazené idempotentní sagy a kompenzačního postupu.
 */
export async function requestGoPayCreatePayment(
  input: GoPayCreatePaymentInput,
  accessToken: string,
  env: GoPayClientEnvironment = process.env as GoPayClientEnvironment,
  fetchFn: typeof fetch = fetch,
  options: GoPayClientOptions = {},
): Promise<GoPayCreatedPayment> {
  const environment = resolveGoPayEnvironment(env.PAYMENTS_GOPAY_ENV);
  const token = requireAccessToken(accessToken);
  const payload = buildGoPayCreatePaymentPayload(input, env);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchFn(new URL('/api/payments/payment', GOPAY_ORIGINS[environment]), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new GoPayClientError('GoPay odmítlo vytvoření platby.', 'upstream_error', response.status);
    }

    let body: unknown;
    try {
      body = await response.json() as unknown;
    } catch (error) {
      if (abortController.signal.aborted) throw error;
      throw new GoPayClientError('GoPay vrátilo neplatnou odpověď create endpointu.', 'invalid_response', response.status);
    }

    const payment = parseCreatedPaymentResponse(body, environment);
    if (!payment) {
      throw new GoPayClientError('GoPay vrátilo neplatnou odpověď create endpointu.', 'invalid_response', response.status);
    }

    return payment;
  } catch (error) {
    if (error instanceof GoPayClientError) throw error;
    if (abortController.signal.aborted) {
      throw new GoPayClientError('Požadavek na vytvoření GoPay platby vypršel.', 'timeout');
    }
    throw new GoPayClientError('Požadavek na vytvoření GoPay platby selhal na síti.', 'network_error');
  } finally {
    clearTimeout(timeoutId);
  }
}
