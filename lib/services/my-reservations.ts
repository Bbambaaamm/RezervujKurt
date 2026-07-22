import type { AuthSession } from '../supabase/auth-client';
import { reportOperationalEvent } from './observability';
import { getPragueReservationStartMs } from './reservation-time';
import { mapReservationWriteError, ReservationNoLongerPendingError, ReservationUnauthorizedError } from './supabase-error-mapping';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type CancelMyReservationInput = {
  session: AuthSession | null;
  reservationId: string;
};

export type ReservationLifecycleStatus = 'waiting_for_payment' | 'pending' | 'approved' | 'cancelled';

type CancelableReservation = {
  reservationDate: string;
  timeFrom: string;
  status: ReservationLifecycleStatus;
};

type MyReservationsFeedbackState = {
  errorMessage: string | null;
  successMessage: string | null;
};

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

export function canCancelReservation(status: ReservationLifecycleStatus): boolean {
  return status === 'pending' || status === 'approved';
}

export function isMyReservationUpcoming(reservation: CancelableReservation, now = new Date()) {
  if (!canCancelReservation(reservation.status)) {
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
    reportOperationalEvent({
      level: 'warn',
      operation: 'reservation.cancel',
      message: 'Zrušení rezervace bylo odmítnuto kvůli chybějící session.',
      metadata: { reservationId: input.reservationId },
    });
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

  reportOperationalEvent({
    level: 'error',
    operation: 'reservation.cancel',
    message: 'Zrušení rezervace uživatelem selhalo.',
    metadata: { reservationId: input.reservationId, userId, status: response.status },
  });

  if (mappedError instanceof ReservationUnauthorizedError) {
    throw new ReservationUnauthorizedError('Nemáte oprávnění zrušit tuto rezervaci.');
  }

  throw mappedError;
}
