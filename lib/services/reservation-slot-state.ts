import type { Reservation } from '../types/domain';

import { isReservationSlotOccupied } from './reservation-occupancy';

export type ReservationSlotType = 'volno' | Reservation['status'];

export function getReservationSlotState(
  reservations: Reservation[],
  courtId: number,
  date: string,
  slotFrom: number,
  slotTo: number,
) {
  const reservation = reservations.find((item) => {
    const isSameCourt = item.courtId === courtId;
    const isSameDate = item.date === date;
    const isOccupied = isReservationSlotOccupied(item, slotFrom, slotTo);

    if (process.env.NODE_ENV === 'development') {
      console.info('slot reservation compare', {
        slot: { courtId, date, slotFrom, slotTo },
        reservation: {
          id: item.id,
          courtId: item.courtId,
          date: item.date,
          fromHour: item.fromHour,
          toHour: item.toHour,
          status: item.status,
        },
        result: { isSameCourt, isSameDate, isOccupied },
      });
    }

    return isSameCourt && isSameDate && isOccupied;
  });

  if (!reservation) {
    if (process.env.NODE_ENV === 'development') {
      console.info('slot final status', { courtId, date, slotFrom, slotTo, status: 'volno' });
    }

    return { type: 'volno' as const, label: 'Volno', isOccupied: false };
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('slot final status', { courtId, date, slotFrom, slotTo, status: reservation.status });
  }

  return {
    type: reservation.status as ReservationSlotType,
    label: reservation.status === 'cekajici' ? 'Čeká na schválení' : 'Obsazeno',
    isOccupied: true,
  };
}

export function getReservationSlotClassName(slotType: ReservationSlotType, isSelected: boolean) {
  const baseClass =
    'h-full w-full border-b border-r p-3 text-left text-xs transition last:border-r-0';

  if (slotType === 'potvrzeno') {
    return `${baseClass} border-emerald-300 bg-emerald-100 text-emerald-900`;
  }

  if (slotType === 'cekajici') {
    return `${baseClass} border-amber-300 bg-amber-100 text-amber-900`;
  }

  if (slotType === 'blokace') {
    return `${baseClass} border-rose-300 bg-rose-100 text-rose-900`;
  }

  if (isSelected && slotType === 'volno') {
    return `${baseClass} border-blue-300 bg-blue-100 text-blue-900 ring-2 ring-inset ring-blue-600 hover:bg-blue-100`;
  }

  return `${baseClass} border-slate-200 bg-white text-slate-900 hover:bg-slate-50`;
}
