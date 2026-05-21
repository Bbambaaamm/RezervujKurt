'use client';

import { useMemo, useState } from 'react';

import { courts as fallbackCourts, mockReservations as fallbackReservations, openHours } from '@/lib/mockData';
import type { Court, Reservation } from '@/lib/types/domain';
import { getReservationSlotClassName, getReservationSlotState } from '@/lib/services/reservation-slot-state';


type ReservationSelection = { courtId: number; timeFrom: string; timeTo: string };

type ReservationGridProps = {
  selectedDate: string;
  courts?: Court[];
  reservations?: Reservation[];
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

export function ReservationGrid({ selectedDate, courts = fallbackCourts, reservations = fallbackReservations, onSelectionChange }: ReservationGridProps) {
  const halfHourSlots = useMemo(
    () => Array.from({ length: (openHours.end - openHours.start) * 2 }, (_, i) => openHours.start + i * 0.5),
    [],
  );

  const [isDragging, setIsDragging] = useState(false);

  if (process.env.NODE_ENV === "development") {
    console.info('reservation grid received reservations count', { count: reservations.length, selectedDate });
    console.info('reservation grid received reservations sample', reservations.slice(0, 3));
  }
  const [dragState, setDragState] = useState<DragState>(null);

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
  };

  return (
    <div
      className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="grid min-w-[760px] grid-cols-4">
        <div className="border-b border-r border-slate-200 bg-slate-100 p-3 text-sm font-semibold">Čas</div>
        {courts.map((court) => (
          <div key={court.id} className="border-b border-r border-slate-200 bg-slate-100 p-3 text-sm font-semibold last:border-r-0">
            {court.name}
          </div>
        ))}

        {halfHourSlots.map((time) => (
          <div key={`row-${time}`} className="contents">
            <div key={`time-${time}`} className="border-b border-r border-slate-200 p-3 text-sm font-medium text-slate-700">
              {formatTimeLabel(time)} - {formatTimeLabel(time + 0.5)}
            </div>
            {courts.map((court) => {
              const slot = getReservationSlotState(reservations, court.id, selectedDate, time, time + 0.5);
              if (process.env.NODE_ENV === 'development' && time === halfHourSlots[0]) {
                console.info('reservation grid slot state', { selectedDate, courtId: court.id, timeFrom: time, timeTo: time + 0.5, slotType: slot.type, isOccupied: slot.isOccupied });
              }
              const slotKey = `${court.id}-${time}` as SlotKey;
              const isSelected = selectedSlots.has(slotKey);

              return (
                <button
                  key={slotKey}
                  type="button"
                  onPointerDown={() => handlePointerDown(court.id, time, slot.isOccupied ? 'obsazeno' : 'volno')}
                  onPointerEnter={() => handlePointerEnter(court.id, time)}
                  className={getReservationSlotClassName(slot.type, isSelected)}
                >
                  <span className="font-semibold">{slot.label}</span>
                  {!slot.isOccupied && <p className="mt-1 text-slate-500">Klikněte a tahem vyberte úsek</p>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
