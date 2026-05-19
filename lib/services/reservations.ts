import { mapReservationWriteError, ReservationNoLongerPendingError } from './supabase-error-mapping';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type CreateReservationInput = {
  accessToken: string;
  userId: string;
  courtId: number;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
  note?: string;
};

type UpdateReservationStatusInput = {
  accessToken: string;
  reservationId: string;
  status: 'approved' | 'cancelled';
};

export async function createReservation(input: CreateReservationInput): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Chybí konfigurace Supabase proměnných prostředí.');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/reservations`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: input.userId,
      court_id: input.courtId,
      reservation_date: input.reservationDate,
      time_from: input.timeFrom,
      time_to: input.timeTo,
      status: 'pending',
      note: input.note?.trim() || null,
    }),
  });

  if (response.ok) {
    return;
  }

  const responseBody = await response.text();

  throw mapReservationWriteError({
    status: response.status,
    statusText: response.statusText,
    endpoint: response.url,
    responseBody,
  });
}

export async function updateReservationStatus(input: UpdateReservationStatusInput): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Chybí konfigurace Supabase proměnných prostředí.');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/reservations?id=eq.${input.reservationId}&status=eq.pending`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,count=exact',
    },
    body: JSON.stringify({
      status: input.status,
    }),
  });

  if (response.ok) {
    const responseBody = await response.text();
    const contentRange = response.headers.get('content-range');
    const isZeroAffectedByRange = contentRange?.trim().endsWith('/0') ?? false;

    if (!responseBody) {
      if (isZeroAffectedByRange) {
        throw new ReservationNoLongerPendingError('Rezervace už není ve stavu pending.');
      }
      return;
    }

    try {
      const parsed = JSON.parse(responseBody) as unknown;
      if (Array.isArray(parsed) && parsed.length === 0) {
        throw new ReservationNoLongerPendingError('Rezervace už není ve stavu pending.');
      }
    } catch (parseError) {
      if (parseError instanceof ReservationNoLongerPendingError) {
        throw parseError;
      }
      // Pokud backend nevrátí JSON pole, neblokujeme úspěšný update.
    }

    if (isZeroAffectedByRange) {
      throw new ReservationNoLongerPendingError('Rezervace už není ve stavu pending.');
    }

    return;
  }

  const responseBody = await response.text();

  throw mapReservationWriteError({
    status: response.status,
    statusText: response.statusText,
    endpoint: response.url,
    responseBody,
    operation: 'update',
  });
}
