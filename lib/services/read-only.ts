import type { Court, Reservation, ReservationStatus } from '@/lib/types/domain';
import type { AuthSession } from '../supabase/auth-client';
import { ReservationUnauthorizedError } from './supabase-error-mapping';
import { SupabaseRequestError, supabaseSelect, supabaseSelectWithAccessToken } from '@/lib/supabase/client';

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
  email?: string | null;
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
  userEmail?: string | null;
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
    userEmail: null,
    status: row.status,
  };
}

function logSupabaseRequestFailure(error: unknown) {
  if (error instanceof SupabaseRequestError) {
    console.error('admin reservations read failed', {
      endpoint: error.endpoint,
      status: error.status,
      responseBody: error.responseBody,
    });
    return;
  }

  console.error('admin reservations read failed', {
    error,
  });
}

export async function getCourtsReadOnly() {
  const rows = await supabaseSelect<CourtRow>('courts?select=id,name,surface,is_active&is_active=eq.true&order=id.asc');
  return rows.map(mapCourt);
}

export async function getReservationsReadOnly(date: string) {
  const endpoint = `reservations?select=id,court_id,reservation_date,time_from,time_to,status,created_at&reservation_date=eq.${date}&status=in.(pending,approved)&order=time_from.asc`;
  const rows = await supabaseSelect<ReservationRow>(endpoint);
  if (process.env.NODE_ENV === 'development') {
    console.info('public reservations raw count', { count: rows.length, date });
    console.info('public reservations sample', rows.slice(0, 3));
  }

  const mappedRows = rows.map(mapReservation);
  if (process.env.NODE_ENV === 'development') {
    console.info('public reservations mapped count', { count: mappedRows.length, date });
  }

  return mappedRows;
}

async function getReservationsOverviewByEndpoint(endpoint: string, accessToken: string) {
  try {
    const reservations = await supabaseSelectWithAccessToken<ReservationOverviewRow>(endpoint, accessToken);

    const courtIds = [...new Set(reservations.map((row) => row.court_id))];
    const userIds = [...new Set(reservations.map((row) => row.user_id))];

    const courtRows = courtIds.length
      ? await (async () => {
          const courtsEndpoint = `courts?select=id,name&id=in.(${courtIds.join(',')})`;
          console.info('Admin courts lookup request.', { endpoint: courtsEndpoint });
          return supabaseSelectWithAccessToken<PendingCourtRow>(courtsEndpoint, accessToken);
        })()
      : [];

    const profileRows = userIds.length
      ? await (async () => {
          const quotedUserIds = userIds.map((id) => `"${id}"`).join(',');
          const profilesEndpoint = `profiles?select=id,full_name,email&id=in.(${quotedUserIds})`;
          console.info('Admin profiles lookup request.', { endpoint: profilesEndpoint });
          return supabaseSelectWithAccessToken<PendingProfileRow>(profilesEndpoint, accessToken);
        })()
      : [];

    const courtsById = new Map(courtRows.map((row) => [row.id, row.name]));
    const profilesById = new Map(profileRows.map((row) => [row.id, row]));

    return reservations.map((row) => {
      const baseReservation = mapReservationOverview(row);
      const courtName = courtsById.get(row.court_id) ?? `${row.court_id}`;
      const profileRow = profilesById.get(row.user_id);
      const fullName = profileRow?.full_name ?? null;
      const email = profileRow?.email ?? null;

      return {
        ...baseReservation,
        courtName,
        userDisplayName: fullName,
        userEmail: email,
      };
    });
  } catch (error) {
    logSupabaseRequestFailure(error);
    throw error;
  }
}

export async function getMyReservationsReadOnly(session: AuthSession | null) {
  if (process.env.NODE_ENV === 'development') {
    console.info('my reservations loading');
  }

  if (!session?.user?.id || !session.access_token) {
    if (process.env.NODE_ENV === 'development') {
      console.info('my reservations unauthorized');
    }
    throw new ReservationUnauthorizedError('Pro zobrazení rezervací je potřeba přihlášení.');
  }

  const endpoint = `reservations?select=id,reservation_date,time_from,time_to,created_at,status,court_id,user_id&user_id=eq.${session.user.id}&order=reservation_date.asc,time_from.asc`;
  const rows = await supabaseSelectWithAccessToken<ReservationOverviewRow>(endpoint, session.access_token);

  if (process.env.NODE_ENV === 'development') {
    console.info('my reservations loaded', { count: rows.length });
  }

  return rows.map(mapReservationOverview);
}

export async function getPendingReservationsReadOnlyWithSession(accessToken: string) {
  if (process.env.NODE_ENV === 'development') {
    console.info('admin pending reservations request started');
  }

  const reservationsEndpoint =
    'reservations?select=id,reservation_date,time_from,time_to,created_at,status,court_id,user_id&status=eq.pending&order=created_at.asc.nullslast,reservation_date.asc,time_from.asc';
  const loadedReservations = await getReservationsOverviewByEndpoint(reservationsEndpoint, accessToken);

  if (process.env.NODE_ENV === 'development') {
    console.info('admin pending reservations loaded', { count: loadedReservations.length });
  }

  return loadedReservations;
}

export async function getRecentReservationsReadOnlyWithSession(accessToken: string, limit = 20) {
  if (process.env.NODE_ENV === 'development') {
    console.info('admin recent reservations request started');
  }

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 20;
  const reservationsEndpoint =
    `reservations?select=id,reservation_date,time_from,time_to,created_at,status,court_id,user_id&order=created_at.desc&limit=${safeLimit}`;
  const loadedReservations = await getReservationsOverviewByEndpoint(reservationsEndpoint, accessToken);

  if (process.env.NODE_ENV === 'development') {
    console.info('admin recent reservations loaded', { count: loadedReservations.length, limit: safeLimit });
  }

  return loadedReservations;
}
