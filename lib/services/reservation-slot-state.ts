import type { Reservation } from '../types/domain';

import { isReservationSlotOccupied } from './reservation-occupancy';

export type ReservationSlotType = 'volno' | Reservation['status'];
type SlotSelection = { courtId: number; timeFrom: string | number; timeTo: string | number } | null;

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

export function isReservationSlotSelected(selection: SlotSelection, courtId: number, slotFrom: number, slotTo: number) {
  if (!selection || selection.courtId !== courtId) {
    return false;
  }

  const selectedFrom = normalizeReservationSlotTime(selection.timeFrom);
  const selectedTo = normalizeReservationSlotTime(selection.timeTo);
  if (selectedFrom === null || selectedTo === null) {
    return false;
  }

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
  const isTargetedDebugSlot =
    process.env.NODE_ENV === 'development' &&
    date === '2026-05-21' &&
    courtId === 2 &&
    slotFrom >= 15.5 &&
    slotFrom <= 18;

  const slotStartMinutes = Math.round(slotFrom * 60);
  const slotEndMinutes = Math.round(slotTo * 60);

  if (isTargetedDebugSlot) {
    console.info('reservation grid slot state targeted', {
      selectedDate: date,
      courtId,
      slot: { timeFrom: slotFrom, timeTo: slotTo },
      reservationsCount: reservations.length,
      reservationsSample: reservations.slice(0, 5),
    });
  }

  const reservation = reservations.find((item) => {
    const isSameCourt = item.courtId === courtId;
    const isSameDate = item.date === date;
    const isOccupied = isReservationSlotOccupied(item, slotFrom, slotTo);
    const reservationStartMinutes = Math.round(item.fromHour * 60);
    const reservationEndMinutes = Math.round(item.toHour * 60);
    const isStatusBlocking = item.status === 'cekajici' || item.status === 'potvrzeno';
    const isOverlap = slotStartMinutes < reservationEndMinutes && reservationStartMinutes < slotEndMinutes;

    if (isTargetedDebugSlot) {
      console.info('reservation grid slot compare targeted', {
        selectedDate: date,
        courtId,
        slot: { timeFrom: slotFrom, timeTo: slotTo },
        reservationDate: item.date,
        reservationCourtId: item.courtId,
        reservationTimeFrom: item.fromHour,
        reservationTimeTo: item.toHour,
        reservationStatus: item.status,
        normalizedStartMinutes: reservationStartMinutes,
        normalizedEndMinutes: reservationEndMinutes,
        normalizedSlotStartMinutes: slotStartMinutes,
        normalizedSlotEndMinutes: slotEndMinutes,
        isSameCourt,
        isSameDate,
        isStatusBlocking,
        isOverlap,
        isOccupied,
      });
    }

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
    'border-b border-r p-0 transition last:border-r-0';

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
    return `${baseClass} border-blue-400 bg-blue-200 text-blue-950 ring-2 ring-inset ring-blue-600 hover:bg-blue-200`;
  }

  return `${baseClass} border-slate-200 bg-white text-slate-900 hover:bg-slate-50`;
}


export function buildReservationSlotRenderClassName(slotType: ReservationSlotType, isSelected: boolean, extraClassName?: string) {
  const classNames = [getReservationSlotClassName(slotType, isSelected), extraClassName].filter(Boolean);
  return classNames.join(' ');
}

export function getReservationSlotCellClassName(slotType: ReservationSlotType, isSelected: boolean) {
  const baseClass = 'block h-full w-full p-3 text-left text-xs';

  if (slotType === 'potvrzeno') {
    return `${baseClass} text-emerald-900`;
  }

  if (slotType === 'cekajici') {
    return `${baseClass} text-amber-900`;
  }

  if (slotType === 'blokace') {
    return `${baseClass} text-rose-900`;
  }

  if (isSelected && slotType === 'volno') {
    return `${baseClass} text-blue-900`;
  }

  return `${baseClass} text-slate-900`;
}
