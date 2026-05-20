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

function toReservationStartDate(reservationDate: string, timeFrom: string) {
  return new Date(`${reservationDate}T${timeFrom}`);
}

export function isMyReservationCancelable(reservation: CancelableReservation, now = new Date()) {
  if (reservation.status !== 'pending' && reservation.status !== 'approved') {
    return false;
  }

  const reservationStart = toReservationStartDate(reservation.reservationDate, reservation.timeFrom);
  if (Number.isNaN(reservationStart.getTime())) {
    return false;
  }

  return reservationStart.getTime() > now.getTime();
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
