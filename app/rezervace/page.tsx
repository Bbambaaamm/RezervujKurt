"use client";

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { ReservationGrid } from '@/components/reservation-grid';
import { courts as fallbackCourts, mockReservations as fallbackReservations } from '@/lib/mockData';
import { getCourtsReadOnly, getReservationsReadOnly } from '@/lib/services/read-only';
import {
  createPendingReservation,
  ReservationConflictError,
  ReservationValidationError,
} from '@/lib/services/write-reservations';
import { SupabaseRequestError } from '@/lib/supabase/client';
import type { Court, Reservation } from '@/lib/types/domain';

type DataSourceMode = 'supabase' | 'mock fallback';

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
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sourceMode, setSourceMode] = useState<DataSourceMode>('supabase');
  const [reservationMessage, setReservationMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formCourtId, setFormCourtId] = useState(1);
  const [formTimeFrom, setFormTimeFrom] = useState('09:00');
  const [formTimeTo, setFormTimeTo] = useState('10:00');
  const [formNote, setFormNote] = useState('');
  const [formAccessToken, setFormAccessToken] = useState('');
  const formattedSelectedDate = useMemo(() => formatCzechDate(selectedDate), [selectedDate]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    console.info(`[rezervace] source: ${sourceMode}`);
  }, [sourceMode]);

  useEffect(() => {
    let active = true;

    async function loadCourts() {
      try {
        const loadedCourts = await getCourtsReadOnly();

        if (active && loadedCourts.length > 0) {
          setCourts(loadedCourts);
        }
      } catch (error) {
        if (active) {
          setCourts(fallbackCourts);
          setSourceMode('mock fallback');
        }

        if (error instanceof SupabaseRequestError) {
          console.error('Načtení kurtů ze Supabase selhalo, používám fallback data.', {
            endpoint: error.endpoint,
            status: error.status,
            response: error.responseBody,
          });
          return;
        }

        console.error('Načtení kurtů ze Supabase selhalo, používám fallback data.', error);
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
      } catch (error) {
        if (active) {
          setReservations(fallbackReservations.filter((reservation) => reservation.date === selectedDate));
          setSourceMode('mock fallback');
        }

        if (error instanceof SupabaseRequestError) {
          console.error(`Načtení rezervací pro ${selectedDate} ze Supabase selhalo, používám fallback data.`, {
            endpoint: error.endpoint,
            status: error.status,
            response: error.responseBody,
          });
          return;
        }

        console.error(`Načtení rezervací pro ${selectedDate} ze Supabase selhalo, používám fallback data.`, error);
      }
    }

    loadReservations();

    return () => {
      active = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    if (courts.length === 0) {
      return;
    }

    setFormCourtId(courts[0].id);
  }, [courts]);

  async function handleCreateReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReservationMessage(null);
    setIsSubmitting(true);

    try {
      await createPendingReservation({
        courtId: formCourtId,
        reservationDate: selectedDate,
        timeFrom: formTimeFrom,
        timeTo: formTimeTo,
        note: formNote,
        accessToken: formAccessToken,
      });

      const loadedReservations = await getReservationsReadOnly(selectedDate);
      setReservations(loadedReservations);
      setFormNote('');
      setReservationMessage('Rezervace byla vytvořena ve stavu čekající na schválení.');
    } catch (error) {
      if (error instanceof ReservationValidationError || error instanceof ReservationConflictError) {
        setReservationMessage(error.message);
      } else {
        console.error('Vytvoření rezervace selhalo.', error);
        setReservationMessage('Rezervaci se nepodařilo vytvořit kvůli neočekávané chybě.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

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

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Nová rezervace</h2>
        <p className="mt-1 text-sm text-slate-600">Minimální formulář pro vytvoření čekající rezervace.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleCreateReservation}>
          <label className="flex flex-col gap-1 text-sm">
            Kurt
            <select
              value={formCourtId}
              onChange={(event) => setFormCourtId(Number(event.target.value))}
              className="rounded-md border border-slate-300 px-2 py-2"
              required
            >
              {courts.map((court) => (
                <option key={court.id} value={court.id}>{court.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Datum
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="rounded-md border border-slate-300 px-2 py-2" required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Čas od
            <input type="time" value={formTimeFrom} onChange={(event) => setFormTimeFrom(event.target.value)} className="rounded-md border border-slate-300 px-2 py-2" required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Čas do
            <input type="time" value={formTimeTo} onChange={(event) => setFormTimeTo(event.target.value)} className="rounded-md border border-slate-300 px-2 py-2" required />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Poznámka
            <textarea value={formNote} onChange={(event) => setFormNote(event.target.value)} className="min-h-20 rounded-md border border-slate-300 px-2 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Access token přihlášeného uživatele
            <input
              type="password"
              value={formAccessToken}
              onChange={(event) => setFormAccessToken(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-2"
              placeholder="Vložte JWT access token"
              required
            />
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={isSubmitting} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {isSubmitting ? 'Ukládám…' : 'Vytvořit rezervaci'}
            </button>
          </div>
          {reservationMessage && <p className="text-sm md:col-span-2">{reservationMessage}</p>}
        </form>
      </section>

      {process.env.NODE_ENV === 'development' && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          source: <span className="font-semibold">{sourceMode}</span>
        </div>
      )}

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
        <p><span className="inline-block h-3 w-3 rounded-full bg-white ring-1 ring-slate-300" /> Volný slot</p>
        <p><span className="inline-block h-3 w-3 rounded-full bg-emerald-200" /> Potvrzená rezervace</p>
        <p><span className="inline-block h-3 w-3 rounded-full bg-amber-200" /> Čeká na schválení</p>
      </section>
    </div>
  );
}
