import 'server-only';

export type GoPayEnvironment = 'sandbox' | 'production';

export type GoPayClientEnvironment = {
  PAYMENTS_GOPAY_ENV?: string;
  GOPAY_CLIENT_ID?: string;
  GOPAY_CLIENT_SECRET?: string;
};

export type GoPayAccessToken = {
  accessToken: string;
  expiresInSeconds: number;
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

function parseAccessTokenResponse(value: unknown): GoPayAccessToken | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const response = value as Record<string, unknown>;
  if (response.token_type !== 'Bearer') return null;
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
