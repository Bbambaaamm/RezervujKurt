import 'server-only';

import {
  buildReservationPaymentIdempotencyKey,
  normalizeReservationPaymentSlotInput,
} from './payment-create-core';
import { normalizeSupabaseServerUrl } from './supabase-server-url';

export type CreatePaymentReservationInput = {
  userId: string;
  courtId: number;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
  note?: string | null;
  amountCents: number;
  currency: 'CZK';
  metadata?: Record<string, unknown>;
};

export type CreatedPaymentReservation = {
  reservationId: string;
  paymentId: string;
};

export type PaymentReservationRpcEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type PaymentReservationRpcOptions = {
  timeoutMs?: number;
};

export type PaymentReservationRpcErrorCode = 'timeout' | 'network_error' | 'http_error' | 'invalid_response';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MAX_METADATA_BYTES = 8_192;

export class PaymentReservationRpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentReservationRpcValidationError';
  }
}

export class PaymentReservationRpcConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentReservationRpcConfigurationError';
  }
}

export class PaymentReservationRpcError extends Error {
  readonly code: PaymentReservationRpcErrorCode;
  readonly httpStatus: number | null;
  readonly postgresCode: string | null;

  constructor(message: string, code: PaymentReservationRpcErrorCode, httpStatus: number | null = null, postgresCode: string | null = null) {
    super(message);
    this.name = 'PaymentReservationRpcError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.postgresCode = postgresCode;
  }
}

function normalizeSupabaseUrl(value: string | undefined): string {
  const trimmedUrl = value?.trim();
  if (!trimmedUrl) throw new PaymentReservationRpcConfigurationError('Chybí Supabase URL pro založení platební rezervace.');

  const url = normalizeSupabaseServerUrl(trimmedUrl);
  if (!url) {
    throw new PaymentReservationRpcConfigurationError('Supabase URL pro založení platební rezervace není platná.');
  }

  return url.toString();
}

function resolveTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new PaymentReservationRpcValidationError('timeoutMs musí být celé číslo v rozsahu 100 až 30000 ms.');
  }
  return value;
}

function normalizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (value === undefined) return {};

  const seen = new WeakSet<object>();
  const assertJsonValue = (candidate: unknown): void => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return;
    if (typeof candidate !== 'object') throw new PaymentReservationRpcValidationError('metadata obsahují nepodporované hodnoty.');
    if (seen.has(candidate)) throw new PaymentReservationRpcValidationError('metadata nesmí obsahovat cyklus.');

    const isArray = Array.isArray(candidate);
    if (!isArray && Object.getPrototypeOf(candidate) !== Object.prototype) {
      throw new PaymentReservationRpcValidationError('metadata musí obsahovat pouze prosté JSON objekty.');
    }
    seen.add(candidate);
    for (const nestedValue of isArray ? candidate : Object.values(candidate)) assertJsonValue(nestedValue);
    seen.delete(candidate);
  };

  if (Object.getPrototypeOf(value) !== Object.prototype) throw new PaymentReservationRpcValidationError('metadata musí být prostý JSON objekt.');
  assertJsonValue(value);

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new PaymentReservationRpcValidationError('metadata musí být serializovatelný JSON objekt.');
  }

  if (new TextEncoder().encode(serialized).byteLength > MAX_METADATA_BYTES) {
    throw new PaymentReservationRpcValidationError('metadata překračují povolenou velikost.');
  }

  return JSON.parse(serialized) as Record<string, unknown>;
}

function normalizeNote(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new PaymentReservationRpcValidationError('Poznámka rezervace musí být text nebo null.');
  const note = value.trim();
  if (note.length > 500) throw new PaymentReservationRpcValidationError('Poznámka rezervace překračuje povolenou délku.');
  return note || null;
}

function readSafePostgresCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return typeof parsed?.code === 'string' && /^[0-9A-Z]{5}$/.test(parsed.code)
      ? parsed.code
      : null;
  } catch {
    return null;
  }
}

function isCreatedPaymentReservationRow(value: unknown): value is { reservation_id: string; payment_id: string } {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'reservation_id')
    && Object.hasOwn(value, 'payment_id')
    && typeof (value as Record<string, unknown>).reservation_id === 'string'
    && typeof (value as Record<string, unknown>).payment_id === 'string';
}

export async function createPaymentReservation(
  input: CreatePaymentReservationInput,
  env: PaymentReservationRpcEnvironment = process.env as PaymentReservationRpcEnvironment,
  fetchFn: typeof fetch = fetch,
  options: PaymentReservationRpcOptions = {},
): Promise<CreatedPaymentReservation> {
  if (!UUID_PATTERN.test(input.userId)) throw new PaymentReservationRpcValidationError('userId není platné UUID.');
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new PaymentReservationRpcValidationError('amountCents musí být kladná celočíselná hodnota.');
  }
  if (input.currency !== 'CZK') throw new PaymentReservationRpcValidationError('Podporovaná měna platby je pouze CZK.');

  let slot;
  try {
    slot = normalizeReservationPaymentSlotInput(input);
  } catch (error) {
    throw new PaymentReservationRpcValidationError(error instanceof Error ? error.message : 'Slot rezervace není platný.');
  }
  const normalizedUserId = input.userId.toLowerCase();
  const metadata = normalizeMetadata(input.metadata);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const payload = {
    p_user_id: normalizedUserId,
    p_court_id: slot.courtId,
    p_reservation_date: slot.reservationDate,
    p_time_from: slot.timeFrom,
    p_time_to: slot.timeTo,
    p_note: normalizeNote(input.note),
    p_idempotency_key: buildReservationPaymentIdempotencyKey({
      userId: normalizedUserId,
      ...slot,
      amountCents: input.amountCents,
      currency: input.currency,
    }),
    p_amount_cents: input.amountCents,
    p_currency: input.currency,
    p_metadata: metadata,
  };

  const supabaseUrl = normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new PaymentReservationRpcConfigurationError('Chybí service-role klíč pro založení platební rezervace.');

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await fetchFn(new URL('/rest/v1/rpc/create_payment_reservation', supabaseUrl), {
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
      throw new PaymentReservationRpcError('Založení platební rezervace selhalo.', 'http_error', response.status, readSafePostgresCode(await response.text()));
    }

    let rows: unknown;
    try {
      rows = await response.json() as unknown;
    } catch (error) {
      if (abortController.signal.aborted) throw error;
      throw new PaymentReservationRpcError('Založení platební rezervace vrátilo neplatnou odpověď.', 'invalid_response', response.status);
    }

    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!isCreatedPaymentReservationRow(row) || !UUID_PATTERN.test(row.reservation_id) || !UUID_PATTERN.test(row.payment_id)) {
      throw new PaymentReservationRpcError('Založení platební rezervace vrátilo neplatnou odpověď.', 'invalid_response', response.status);
    }
    return { reservationId: row.reservation_id, paymentId: row.payment_id };
  } catch (error) {
    if (error instanceof PaymentReservationRpcError) throw error;
    if (abortController.signal.aborted) {
      throw new PaymentReservationRpcError('Založení platební rezervace vypršelo na timeout.', 'timeout');
    }
    throw new PaymentReservationRpcError('Založení platební rezervace selhalo na transportní chybě.', 'network_error');
  } finally {
    clearTimeout(timeoutId);
  }
}
