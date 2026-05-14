import { supabaseInsert, SupabaseRequestError } from '@/lib/supabase/client';

type CreateReservationInput = {
  courtId: number;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
  note?: string;
  accessToken: string;
};

type ReservationInsertRow = {
  id: string;
};

export class ReservationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReservationValidationError';
  }
}

export class ReservationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReservationConflictError';
  }
}

function isTimeValue(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

export async function createPendingReservation(input: CreateReservationInput) {
  if (!input.accessToken.trim()) {
    throw new ReservationValidationError('Pro vytvoření rezervace se nejdříve přihlaste.');
  }

  if (!input.reservationDate) {
    throw new ReservationValidationError('Datum rezervace je povinné.');
  }

  if (!isTimeValue(input.timeFrom) || !isTimeValue(input.timeTo)) {
    throw new ReservationValidationError('Čas od a čas do musí být ve formátu HH:MM.');
  }

  if (input.timeFrom >= input.timeTo) {
    throw new ReservationValidationError('Čas od musí být menší než čas do.');
  }

  try {
    const inserted = await supabaseInsert(
      'reservations?select=id',
      {
        court_id: input.courtId,
        reservation_date: input.reservationDate,
        time_from: input.timeFrom,
        time_to: input.timeTo,
        note: input.note?.trim() ? input.note.trim() : null,
        status: 'pending',
      },
      { accessToken: input.accessToken },
    );

    return inserted[0];
  } catch (error) {
    if (error instanceof SupabaseRequestError) {
      if (error.status === 409 || error.responseBody.includes('reservations_no_overlap_excl')) {
        throw new ReservationConflictError('Vybraný časový slot je už obsazený. Zvolte prosím jiný termín.');
      }

      if (error.status === 401 || error.status === 403) {
        throw new ReservationValidationError('Rezervaci lze vytvořit jen jako přihlášený uživatel.');
      }
    }

    throw error;
  }
}
