import type { Court, Reservation, ReservationStatus } from '@/lib/types/domain';
import { supabaseSelect } from '@/lib/supabase/client';

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

type PendingReservationRow = {
  id: string;
  reservation_date: string;
  time_from: string;
  time_to: string;
  status: 'pending';
  court_id: number;
  user_id: string;
  profiles: {
    full_name: string | null;
  } | null;
  courts: {
    name: string;
  } | null;
};

export type PendingReservationOverview = {
  id: string;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
  courtName: string;
  userId: string;
  userDisplayName: string | null;
  status: 'pending';
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

function mapPendingReservation(row: PendingReservationRow): PendingReservationOverview {
  return {
    id: row.id,
    reservationDate: row.reservation_date,
    timeFrom: row.time_from,
    timeTo: row.time_to,
    courtName: row.courts?.name ?? `Kurt ${row.court_id}`,
    userId: row.user_id,
    userDisplayName: row.profiles?.full_name ?? null,
    status: row.status,
  };
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

export async function getPendingReservationsReadOnly() {
  const rows = await supabaseSelect<PendingReservationRow>(
    'reservations?select=id,reservation_date,time_from,time_to,status,court_id,user_id,profiles:profiles(full_name),courts:courts(name)&status=eq.pending&order=reservation_date.asc,time_from.asc',
  );

  return rows.map(mapPendingReservation);
}
