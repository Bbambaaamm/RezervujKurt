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
