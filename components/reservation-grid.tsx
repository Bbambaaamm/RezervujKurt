'use client';

import { useMemo, useState } from 'react';

import { courts as fallbackCourts, mockReservations as fallbackReservations, openHours } from '@/lib/mockData';
import { buildReservationSlotRenderClassName, getReservationSlotState, isReservationSlotSelected, type ReservationSlotSelectionPosition } from '@/lib/services/reservation-slot-state';
import type { Court, Reservation } from '@/lib/types/domain';

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

  const selectedSlots = useMemo(() => {
    if (!dragState) {
      return new Set<SlotKey>();
    }

    const { from, to } = normalizeRange(dragState.startTime, dragState.endTime);
    const slots = new Set<SlotKey>();

    halfHourSlots.forEach((time) => {
      const isInRange = time >= from && time < to;
      if (!isInRange) return;

      const slot = getReservationSlotState(reservations, dragState.courtId, selectedDate, time, time + 0.5);
      if (!slot.isOccupied) slots.add(`${dragState.courtId}-${time}`);
    });

    return slots;
  }, [dragState, halfHourSlots, reservations, selectedDate]);

  const selectedRangeLabel = useMemo(() => {
    if (!activeSelection) return null;
    return `${activeSelection.timeFrom}–${activeSelection.timeTo}`;
  }, [activeSelection]);

  const handlePointerDown = (courtId: number, time: number, slotType: string) => {
    if (slotType !== 'volno') return;
    setIsDragging(true);
    setDragState({ courtId, startTime: time, endTime: time });
  };

  const handlePointerEnter = (courtId: number, time: number) => {
    if (!isDragging || !dragState || dragState.courtId !== courtId) return;
    setDragState((current) => (current ? { ...current, endTime: time } : current));
  };

  const handlePointerUp = () => {
    if (dragState) {
      const { from, to } = normalizeRange(dragState.startTime, dragState.endTime);
      const hasBlockedSlot = halfHourSlots.some((time) => {
        if (!(time >= from && time < to)) return false;
        return getReservationSlotState(reservations, dragState.courtId, selectedDate, time, time + 0.5).isOccupied;
      });

      if (hasBlockedSlot) {
        onSelectionChange?.(null);
      } else {
        onSelectionChange?.({ courtId: dragState.courtId, timeFrom: formatTimeLabel(from), timeTo: formatTimeLabel(to) });
      }
    }

    setIsDragging(false);
    setDragState(null);
  };

  const getSelectedPosition = (courtId: number, time: number): ReservationSlotSelectionPosition => {
    const previousSelected = isReservationSlotSelected(activeSelection, courtId, time - 0.5, time);
    const nextSelected = isReservationSlotSelected(activeSelection, courtId, time + 0.5, time + 1);
    if (!previousSelected && !nextSelected) return 'single';
    if (!previousSelected) return 'start';
    if (!nextSelected) return 'end';
    return 'middle';
  };

  return (
    <section className="space-y-2">
      <p className="px-1 text-xs text-slate-500">Tip: Pro rychlý výběr přetáhněte přes více volných slotů.</p>
      <div
        className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="grid min-w-[760px] grid-cols-4">
          <div className="sticky top-0 z-20 border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">Čas</div>
          {courts.map((court) => (
            <div key={court.id} className="sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 last:border-r-0">
              {court.name}
            </div>
          ))}

          {halfHourSlots.map((time) => (
            <div key={`row-${time}`} className="contents">
              <div className="border-b border-r border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600">
                {formatTimeLabel(time)} - {formatTimeLabel(time + 0.5)}
              </div>
              {courts.map((court) => {
                const slot = getReservationSlotState(reservations, court.id, selectedDate, time, time + 0.5);
                const slotKey = `${court.id}-${time}` as SlotKey;
                const isSelectedByRange = isReservationSlotSelected(activeSelection, court.id, time, time + 0.5);
                const isSelected = selectedSlots.has(slotKey) || isSelectedByRange;
                const selectedPosition = isSelected ? getSelectedPosition(court.id, time) : 'single';
                const isDragPreview = selectedSlots.has(slotKey) && !isSelectedByRange;
                const canApplySelectedStyle = isSelected && slot.type === 'volno';
                const selectedClassName = canApplySelectedStyle
                  ? selectedPosition === 'single'
                    ? 'z-10 rounded-xl border-blue-500 bg-blue-500 text-white ring-1 ring-blue-300/40 shadow-sm'
                    : selectedPosition === 'start'
                      ? 'z-10 rounded-t-xl border-blue-500 bg-blue-500 text-white ring-1 ring-blue-300/40 shadow-sm shadow-[inset_0_-1px_0_rgba(96,165,250,0.25)]'
                      : selectedPosition === 'end'
                        ? 'z-10 rounded-b-xl border-blue-500 bg-blue-500 text-white ring-1 ring-blue-300/40 shadow-sm'
                        : 'z-10 rounded-none border-blue-500 bg-blue-500 text-white ring-1 ring-blue-300/40 shadow-sm shadow-[inset_0_-1px_0_rgba(96,165,250,0.25)]'
                  : '';
                const interactionClassName = canApplySelectedStyle ? selectedClassName : isDragPreview ? 'border-sky-300 bg-sky-100 text-sky-900' : 'hover:bg-sky-50';
                const slotClassName = buildReservationSlotRenderClassName(slot.type, isSelected, selectedPosition, interactionClassName);
                const slotStateLabel = canApplySelectedStyle ? 'vybráno' : slot.type === 'volno' ? 'volno' : slot.type === 'cekajici' ? 'čeká na schválení' : 'obsazeno';
                const showSelectedText = isSelectedByRange && (selectedPosition === 'single' || selectedPosition === 'start');

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
                    <span className="flex h-11 h-full w-full flex-col justify-center overflow-hidden px-3 py-1.5 text-left">
                      {canApplySelectedStyle ? (
                        showSelectedText ? (
                          <>
                            <span className="block truncate whitespace-nowrap text-sm font-semibold leading-tight text-white">Vybráno</span>
                            <span className="block truncate whitespace-nowrap text-xs leading-tight text-blue-100">{selectedRangeLabel}</span>
                          </>
                        ) : null
                      ) : isDragPreview ? (
                        <span className="block truncate whitespace-nowrap text-sm font-medium leading-tight text-sky-900">Výběr</span>
                      ) : slot.type === 'volno' ? (
                        <span className="block truncate whitespace-nowrap text-sm font-medium leading-tight text-slate-700">Volno</span>
                      ) : slot.type === 'cekajici' ? (
                        <span className="block truncate whitespace-nowrap text-sm font-medium leading-tight text-amber-900">Čeká na schválení</span>
                      ) : (
                        <span className="block truncate whitespace-nowrap text-sm font-medium leading-tight text-rose-900">Obsazeno</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
