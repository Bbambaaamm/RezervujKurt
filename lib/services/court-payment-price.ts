import 'server-only';

import {
  calculateReservationPriceCents,
  normalizeReservationPaymentSlotInput,
  type ReservationPaymentSlotInput,
} from './payment-create-core';
import { normalizeSupabaseServerUrl } from './supabase-server-url';

export type CourtPaymentPrice = {
  pricePerHourCents: number;
  currency: 'CZK';
};

export type CourtPaymentPriceEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type CourtPaymentPriceOptions = {
  timeoutMs?: number;
};

export type CourtPaymentPriceErrorCode = 'not_configured' | 'timeout' | 'network_error' | 'http_error' | 'invalid_response';

const DEFAULT_TIMEOUT_MS = 4_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
// Odpovídá DB stropu odvozenému od integer amount_cents a nejdelšího jednodenního intervalu.
const MAX_PRICE_PER_HOUR_CENTS = 89_478_485;

export class CourtPaymentPriceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourtPaymentPriceConfigurationError';
  }
}

export class CourtPaymentPriceError extends Error {
  readonly code: CourtPaymentPriceErrorCode;
  readonly httpStatus: number | null;

  constructor(message: string, code: CourtPaymentPriceErrorCode, httpStatus: number | null = null) {
    super(message);
    this.name = 'CourtPaymentPriceError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function resolveTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new CourtPaymentPriceConfigurationError('Timeout pro načtení ceny kurtu není platný.');
  }
  return value;
}

function isPriceRow(value: unknown): value is { price_per_hour_cents: number; currency: 'CZK' } {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'price_per_hour_cents')
    && Object.hasOwn(value, 'currency')
    && Number.isSafeInteger((value as Record<string, unknown>).price_per_hour_cents)
    && ((value as Record<string, unknown>).price_per_hour_cents as number) > 0
    && ((value as Record<string, unknown>).price_per_hour_cents as number) <= MAX_PRICE_PER_HOUR_CENTS
    && (value as Record<string, unknown>).currency === 'CZK';
}

export async function calculateCourtReservationAmount(
  slotInput: ReservationPaymentSlotInput,
  readPrice: (courtId: number) => Promise<CourtPaymentPrice> = readCourtPaymentPrice,
): Promise<{ amountCents: number; currency: 'CZK' }> {
  const slot = normalizeReservationPaymentSlotInput(slotInput);
  const price = await readPrice(slot.courtId);
  const amountCents = calculateReservationPriceCents({
    timeFrom: slot.timeFrom,
    timeTo: slot.timeTo,
    pricePerHourCents: price.pricePerHourCents,
  });

  // payments.amount_cents je PostgreSQL integer; odmítnutí proběhne ještě před DB side effectem.
  if (amountCents > 2_147_483_647) {
    throw new CourtPaymentPriceError('Vypočtená cena rezervace je mimo podporovaný rozsah.', 'invalid_response');
  }

  return { amountCents, currency: price.currency };
}

export async function readCourtPaymentPrice(
  courtId: number,
  env: CourtPaymentPriceEnvironment = process.env as CourtPaymentPriceEnvironment,
  fetchFn: typeof fetch = fetch,
  options: CourtPaymentPriceOptions = {},
): Promise<CourtPaymentPrice> {
  if (!Number.isSafeInteger(courtId) || courtId <= 0) {
    throw new CourtPaymentPriceConfigurationError('Identifikátor kurtu pro načtení ceny není platný.');
  }

  const rawSupabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawSupabaseUrl || !serviceRoleKey) {
    throw new CourtPaymentPriceConfigurationError('Chybí serverová konfigurace pro načtení ceny kurtu.');
  }
  const supabaseUrl = normalizeSupabaseServerUrl(rawSupabaseUrl);
  if (!supabaseUrl) throw new CourtPaymentPriceConfigurationError('Supabase URL pro načtení ceny kurtu není platná.');

  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchFn(new URL('/rest/v1/rpc/get_court_payment_price', supabaseUrl), {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_court_id: courtId }),
      cache: 'no-store',
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new CourtPaymentPriceError('Načtení ceny kurtu selhalo.', 'http_error', response.status);
    }

    let rows: unknown;
    try {
      rows = await response.json() as unknown;
    } catch (error) {
      if (abortController.signal.aborted) throw error;
      throw new CourtPaymentPriceError('Načtení ceny kurtu vrátilo neplatnou odpověď.', 'invalid_response', response.status);
    }

    if (Array.isArray(rows) && rows.length === 0) {
      throw new CourtPaymentPriceError('Cena aktivního kurtu není nakonfigurovaná.', 'not_configured', response.status);
    }

    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!isPriceRow(row)) {
      throw new CourtPaymentPriceError('Načtení ceny kurtu vrátilo neplatnou odpověď.', 'invalid_response', response.status);
    }

    return { pricePerHourCents: row.price_per_hour_cents, currency: row.currency };
  } catch (error) {
    if (error instanceof CourtPaymentPriceError) throw error;
    if (abortController.signal.aborted) {
      throw new CourtPaymentPriceError('Načtení ceny kurtu vypršelo na timeout.', 'timeout');
    }
    throw new CourtPaymentPriceError('Načtení ceny kurtu selhalo na transportní chybě.', 'network_error');
  } finally {
    clearTimeout(timeoutId);
  }
}
