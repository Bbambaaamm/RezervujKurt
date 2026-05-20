import type { Reservation } from '@/lib/types/domain';

function getTimeMinutesFromHour(hourValue: number) {
  return Math.round(hourValue * 60);
}

export function isReservationSlotOccupied(reservation: Reservation, slotFromHour: number, slotToHour: number) {
  if (reservation.status !== 'cekajici' && reservation.status !== 'potvrzeno') {
    return false;
  }

  const reservationFromMinutes = getTimeMinutesFromHour(reservation.fromHour);
  const reservationToMinutes = getTimeMinutesFromHour(reservation.toHour);
  const slotFromMinutes = getTimeMinutesFromHour(slotFromHour);
  const slotToMinutes = getTimeMinutesFromHour(slotToHour);

  return slotFromMinutes < reservationToMinutes && reservationFromMinutes < slotToMinutes;
}
