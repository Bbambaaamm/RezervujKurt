import type { Reservation } from '../types/domain';

import { isReservationSlotOccupied } from './reservation-occupancy';

export type ReservationSlotType = 'volno' | Reservation['status'];
export type ReservationSlotSelectionPosition = 'single' | 'start' | 'middle' | 'end';
type SlotSelection =
  | { courtId: number | string; timeFrom?: string | number; timeTo?: string | number; from?: string | number; to?: string | number }
  | null;

export function normalizeReservationSlotTime(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = value.trim().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parts = normalized.split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours + minutes / 60;
}

function normalizeSelection(selection: Exclude<SlotSelection, null>) {
  const normalizedCourtId = typeof selection.courtId === 'string' ? Number(selection.courtId) : selection.courtId;
  if (!Number.isFinite(normalizedCourtId)) return null;
  const rawFrom = selection.timeFrom ?? selection.from;
  const rawTo = selection.timeTo ?? selection.to;
  if (rawFrom === undefined || rawTo === undefined) return null;
  const selectedFrom = normalizeReservationSlotTime(rawFrom);
  const selectedTo = normalizeReservationSlotTime(rawTo);
  if (selectedFrom === null || selectedTo === null) return null;
  return { courtId: normalizedCourtId, selectedFrom, selectedTo };
}

export function isReservationSlotSelected(selection: SlotSelection, courtId: number, slotFrom: number, slotTo: number) {
  if (!selection) return false;
  const normalizedSelection = normalizeSelection(selection);
  if (!normalizedSelection || normalizedSelection.courtId !== courtId) return false;

  const rangeFrom = Math.min(normalizedSelection.selectedFrom, normalizedSelection.selectedTo);
  const rangeTo = Math.max(normalizedSelection.selectedFrom, normalizedSelection.selectedTo);

  return Math.round(slotFrom * 60) >= Math.round(rangeFrom * 60) && Math.round(slotTo * 60) <= Math.round(rangeTo * 60);
}

export function getReservationSlotState(reservations: Reservation[], courtId: number, date: string, slotFrom: number, slotTo: number) {
  const reservation = reservations.find((item) => item.courtId === courtId && item.date === date && isReservationSlotOccupied(item, slotFrom, slotTo));

  if (!reservation) return { type: 'volno' as const, label: 'Volno', isOccupied: false };
  return { type: reservation.status as ReservationSlotType, label: reservation.status === 'cekajici' ? 'Čeká na schválení' : 'Obsazeno', isOccupied: true };
}

export function getReservationSlotClassName(slotType: ReservationSlotType, isSelected: boolean, selectedPosition: ReservationSlotSelectionPosition = 'single') {
  const baseClass = 'relative h-11 overflow-hidden border-r border-b border-slate-100 p-0 transition-colors duration-150 last:border-r-0';

  if (isSelected && slotType === 'volno') {
    const selectionShape =
      selectedPosition === 'single'
        ? 'rounded-xl border-blue-500 ring-1 ring-inset ring-blue-300/50 shadow-sm'
        : selectedPosition === 'start'
          ? 'rounded-t-xl border-blue-500 border-b-transparent ring-1 ring-inset ring-blue-300/50 shadow-sm'
          : selectedPosition === 'end'
            ? 'rounded-b-xl border-blue-500 border-t-transparent ring-1 ring-inset ring-blue-300/50 shadow-sm'
            : 'rounded-none border-blue-500 border-y-transparent ring-1 ring-inset ring-blue-300/50 shadow-sm';

    return `${baseClass} z-10 bg-blue-500 text-white ${selectionShape}`;
  }

  if (slotType === 'potvrzeno' || slotType === 'blokace') return `${baseClass} bg-rose-50 text-rose-900 border-rose-200`;
  if (slotType === 'cekajici') return `${baseClass} bg-amber-50 text-amber-900 border-amber-300`;

  return `${baseClass} bg-white text-slate-700 hover:bg-sky-50`;
}

export function buildReservationSlotRenderClassName(slotType: ReservationSlotType, isSelected: boolean, selectedPosition: ReservationSlotSelectionPosition = 'single', extraClassName?: string) {
  return [getReservationSlotClassName(slotType, isSelected, selectedPosition), extraClassName].filter(Boolean).join(' ');
}


export function getReservationSlotCellClassName(slotType: ReservationSlotType, isSelected: boolean) {
  const baseClass = 'block min-h-[48px] w-full px-3 py-1.5 text-left';
  if (isSelected && slotType === 'volno') return `${baseClass} text-white`;
  if (slotType === 'potvrzeno' || slotType === 'blokace') return `${baseClass} text-rose-900`;
  if (slotType === 'cekajici') return `${baseClass} text-amber-900`;
  return `${baseClass} text-slate-700`;
}
