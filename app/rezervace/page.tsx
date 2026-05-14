"use client";

import { useEffect, useMemo, useState } from 'react';

import { ReservationGrid } from '@/components/reservation-grid';
import { courts as fallbackCourts, mockReservations as fallbackReservations } from '@/lib/mockData';
import { getCourtsReadOnly, getReservationsReadOnly } from '@/lib/services/read-only';
import type { Court, Reservation } from '@/lib/types/domain';

function formatCzechDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Neplatné datum';
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(parsedDate);
}

export default function ReservationPage() {
  const [selectedDate, setSelectedDate] = useState('2026-05-14');
  const [courts, setCourts] = useState<Court[]>(fallbackCourts);
  const [reservations, setReservations] = useState<Reservation[]>(fallbackReservations);
  const formattedSelectedDate = useMemo(() => formatCzechDate(selectedDate), [selectedDate]);

  useEffect(() => {
    let active = true;

    async function loadCourts() {
      try {
        const loadedCourts = await getCourtsReadOnly();

        if (active && loadedCourts.length > 0) {
          setCourts(loadedCourts);
        }
      } catch {
        // Při chybě zůstáváme na mock datech, aby UI zůstalo funkční.
      }
    }

    loadCourts();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadReservations() {
      try {
        const loadedReservations = await getReservationsReadOnly(selectedDate);

        if (active) {
          setReservations(loadedReservations);
        }
      } catch {
        // Při chybě zůstáváme na mock datech, aby UI zůstalo funkční.
      }
    }

    loadReservations();

    return () => {
      active = false;
    };
  }, [selectedDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold">Rezervace kurtů</h1>
          <p className="text-slate-600">Denní přehled všech 3 kurtů na jednom místě.</p>
        </div>
        <div className="space-y-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm">
          <div>
            Datum: <span className="font-semibold">{formattedSelectedDate}</span>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600" htmlFor="reservation-day">
            Vyberte den
            <input
              id="reservation-day"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
        </div>
      </div>

      <ReservationGrid selectedDate={selectedDate} courts={courts} reservations={reservations} />

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
        <p><span className="inline-block h-3 w-3 rounded-full bg-white ring-1 ring-slate-300" /> Volný slot</p>
        <p><span className="inline-block h-3 w-3 rounded-full bg-emerald-200" /> Potvrzená rezervace</p>
        <p><span className="inline-block h-3 w-3 rounded-full bg-amber-200" /> Čeká na schválení</p>
      </section>
    </div>
  );
}
