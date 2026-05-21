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
  const baseClass = 'border-b border-r border-slate-200 p-3 text-left text-xs transition last:border-r-0';

  const statusClasses: Record<ReservationSlotType, string> = {
    volno: 'bg-white text-slate-900 hover:bg-slate-50',
    potvrzeno: 'bg-emerald-300 text-emerald-950',
    cekajici: 'bg-amber-300 text-amber-950',
    blokace: 'bg-rose-300 text-rose-950',
    zruseno: 'bg-white text-slate-900 hover:bg-slate-50',
    'zamítnuto': 'bg-white text-slate-900 hover:bg-slate-50',
  };

  const selectedClass = isSelected && slotType === 'volno' ? 'ring-2 ring-inset ring-blue-600 bg-blue-100 text-blue-950' : '';
  return `${baseClass} ${statusClasses[slotType]} ${selectedClass}`;
}
