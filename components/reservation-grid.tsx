'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { courts as fallbackCourts, mockReservations as fallbackReservations, openHours } from '@/lib/mockData';
import { buildReservationSlotRenderClassName, getReservationSlotState, isReservationSlotSelected, type ReservationSlotSelectionPosition } from '@/lib/services/reservation-slot-state';
import { isReservationStartInPast } from '@/lib/services/reservation-time';
import type { Court, Reservation } from '@/lib/types/domain';

type ReservationSelection = { courtId: number; timeFrom: string; timeTo: string };

type ReservationGridProps = {
  selectedDate: string;
  courts?: Court[];
  reservations?: Reservation[];
  selection?: ReservationSelection | null;
  onSelectionChange?: (selection: ReservationSelection | null) => void;
  now?: Date;
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

export function ReservationGrid({ selectedDate, courts = fallbackCourts, reservations = fallbackReservations, selection = null, onSelectionChange, now = new Date() }: ReservationGridProps) {
  const halfHourSlots = useMemo(
    () => Array.from({ length: (openHours.end - openHours.start) * 2 }, (_, i) => openHours.start + i * 0.5),
    [],
  );

  const [dragState, setDragState] = useState<DragState>(null);
  const dragStateRef = useRef<DragState>(null);
  const capturedPointerRef = useRef<{ element: HTMLButtonElement; pointerId: number } | null>(null);
  const [mobileCourtId, setMobileCourtId] = useState(() => selection?.courtId ?? courts[0]?.id ?? null);
  const selectionCourtId = selection?.courtId;
  const selectionTimeFrom = selection?.timeFrom;
  const selectionTimeTo = selection?.timeTo;

  useEffect(() => {
    if (selectionCourtId !== undefined && courts.some((court) => court.id === selectionCourtId)) {
      setMobileCourtId(selectionCourtId);
      return;
    }

    setMobileCourtId((currentCourtId) => (
      courts.some((court) => court.id === currentCourtId) ? currentCourtId : courts[0]?.id ?? null
    ));
  }, [courts, selectionCourtId, selectionTimeFrom, selectionTimeTo]);

  const activeSelection = useMemo(
    () => dragState
      ? { courtId: dragState.courtId, timeFrom: normalizeRange(dragState.startTime, dragState.endTime).from, timeTo: normalizeRange(dragState.startTime, dragState.endTime).to }
      : selection,
    [dragState, selection],
  );

  const visibleMobileSlots = useMemo(
    () => halfHourSlots.filter((time) => !isReservationStartInPast(selectedDate, formatTimeLabel(time), now)),
    [halfHourSlots, now, selectedDate],
  );

  const selectedSlots = useMemo(() => {
    if (!dragState) return new Set<SlotKey>();

    const { from, to } = normalizeRange(dragState.startTime, dragState.endTime);
    const slots = new Set<SlotKey>();

    halfHourSlots.forEach((time) => {
      if (time < from || time >= to) return;

      const slot = getReservationSlotState(reservations, dragState.courtId, selectedDate, time, time + 0.5);
      if (!slot.isOccupied && !isReservationStartInPast(selectedDate, formatTimeLabel(time), now)) slots.add(`${dragState.courtId}-${time}`);
    });

    return slots;
  }, [dragState, halfHourSlots, now, reservations, selectedDate]);

  const selectedRangeLabel = useMemo(() => {
    if (!activeSelection) return null;
    return `${activeSelection.timeFrom}–${activeSelection.timeTo}`;
  }, [activeSelection]);

  const updateDragState = (nextDragState: DragState) => {
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, courtId: number, time: number, isOccupied: boolean) => {
    if (isOccupied || isReservationStartInPast(selectedDate, formatTimeLabel(time), now) || event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    capturedPointerRef.current = { element: event.currentTarget, pointerId: event.pointerId };
    updateDragState({ courtId, startTime: time, endTime: time });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const currentDragState = dragStateRef.current;
    if (!currentDragState) return;

    event.preventDefault();
    const slotElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-slot-time][data-court-id]');
    if (!slotElement || Number(slotElement.dataset.courtId) !== currentDragState.courtId) return;

    const time = Number(slotElement.dataset.slotTime);
    if (!Number.isFinite(time) || time === currentDragState.endTime) return;
    updateDragState({ ...currentDragState, endTime: time });
  };

  const releaseCapturedPointer = () => {
    const capturedPointer = capturedPointerRef.current;
    if (!capturedPointer) return;

    if (capturedPointer.element.hasPointerCapture(capturedPointer.pointerId)) {
      capturedPointer.element.releasePointerCapture(capturedPointer.pointerId);
    }
    capturedPointerRef.current = null;
  };

  const finishSelection = () => {
    const currentDragState = dragStateRef.current;
    if (!currentDragState) return;

    const { from, to } = normalizeRange(currentDragState.startTime, currentDragState.endTime);
    const hasBlockedSlot = halfHourSlots.some((time) => {
      if (time < from || time >= to) return false;
      return getReservationSlotState(reservations, currentDragState.courtId, selectedDate, time, time + 0.5).isOccupied || isReservationStartInPast(selectedDate, formatTimeLabel(time), now);
    });

    const nextSelection = hasBlockedSlot
      ? null
      : { courtId: currentDragState.courtId, timeFrom: formatTimeLabel(from), timeTo: formatTimeLabel(to) };

    releaseCapturedPointer();
    updateDragState(null);
    onSelectionChange?.(
      nextSelection,
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragStateRef.current) return;
    event.preventDefault();
    finishSelection();
  };

  const handlePointerCancel = () => {
    releaseCapturedPointer();
    updateDragState(null);
  };

  const getSelectedPosition = (courtId: number, time: number): ReservationSlotSelectionPosition => {
    const previousSelected = isReservationSlotSelected(activeSelection, courtId, time - 0.5, time);
    const nextSelected = isReservationSlotSelected(activeSelection, courtId, time + 0.5, time + 1);
    if (!previousSelected && !nextSelected) return 'single';
    if (!previousSelected) return 'start';
    if (!nextSelected) return 'end';
    return 'middle';
  };

  const renderSlot = (court: Court, time: number, mobile = false) => {
    const slot = getReservationSlotState(reservations, court.id, selectedDate, time, time + 0.5);
    const isPastSlot = isReservationStartInPast(selectedDate, formatTimeLabel(time), now);
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
          ? 'z-10 rounded-t-xl border-blue-500 bg-blue-500 text-white ring-1 ring-blue-300/40 shadow-[0_1px_2px_0_rgba(0,0,0,0.05),inset_0_-1px_0_rgba(96,165,250,0.25)]'
          : selectedPosition === 'end'
            ? 'z-10 rounded-b-xl border-blue-500 bg-blue-500 text-white ring-1 ring-blue-300/40 shadow-sm'
            : 'z-10 rounded-none border-blue-500 bg-blue-500 text-white ring-1 ring-blue-300/40 shadow-[0_1px_2px_0_rgba(0,0,0,0.05),inset_0_-1px_0_rgba(96,165,250,0.25)]'
      : '';
    const interactionClassName = canApplySelectedStyle
      ? selectedClassName
      : isDragPreview
        ? 'border-sky-300 bg-sky-100 text-sky-900'
        : isPastSlot && slot.type === 'volno'
          ? 'cursor-not-allowed bg-slate-100 text-slate-400 opacity-75'
          : slot.type === 'volno'
            ? 'hover:bg-sky-50 transition-colors duration-150'
          : '';
    const slotClassName = buildReservationSlotRenderClassName(slot.type, isSelected, selectedPosition, interactionClassName);
    const slotStateLabel = canApplySelectedStyle ? 'vybráno' : isPastSlot && slot.type === 'volno' ? 'již proběhlo' : slot.type === 'volno' ? 'volno' : slot.type === 'cekajici' ? 'čeká na schválení' : 'obsazeno';
    const slotNote = slot.reservation?.note?.trim() || null;
    const slotAriaLabel = slotNote
      ? `${court.name}, ${formatTimeLabel(time)} až ${formatTimeLabel(time + 0.5)}, stav ${slotStateLabel}, poznámka ${slotNote}`
      : `${court.name}, ${formatTimeLabel(time)} až ${formatTimeLabel(time + 0.5)}, stav ${slotStateLabel}`;
    const showSelectedText = isSelectedByRange && (selectedPosition === 'single' || selectedPosition === 'start');

    return (
      <button
        key={slotKey}
        type="button"
        data-court-id={court.id}
        data-slot-time={time}
        onPointerDown={(event) => handlePointerDown(event, court.id, time, slot.isOccupied)}
        disabled={isPastSlot && slot.type === 'volno'}
        className={`${slotClassName} ${mobile ? 'touch-none' : ''}`}
        aria-label={slotAriaLabel}
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
          ) : isPastSlot && slot.type === 'volno' ? (
            <span className="block truncate whitespace-nowrap text-sm font-medium leading-tight text-slate-500">Již proběhlo</span>
          ) : slot.type === 'volno' ? (
            <span className="block truncate whitespace-nowrap text-sm font-medium leading-tight text-slate-700">Volno</span>
          ) : slot.type === 'cekajici' ? (
            <>
              <span className="block truncate whitespace-nowrap text-sm font-medium leading-tight text-amber-900">Čeká na schválení</span>
              {slotNote ? <span className="block max-w-full truncate whitespace-nowrap text-xs leading-tight text-amber-800/80" title={slotNote}>{slotNote}</span> : null}
            </>
          ) : (
            <>
              <span className="block truncate whitespace-nowrap text-sm font-medium leading-tight text-rose-900">Obsazeno</span>
              {slotNote ? <span className="block max-w-full truncate whitespace-nowrap text-xs leading-tight text-rose-800/80" title={slotNote}>{slotNote}</span> : null}
            </>
          )}
        </span>
      </button>
    );
  };

  const mobileCourt = courts.find((court) => court.id === mobileCourtId) ?? courts[0];
  const pointerHandlers = {
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
  };

  return (
    <section className="space-y-2">
      <p className="px-1 text-xs text-slate-500">Tip: Pro rychlý výběr přetáhněte přes více volných slotů.</p>

      <div className="space-y-2 md:hidden">
        <div className="grid grid-cols-3 rounded-xl bg-slate-200 p-1" role="tablist" aria-label="Výběr kurtu">
          {courts.map((court) => {
            const isActive = court.id === mobileCourt?.id;
            return (
              <button
                key={court.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`mobile-court-${court.id}`}
                onClick={() => setMobileCourtId(court.id)}
                className={`min-w-0 rounded-lg px-2 py-2 text-sm font-semibold transition ${isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="block truncate">{court.name}</span>
              </button>
            );
          })}
        </div>

        {mobileCourt && (
          <div
            id={`mobile-court-${mobileCourt.id}`}
            role="tabpanel"
            aria-label={mobileCourt.name}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            {...pointerHandlers}
          >
            <div className="grid grid-cols-[minmax(7.5rem,0.8fr)_minmax(0,1.2fr)]">
              <div className="border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">Čas</div>
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">{mobileCourt.name}</div>
              {visibleMobileSlots.length > 0 ? visibleMobileSlots.map((time) => (
                <div key={`mobile-row-${time}`} className="contents">
                  <div className="border-b border-r border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600">
                    {formatTimeLabel(time)} - {formatTimeLabel(time + 0.5)}
                  </div>
                  {renderSlot(mobileCourt, time, true)}
                </div>
              )) : (
                <p className="col-span-2 px-3 py-4 text-sm text-slate-600">
                  Dnešní rezervační časy už proběhly. Vyberte prosím jiný den.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block"
        {...pointerHandlers}
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
              <div className="border-b border-r border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600">
                {formatTimeLabel(time)} - {formatTimeLabel(time + 0.5)}
              </div>
              {courts.map((court) => renderSlot(court, time))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
