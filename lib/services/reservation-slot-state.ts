import type { Reservation } from '../types/domain';

import { isReservationSlotOccupied } from './reservation-occupancy';

export type ReservationSlotType = 'volno' | Reservation['status'];
export type ReservationSlotSelectionPosition = 'single' | 'start' | 'middle' | 'end';
type SlotSelection =
  | { courtId: number | string; timeFrom?: string | number; timeTo?: string | number; from?: string | number; to?: string | number }
  | null;

export function normalizeReservationSlotTime(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = value.trim().replace(',', '.');

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parts = normalized.split(':');
  if (parts.length < 2) {
    return null;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours + minutes / 60;
}


function normalizeSelection(selection: Exclude<SlotSelection, null>) {
  const normalizedCourtId = typeof selection.courtId === 'string' ? Number(selection.courtId) : selection.courtId;
  if (!Number.isFinite(normalizedCourtId)) {
    return null;
  }

  const rawFrom = selection.timeFrom ?? selection.from;
  const rawTo = selection.timeTo ?? selection.to;
  if (rawFrom === undefined || rawTo === undefined) {
    return null;
  }

  const selectedFrom = normalizeReservationSlotTime(rawFrom);
  const selectedTo = normalizeReservationSlotTime(rawTo);
  if (selectedFrom === null || selectedTo === null) {
    return null;
  }

  return { courtId: normalizedCourtId, selectedFrom, selectedTo };
}

export function isReservationSlotSelected(selection: SlotSelection, courtId: number, slotFrom: number, slotTo: number) {
  if (!selection) {
    return false;
  }

  const normalizedSelection = normalizeSelection(selection);
  if (!normalizedSelection || normalizedSelection.courtId !== courtId) {
    return false;
  }

  const { selectedFrom, selectedTo } = normalizedSelection;

  const rangeFrom = Math.min(selectedFrom, selectedTo);
  const rangeTo = Math.max(selectedFrom, selectedTo);
  const slotStartMinutes = Math.round(slotFrom * 60);
  const slotEndMinutes = Math.round(slotTo * 60);
  const selectedFromMinutes = Math.round(rangeFrom * 60);
  const selectedToMinutes = Math.round(rangeTo * 60);

  return slotStartMinutes >= selectedFromMinutes && slotEndMinutes <= selectedToMinutes;
}

export function getReservationSlotState(
  reservations: Reservation[],
  courtId: number,
  date: string,
  slotFrom: number,
  slotTo: number,
) {
  const slotStartMinutes = Math.round(slotFrom * 60);
  const slotEndMinutes = Math.round(slotTo * 60);

  const reservation = reservations.find((item) => {
    const isSameCourt = item.courtId === courtId;
    const isSameDate = item.date === date;
    const isOccupied = isReservationSlotOccupied(item, slotFrom, slotTo);
    const reservationStartMinutes = Math.round(item.fromHour * 60);
    const reservationEndMinutes = Math.round(item.toHour * 60);
    const isStatusBlocking = item.status === 'cekajici' || item.status === 'potvrzeno';
    const isOverlap = slotStartMinutes < reservationEndMinutes && reservationStartMinutes < slotEndMinutes;
    return isSameCourt && isSameDate && isOccupied;
  });

  if (!reservation) {
    return { type: 'volno' as const, label: 'Volno', isOccupied: false };
  }
  return {
    type: reservation.status as ReservationSlotType,
    label: reservation.status === 'cekajici' ? 'Čeká na schválení' : 'Obsazeno',
    isOccupied: true,
  };
}

export function getReservationSlotClassName(
  slotType: ReservationSlotType,
  isSelected: boolean,
  selectedPosition: ReservationSlotSelectionPosition = 'single',
) {
  const baseClass = 'relative border-b border-r border-slate-200 p-0 transition-colors duration-150 last:border-r-0';

  if (slotType === 'potvrzeno') {
    return `${baseClass} border-rose-300 bg-rose-50 text-rose-900`;
  }

  if (slotType === 'cekajici') {
    return `${baseClass} border-amber-300 bg-amber-50 text-amber-900`;
  }

  if (slotType === 'blokace') {
    return `${baseClass} border-rose-300 bg-rose-50 text-rose-900`;
  }

  if (isSelected && slotType === 'volno') {
    const radiusClassName = selectedPosition === 'single'
      ? 'rounded-xl'
      : selectedPosition === 'start'
        ? 'rounded-t-xl rounded-b-none'
        : selectedPosition === 'end'
          ? 'rounded-b-xl rounded-t-none'
          : 'rounded-none';
    return `${baseClass} z-10 border-blue-700 bg-blue-600 text-white ring-1 ring-inset ring-blue-300 ${radiusClassName}`;
  }

  return `${baseClass} bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50`;
}


export function buildReservationSlotRenderClassName(
  slotType: ReservationSlotType,
  isSelected: boolean,
  selectedPosition: ReservationSlotSelectionPosition = 'single',
  extraClassName?: string,
) {
  const classNames = [getReservationSlotClassName(slotType, isSelected, selectedPosition), extraClassName].filter(Boolean);
  return classNames.join(' ');
}

export function getReservationSlotCellClassName(slotType: ReservationSlotType, isSelected: boolean) {
  const baseClass = 'block min-h-[48px] w-full px-2.5 py-1.5 text-left';

  if (slotType === 'potvrzeno') {
    return `${baseClass} text-rose-900`;
  }

  if (slotType === 'cekajici') {
    return `${baseClass} text-amber-900`;
  }

  if (slotType === 'blokace') {
    return `${baseClass} text-rose-900`;
  }

  if (isSelected && slotType === 'volno') {
    return `${baseClass} text-white`;
  }

  return `${baseClass} text-slate-700`;
}
