import { SupabaseRequestError } from '../supabase/client';

export class ReservationConflictError extends Error {}
export class ReservationUnauthorizedError extends Error {}
export class ReservationValidationError extends Error {}

const CONFLICT_CODES = new Set(['23P01', '23505']);
const VALIDATION_CODES = new Set(['22P02', '23514']);

function extractSupabaseErrorCode(responseBody: string): string | null {
  if (!responseBody) {
    return null;
  }

  try {
    const parsed = JSON.parse(responseBody) as { code?: string };
    return typeof parsed.code === 'string' ? parsed.code : null;
  } catch {
    return null;
  }
}

export function mapReservationWriteError(params: {
  status: number;
  statusText: string;
  endpoint: string;
  responseBody: string;
}): Error {
  const { status, statusText, endpoint, responseBody } = params;
  const errorCode = extractSupabaseErrorCode(responseBody);

  if (process.env.NODE_ENV === 'development') {
    console.error('[reservation-write] raw supabase error', { status, statusText, endpoint, errorCode, responseBody });
  }

  if (status === 401 || status === 403 || errorCode === '42501') {
    return new ReservationUnauthorizedError('Nemáte oprávnění k vytvoření rezervace.');
  }

  if (
    status === 409
    || errorCode === '23P01'
    || responseBody.includes('reservations_no_overlap_excl')
    || (errorCode !== null && CONFLICT_CODES.has(errorCode))
  ) {
    return new ReservationConflictError('Termín je již obsazen nebo koliduje s jinou rezervací.');
  }

  if (status === 400 || status === 422 || (errorCode !== null && VALIDATION_CODES.has(errorCode))) {
    return new ReservationValidationError('Neplatný vstup rezervace.');
  }

  return new SupabaseRequestError(
    `Vytvoření rezervace selhalo: ${status} ${statusText}`,
    endpoint,
    status,
    responseBody,
  );
}
