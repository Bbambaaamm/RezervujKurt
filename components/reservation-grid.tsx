'use client';

import { useMemo, useState } from 'react';

import { courts as fallbackCourts, mockReservations as fallbackReservations, openHours } from '@/lib/mockData';
import type { Court, Reservation } from '@/lib/types/domain';

const statusClasses: Record<string, string> = {
  volno: 'bg-white',
  potvrzeno: 'bg-emerald-200 text-emerald-900',
  cekajici: 'bg-amber-200 text-amber-900',
  blokace: 'bg-rose-200 text-rose-900',
};

type ReservationGridProps = {
  selectedDate: string;
  courts?: Court[];
  reservations?: Reservation[];
  onSelectionChange?: (selection: { courtId: number; timeFrom: string; timeTo: string } | null) => void;
};

type SlotKey = `${number}-${number}`;

type DragState = {
  courtId: number;
  startTime: number;
  endTime: number;
} | null;

function getSlotStatus(courtId: number, time: number, date: string, reservations: Reservation[]) {
  const reservation = reservations.find(
    (item) => item.courtId === courtId && item.date === date && time >= item.fromHour && time < item.toHour,
  );

  if (!reservation) {
    return { type: 'volno', label: 'Volno' };
  }

  return {
    type: reservation.status,
    label:
      reservation.status === 'cekajici'
        ? 'Čeká na schválení'
        : reservation.status === 'potvrzeno'
          ? 'Obsazeno'
          : 'Blokace',
  };
}

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

      const slot = getSlotStatus(dragState.courtId, time, selectedDate, reservations);
      if (slot.type === 'volno') {
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

        return getSlotStatus(dragState.courtId, time, selectedDate, reservations).type !== 'volno';
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
              const slot = getSlotStatus(court.id, time, selectedDate, reservations);
              const slotKey = `${court.id}-${time}` as SlotKey;
              const isSelected = selectedSlots.has(slotKey);

              return (
                <button
                  key={slotKey}
                  type="button"
                  onPointerDown={() => handlePointerDown(court.id, time, slot.type)}
                  onPointerEnter={() => handlePointerEnter(court.id, time)}
                  className={`border-b border-r border-slate-200 p-3 text-left text-xs transition hover:brightness-95 last:border-r-0 ${statusClasses[slot.type]} ${isSelected ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                >
                  <span className="font-semibold">{slot.label}</span>
                  {slot.type === 'volno' && <p className="mt-1 text-slate-500">Klikněte a tahem vyberte úsek</p>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
