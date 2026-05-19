import { mapReservationWriteError } from '@/lib/services/supabase-error-mapping';

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
