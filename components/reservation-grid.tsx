'use client';

import { useMemo, useState } from 'react';

import { courts as fallbackCourts, mockReservations as fallbackReservations, openHours } from '@/lib/mockData';
import type { Court, Reservation } from '@/lib/types/domain';
import { buildReservationSlotRenderClassName, getReservationSlotCellClassName, getReservationSlotState, isReservationSlotSelected, type ReservationSlotSelectionPosition } from '@/lib/services/reservation-slot-state';


type ReservationSelection = { courtId: number; timeFrom: string; timeTo: string };

type ReservationGridProps = {
  selectedDate: string;
  courts?: Court[];
  reservations?: Reservation[];
  selection?: ReservationSelection | null;
  onSelectionChange?: (selection: ReservationSelection | null) => void;
};

type SlotKey = `${number}-${number}`;

type DragState = {
  courtId: number;
  startTime: number;
  endTime: number;
} | null;

function formatTimeLabel(time: number) {
  const hour = Math.floor(time);
  const minutes = time % 1 === 0 ? '00' : '30';
  return `${hour}:${minutes}`;
}

function normalizeRange(start: number, end: number) {
  return { from: Math.min(start, end), to: Math.max(start, end) + 0.5 };
}

export function ReservationGrid({ selectedDate, courts = fallbackCourts, reservations = fallbackReservations, selection = null, onSelectionChange }: ReservationGridProps) {
  const halfHourSlots = useMemo(
    () => Array.from({ length: (openHours.end - openHours.start) * 2 }, (_, i) => openHours.start + i * 0.5),
    [],
  );

  const [isDragging, setIsDragging] = useState(false);

  const [dragState, setDragState] = useState<DragState>(null);
  const activeSelection = dragState
    ? { courtId: dragState.courtId, timeFrom: normalizeRange(dragState.startTime, dragState.endTime).from, timeTo: normalizeRange(dragState.startTime, dragState.endTime).to }
    : selection;

  if (process.env.NODE_ENV === 'development') {
    console.info('reservation grid selection debug', {
      selection,
      dragState,
      activeSelection,
    });
  }

  const selectedSlots = useMemo(() => {
    if (!dragState) {
      return new Set<SlotKey>();
    }

    const { from, to } = normalizeRange(dragState.startTime, dragState.endTime);
    const slots = new Set<SlotKey>();

    halfHourSlots.forEach((time) => {
      const isInRange = time >= from && time < to;
      if (!isInRange) {
        return;
      }

      const slot = getReservationSlotState(reservations, dragState.courtId, selectedDate, time, time + 0.5);
      if (!slot.isOccupied) {
        slots.add(`${dragState.courtId}-${time}`);
      }
    });

    return slots;
  }, [dragState, halfHourSlots, reservations, selectedDate]);

  const handlePointerDown = (courtId: number, time: number, slotType: string) => {
    if (slotType !== 'volno') {
      return;
    }

    setIsDragging(true);
    setDragState({ courtId, startTime: time, endTime: time });
  };

  const handlePointerEnter = (courtId: number, time: number) => {
    if (!isDragging || !dragState || dragState.courtId !== courtId) {
      return;
    }

    setDragState((current) => (current ? { ...current, endTime: time } : current));
  };

  const handlePointerUp = () => {
    if (dragState) {
      const { from, to } = normalizeRange(dragState.startTime, dragState.endTime);
      const hasBlockedSlot = halfHourSlots.some((time) => {
        const isInRange = time >= from && time < to;
        if (!isInRange) {
          return false;
        }

        return getReservationSlotState(reservations, dragState.courtId, selectedDate, time, time + 0.5).isOccupied;
      });

      if (hasBlockedSlot) {
        onSelectionChange?.(null);
      } else {
        onSelectionChange?.({
          courtId: dragState.courtId,
          timeFrom: formatTimeLabel(from),
          timeTo: formatTimeLabel(to),
        });
      }
    }

    setIsDragging(false);
    setDragState(null);
  };

  const getSelectedPosition = (courtId: number, time: number): ReservationSlotSelectionPosition => {
    const previousSelected = isReservationSlotSelected(activeSelection, courtId, time - 0.5, time);
    const nextSelected = isReservationSlotSelected(activeSelection, courtId, time + 0.5, time + 1);

    if (!previousSelected && !nextSelected) {
      return 'single';
    }
    if (!previousSelected) {
      return 'start';
    }
    if (!nextSelected) {
      return 'end';
    }
    return 'middle';
  };

  return (
    <div
      className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="grid min-w-[760px] grid-cols-4">
        <div className="border-b border-r border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900">Čas</div>
        {courts.map((court) => (
          <div key={court.id} className="border-b border-r border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900 last:border-r-0">
            {court.name}
          </div>
        ))}

        {halfHourSlots.map((time) => (
          <div key={`row-${time}`} className="contents">
            <div key={`time-${time}`} className="border-b border-r border-slate-200 bg-white p-3 text-sm font-medium text-slate-600">
              {formatTimeLabel(time)} - {formatTimeLabel(time + 0.5)}
            </div>
            {courts.map((court) => {
              const slot = getReservationSlotState(reservations, court.id, selectedDate, time, time + 0.5);
              const slotKey = `${court.id}-${time}` as SlotKey;
              const isSelectedByRange = isReservationSlotSelected(activeSelection, court.id, time, time + 0.5);
              const isSelected = selectedSlots.has(slotKey) || isSelectedByRange;
              const selectedPosition = isSelected ? getSelectedPosition(court.id, time) : 'single';
              const isDragPreview = selectedSlots.has(slotKey) && !isSelectedByRange;
              const slotClassName = buildReservationSlotRenderClassName(
                slot.type,
                isSelected,
                selectedPosition,
                isDragPreview ? 'border-sky-300 bg-sky-100 ring-1 ring-inset ring-sky-300 text-sky-900' : undefined,
              );
              const slotCellClassName = getReservationSlotCellClassName(slot.type, isSelected);
              const slotStateLabel = isSelected ? 'vybráno' : slot.type === 'volno' ? 'volno' : slot.type === 'cekajici' ? 'čeká na schválení' : 'obsazeno';

              if (
                process.env.NODE_ENV === 'development' &&
                activeSelection &&
                Number(activeSelection.courtId) === Number(court.id)
              ) {
                console.info('reservation grid slot selection debug', {
                  courtId: court.id,
                  slotFrom: time,
                  slotTo: time + 0.5,
                  isSelected,
                  className: slotClassName,
                });
              }

              return (
                <button
                  key={slotKey}
                  type="button"
                  onPointerDown={() => handlePointerDown(court.id, time, slot.isOccupied ? 'obsazeno' : 'volno')}
                  onPointerEnter={() => handlePointerEnter(court.id, time)}
                  className={slotClassName}
                  aria-label={`${court.name}, ${formatTimeLabel(time)} až ${formatTimeLabel(time + 0.5)}, stav ${slotStateLabel}`}
                  aria-pressed={slot.type === 'volno' ? isSelected : undefined}
                >
                  <span className={slotCellClassName}>
                    <span className="block font-medium">
                      {isSelected ? '✓ Vybráno' : isDragPreview ? 'Výběr' : slot.label}
                    </span>
                    {isSelected ? <p className="mt-1 text-sm text-blue-100">Potvrďte termín níže</p> : null}
                    {isDragPreview ? <p className="mt-1 text-sm text-sky-900">Výběr</p> : null}
                    {!slot.isOccupied && !isSelected && !isDragPreview ? <p className="mt-1 text-sm text-slate-500">Vyberte kliknutím nebo tahem</p> : null}
                    {slot.type === 'cekajici' ? <p className="mt-1 text-sm text-amber-900">Rezervace čeká na potvrzení</p> : null}
                    {(slot.type === 'potvrzeno' || slot.type === 'blokace') ? <p className="mt-1 text-sm text-rose-900">Termín je již rezervovaný</p> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
