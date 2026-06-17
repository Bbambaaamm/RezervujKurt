import type { AuthSession } from '../supabase/auth-client';
import { mapReservationWriteError, ReservationNoLongerPendingError, ReservationUnauthorizedError } from './supabase-error-mapping';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type CancelMyReservationInput = {
  session: AuthSession | null;
  reservationId: string;
};

type CancelableReservation = {
  reservationDate: string;
  timeFrom: string;
  status: 'pending' | 'approved' | 'cancelled';
};

type MyReservationsFeedbackState = {
  errorMessage: string | null;
  successMessage: string | null;
};

const PRAGUE_TZ = 'Europe/Prague';

function getZonedDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? NaN);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const zoned = getZonedDateParts(date, timeZone);
  const utcFromZonedParts = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  return utcFromZonedParts - date.getTime();
}

function parseTimeParts(timeFrom: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeFrom);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? '0');

  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function parseDateParts(reservationDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reservationDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

// reservation_date + time_from jsou business-lokální čas kurtu (Europe/Prague), ne timezone zařízení.
function getPragueReservationStartMs(reservationDate: string, timeFrom: string) {
  const dateParts = parseDateParts(reservationDate);
  const timeParts = parseTimeParts(timeFrom);
  if (!dateParts || !timeParts) return Number.NaN;

  const baseUtcMs = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, timeParts.hour, timeParts.minute, timeParts.second);
  const probeDate = new Date(baseUtcMs);
  const offsetMs = getTimeZoneOffsetMs(probeDate, PRAGUE_TZ);
  return baseUtcMs - offsetMs;
}

type GetMyReservationsFeedbackOnReloadInput = {
  currentSuccessMessage: string | null;
  preservedSuccessMessage?: string | null;
};

export function getMyReservationsFeedbackOnReload(input: GetMyReservationsFeedbackOnReloadInput): MyReservationsFeedbackState {
  return {
    errorMessage: null,
    successMessage: input.preservedSuccessMessage ?? input.currentSuccessMessage,
  };
}

export function isMyReservationUpcoming(reservation: CancelableReservation, now = new Date()) {
  if (reservation.status !== 'pending' && reservation.status !== 'approved') {
    return false;
  }

  const reservationStartMs = getPragueReservationStartMs(reservation.reservationDate, reservation.timeFrom);
  if (Number.isNaN(reservationStartMs)) {
    return false;
  }

  return reservationStartMs > now.getTime();
}

export function isMyReservationCancelable(reservation: CancelableReservation, now = new Date()) {
  return isMyReservationUpcoming(reservation, now);
}

export async function cancelMyReservation(input: CancelMyReservationInput): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Chybí konfigurace Supabase proměnných prostředí.');
  }

  const userId = input.session?.user?.id;
  const accessToken = input.session?.access_token;

  if (!userId || !accessToken) {
    throw new ReservationUnauthorizedError('Nemáte oprávnění zrušit tuto rezervaci.');
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('my reservation cancel started', { reservationId: input.reservationId, userId });
  }

  const endpoint = `${supabaseUrl}/rest/v1/reservations?id=eq.${input.reservationId}&user_id=eq.${userId}&status=in.(pending,approved)`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,count=exact',
    },
    body: JSON.stringify({
      status: 'cancelled',
    }),
  });

  if (response.ok) {
    const responseBody = await response.text();
    const contentRange = response.headers.get('content-range');
    const isZeroAffectedByRange = contentRange?.trim().endsWith('/0') ?? false;

    if (!responseBody || isZeroAffectedByRange) {
      if (process.env.NODE_ENV === 'development') {
        console.info('my reservation cancel stale', { reservationId: input.reservationId, userId });
      }
      throw new ReservationNoLongerPendingError('Rezervaci už není možné zrušit.');
    }

    try {
      const parsed = JSON.parse(responseBody) as unknown;
      if (Array.isArray(parsed) && parsed.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.info('my reservation cancel stale', { reservationId: input.reservationId, userId });
        }
        throw new ReservationNoLongerPendingError('Rezervaci už není možné zrušit.');
      }
    } catch (parseError) {
      if (parseError instanceof ReservationNoLongerPendingError) {
        throw parseError;
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.info('my reservation cancel success', { reservationId: input.reservationId, userId });
    }

    return;
  }

  const responseBody = await response.text();
  const mappedError = mapReservationWriteError({
    status: response.status,
    statusText: response.statusText,
    endpoint: response.url,
    responseBody,
    operation: 'update',
  });

  if (process.env.NODE_ENV === 'development') {
    console.info('my reservation cancel failed', { reservationId: input.reservationId, userId, status: response.status });
  }

  if (mappedError instanceof ReservationUnauthorizedError) {
    throw new ReservationUnauthorizedError('Nemáte oprávnění zrušit tuto rezervaci.');
  }

  throw mappedError;
}
