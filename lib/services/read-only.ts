import type { Court, Reservation, ReservationStatus } from '@/lib/types/domain';
import { SupabaseRequestError, supabaseSelect } from '@/lib/supabase/client';

type CourtRow = {
  id: number;
  name: string;
  surface: string;
  is_active: boolean;
};

type ReservationRow = {
  id: string;
  court_id: number;
  reservation_date: string;
  time_from: string;
  time_to: string;
  status: 'pending' | 'approved' | 'cancelled';
  note: string | null;
  created_at: string;
};

type ReservationOverviewRow = {
  id: string;
  reservation_date: string;
  time_from: string;
  time_to: string;
  created_at: string | null;
  status: 'pending' | 'approved' | 'cancelled';
  court_id: number;
  user_id: string;
};

type PendingCourtRow = {
  id: number;
  name: string;
};

type PendingProfileRow = {
  id: string;
  full_name: string | null;
};

export type ReservationOverview = {
  id: string;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
  createdAt: string | null;
  courtName: string;
  userId: string;
  userDisplayName: string | null;
  status: 'pending' | 'approved' | 'cancelled';
};

function mapStatus(status: ReservationRow['status']): ReservationStatus {
  if (status === 'pending') return 'cekajici';
  if (status === 'approved') return 'potvrzeno';
  return 'blokace';
}

function parseHour(timeValue: string) {
  const [hours, minutes] = timeValue.split(':').map(Number);
  return hours + minutes / 60;
}

function mapCourt(row: CourtRow): Court {
  return {
    id: row.id,
    name: row.name,
    surface: 'antuka',
  };
}

function mapReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    courtId: row.court_id,
    date: row.reservation_date,
    fromHour: parseHour(row.time_from),
    toHour: parseHour(row.time_to),
    status: mapStatus(row.status),
    userType: 'clen',
    name: 'Rezervace',
    email: '',
    phone: '',
    note: row.note ?? undefined,
    paymentMethod: 'online_placeholder',
    createdAt: row.created_at,
  };
}

function mapReservationOverview(row: ReservationOverviewRow): ReservationOverview {
  return {
    id: row.id,
    reservationDate: row.reservation_date,
    timeFrom: row.time_from,
    timeTo: row.time_to,
    createdAt: row.created_at,
    courtName: `Kurt ${row.court_id}`,
    userId: row.user_id,
    userDisplayName: null,
    status: row.status,
  };
}

function logSupabaseRequestFailure(error: unknown) {
  if (error instanceof SupabaseRequestError) {
    console.error('Admin read-only request failed.', {
      endpoint: error.endpoint,
      status: error.status,
      responseBody: error.responseBody,
    });
    return;
  }

  console.error('Admin read-only request failed.', {
    error,
  });
}

export async function getCourtsReadOnly() {
  const rows = await supabaseSelect<CourtRow>('courts?select=id,name,surface,is_active&is_active=eq.true&order=id.asc');
  return rows.map(mapCourt);
}

export async function getReservationsReadOnly(date: string) {
  const rows = await supabaseSelect<ReservationRow>(
    `reservations?select=id,court_id,reservation_date,time_from,time_to,status,note,created_at&reservation_date=eq.${date}`,
  );

  return rows.map(mapReservation);
}

async function getReservationsOverviewByEndpoint(endpoint: string) {
  try {
    console.info('Admin reservation overview request.', { endpoint });
    const reservations = await supabaseSelect<ReservationOverviewRow>(endpoint);

    const courtIds = [...new Set(reservations.map((row) => row.court_id))];
    const userIds = [...new Set(reservations.map((row) => row.user_id))];

    const courtRows = courtIds.length
      ? await (async () => {
          const courtsEndpoint = `courts?select=id,name&id=in.(${courtIds.join(',')})`;
          console.info('Admin courts lookup request.', { endpoint: courtsEndpoint });
          return supabaseSelect<PendingCourtRow>(courtsEndpoint);
        })()
      : [];

    const profileRows = userIds.length
      ? await (async () => {
          const quotedUserIds = userIds.map((id) => `"${id}"`).join(',');
          const profilesEndpoint = `profiles?select=id,full_name&id=in.(${quotedUserIds})`;
          console.info('Admin profiles lookup request.', { endpoint: profilesEndpoint });
          return supabaseSelect<PendingProfileRow>(profilesEndpoint);
        })()
      : [];

    const courtsById = new Map(courtRows.map((row) => [row.id, row.name]));
    const profilesById = new Map(profileRows.map((row) => [row.id, row.full_name]));

    return reservations.map((row) => {
      const baseReservation = mapReservationOverview(row);
      const courtName = courtsById.get(row.court_id) ?? `${row.court_id}`;
      const fullName = profilesById.get(row.user_id) ?? null;

      return {
        ...baseReservation,
        courtName,
        userDisplayName: fullName ?? row.user_id,
      };
    });
  } catch (error) {
    logSupabaseRequestFailure(error);
    throw error;
  }
}


export async function getPendingReservationsReadOnly() {
  const reservationsEndpoint =
    'reservations?select=id,reservation_date,time_from,time_to,created_at,status,court_id,user_id&status=eq.pending&order=created_at.asc.nullslast,reservation_date.asc,time_from.asc';
  const loadedReservations = await getReservationsOverviewByEndpoint(reservationsEndpoint);

  if (process.env.NODE_ENV === 'development') {
    console.info('admin pending ordered by oldest first', { count: loadedReservations.length });
  }

  return loadedReservations;
}

export async function getRecentReservationsReadOnly(limit = 20) {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 20;
  const reservationsEndpoint =
    `reservations?select=id,reservation_date,time_from,time_to,created_at,status,court_id,user_id&order=created_at.desc&limit=${safeLimit}`;
  const loadedReservations = await getReservationsOverviewByEndpoint(reservationsEndpoint);

  if (process.env.NODE_ENV === 'development') {
    console.info('admin reservation history loaded', { count: loadedReservations.length, limit: safeLimit });
  }

  return loadedReservations;
}
