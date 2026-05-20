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
  const reservation = reservations.find(
    (item) => item.courtId === courtId && item.date === date && isReservationSlotOccupied(item, slotFrom, slotTo),
  );

  if (!reservation) {
    return { type: 'volno' as const, label: 'Volno', isOccupied: false };
  }

  return {
    type: reservation.status as ReservationSlotType,
    label: reservation.status === 'cekajici' ? 'Čeká na schválení' : 'Obsazeno',
    isOccupied: true,
  };
}

export function getReservationSlotClassName(slotType: ReservationSlotType, isSelected: boolean) {
  const statusClasses: Record<ReservationSlotType, string> = {
    volno: 'bg-white',
    potvrzeno: 'bg-emerald-200 text-emerald-900',
    cekajici: 'bg-amber-200 text-amber-900',
    blokace: 'bg-rose-200 text-rose-900',
    zruseno: 'bg-white',
    'zamítnuto': 'bg-white',
  };

  const selectedClass = isSelected ? 'ring-2 ring-inset ring-blue-500' : '';
  return `border-b border-r border-slate-200 p-3 text-left text-xs transition hover:brightness-95 last:border-r-0 ${statusClasses[slotType]} ${selectedClass}`;
}
