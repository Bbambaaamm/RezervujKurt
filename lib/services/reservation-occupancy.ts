import type { Reservation } from '@/lib/types/domain';

const OCCUPYING_DOMAIN_STATUSES: Reservation['status'][] = [
  'ceka_na_platbu',
  'cekajici',
  'potvrzeno',
  'blokace',
];

function getTimeMinutesFromHour(hourValue: number) {
  return Math.round(hourValue * 60);
}

export function isReservationSlotOccupied(reservation: Reservation, slotFromHour: number, slotToHour: number) {
  if (!OCCUPYING_DOMAIN_STATUSES.includes(reservation.status)) {
    return false;
  }

  const reservationFromMinutes = getTimeMinutesFromHour(reservation.fromHour);
  const reservationToMinutes = getTimeMinutesFromHour(reservation.toHour);
  const slotFromMinutes = getTimeMinutesFromHour(slotFromHour);
  const slotToMinutes = getTimeMinutesFromHour(slotToHour);

  return slotFromMinutes < reservationToMinutes && reservationFromMinutes < slotToMinutes;
}
