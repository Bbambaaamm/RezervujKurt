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

type ReservationAvailabilityCheckInput = {
  courtId: number;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
};

type ReservationAvailabilityRow = {
  time_from: string;
  time_to: string;
  status: 'pending' | 'approved' | 'cancelled';
};

function timeStringToMinutes(value: string): number {
  const [hoursPart, minutesPart] = value.split(':');
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);

  return (hours * 60) + minutes;
}

export function doesReservationIntervalOverlap(
  left: { timeFrom: string; timeTo: string },
  right: { timeFrom: string; timeTo: string },
): boolean {
  const leftFrom = timeStringToMinutes(left.timeFrom);
  const leftTo = timeStringToMinutes(left.timeTo);
  const rightFrom = timeStringToMinutes(right.timeFrom);
  const rightTo = timeStringToMinutes(right.timeTo);

  return leftFrom < rightTo && rightFrom < leftTo;
}

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

export async function checkReservationSlotAvailability(input: ReservationAvailabilityCheckInput): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Chybí konfigurace Supabase proměnných prostředí.');
  }

  const endpoint = new URL(`${supabaseUrl}/rest/v1/reservation_public_occupancy`);
  endpoint.searchParams.set('select', 'court_id,reservation_date,time_from,time_to,status');
  endpoint.searchParams.set('court_id', `eq.${input.courtId}`);
  endpoint.searchParams.set('reservation_date', `eq.${input.reservationDate}`);
  endpoint.searchParams.set('status', 'in.(pending,approved)');

  if (process.env.NODE_ENV === 'development') {
    console.info('public occupancy request started', { courtId: input.courtId, reservationDate: input.reservationDate });
  }

  const response = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const responseBody = await response.text();
    if (process.env.NODE_ENV === 'development') {
      console.info('public occupancy request failed', { status: response.status, reservationDate: input.reservationDate });
    }
    throw mapReservationWriteError({
      status: response.status,
      statusText: response.statusText,
      endpoint: response.url,
      responseBody,
    });
  }

  const responseBody = await response.text();
  if (!responseBody) {
    return true;
  }

  const rows = JSON.parse(responseBody) as ReservationAvailabilityRow[];

  if (process.env.NODE_ENV === 'development') {
    console.info('public occupancy loaded', { courtId: input.courtId, reservationDate: input.reservationDate, count: rows.length });
  }

  const hasConflict = rows.some((row) => doesReservationIntervalOverlap(
    { timeFrom: input.timeFrom, timeTo: input.timeTo },
    { timeFrom: row.time_from, timeTo: row.time_to },
  ));

  return !hasConflict;
}
