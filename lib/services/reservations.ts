import { SupabaseRequestError } from '@/lib/supabase/client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export class ReservationConflictError extends Error {}
export class ReservationUnauthorizedError extends Error {}

type CreateReservationInput = {
  accessToken: string;
  userId: string;
  courtId: number;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
  note?: string;
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

  if (response.status === 401 || response.status === 403) {
    throw new ReservationUnauthorizedError('Nemáte oprávnění k vytvoření rezervace.');
  }

  if (response.status === 409 || responseBody.includes('reservations_no_overlap_excl') || responseBody.includes('23P01')) {
    throw new ReservationConflictError('Termín je již obsazen nebo koliduje s jinou rezervací.');
  }

  throw new SupabaseRequestError(
    `Vytvoření rezervace selhalo: ${response.status} ${response.statusText}`,
    response.url,
    response.status,
    responseBody,
  );
}
