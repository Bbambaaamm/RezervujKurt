"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { ReservationGrid } from '@/components/reservation-grid';
import { courts as fallbackCourts, mockReservations as fallbackReservations } from '@/lib/mockData';
import { createReservation, ReservationConflictError, ReservationUnauthorizedError } from '@/lib/services/reservations';
import { getCourtsReadOnly, getReservationsReadOnly } from '@/lib/services/read-only';
import { supabaseAuthClient } from '@/lib/supabase/auth-client';
import { SupabaseRequestError } from '@/lib/supabase/client';
import type { Court, Reservation } from '@/lib/types/domain';

type DataSourceMode = 'supabase' | 'mock fallback';

function formatCzechDate(date: string) { /* unchanged */
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return 'Neplatné datum';
  return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(parsedDate);
}

function getTodayLocalDate() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

export default function ReservationPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayLocalDate);
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sourceMode, setSourceMode] = useState<DataSourceMode>('supabase');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [courtId, setCourtId] = useState('1');
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('10:00');
  const [selectionReady, setSelectionReady] = useState(false);
  const [note, setNote] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formattedSelectedDate = useMemo(() => formatCzechDate(selectedDate), [selectedDate]);
  const isAuthenticated = Boolean(sessionToken && sessionUserId);

  useEffect(() => {
    supabaseAuthClient.auth.getSession().then(({ data }) => {
      if (process.env.NODE_ENV === 'development') {
        if (data.session) {
          console.info('[auth] session found');
        } else {
          console.info('[auth] session missing');
        }
      }
      setSessionToken(data.session?.access_token ?? null);
      setSessionUserId(data.session?.user.id ?? null);
    });

    const { data: listener } = supabaseAuthClient.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
      setSessionUserId(session?.user.id ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { /* existing */ let active = true; async function loadCourts() { try { const loadedCourts = await getCourtsReadOnly(); if (active && loadedCourts.length > 0) { setCourts(loadedCourts); setCourtId(String(loadedCourts[0].id)); } } catch (error) { if (active) { setCourts(fallbackCourts); setSourceMode('mock fallback'); } if (error instanceof SupabaseRequestError) { console.error('Načtení kurtů ze Supabase selhalo, používám fallback data.', { endpoint: error.endpoint, status: error.status, response: error.responseBody, }); return; } console.error('Načtení kurtů ze Supabase selhalo, používám fallback data.', error); }} loadCourts(); return () => { active = false; }; }, []);

  useEffect(() => { let active = true; async function loadReservations() { try { const loadedReservations = await getReservationsReadOnly(selectedDate); if (active) setReservations(loadedReservations);} catch (error) { if (active) { setReservations(fallbackReservations.filter((reservation) => reservation.date === selectedDate)); setSourceMode('mock fallback'); } }} loadReservations(); return () => { active = false; }; }, [selectedDate]);


  useEffect(() => {
    setSelectionReady(false);
  }, [selectedDate]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      if (isAuthenticated) {
        console.info('write guard: authenticated');
      } else {
        console.info('write guard: anonymous');
      }
    }
  }, [isAuthenticated]);

  async function handleCreateReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage(null);
    setSubmitError(null);

    if (!selectionReady) {
      setSubmitError('Nejdřív vyberte volný termín v přehledu kurtů.');
      return;
    }

    if (!sessionToken || !sessionUserId) {
      setSubmitError('Uživatel není přihlášen. Pro vytvoření rezervace se prosím přihlaste.');
      return;
    }

    try {
      await createReservation({ accessToken: sessionToken, userId: sessionUserId, courtId: Number(courtId), reservationDate: selectedDate, timeFrom, timeTo, note });
      setSubmitMessage('Rezervace vytvořena.');
      const loadedReservations = await getReservationsReadOnly(selectedDate);
      setReservations(loadedReservations);
    } catch (error) {
      if (error instanceof ReservationConflictError) {
        setSubmitError('Kolize rezervace. Vybraný termín je už obsazen.');
        return;
      }
      if (error instanceof ReservationUnauthorizedError) {
        setSubmitError('Chyba oprávnění. Nemáte právo vytvořit tuto rezervaci.');
        return;
      }
      setSubmitError('Rezervaci se nepodařilo vytvořit. Zkuste to prosím znovu.');
    }
  }

  return <div className="space-y-6">{/* ... */}
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h1 className="text-3xl font-bold">Rezervace kurtů</h1><p className="text-slate-600">Denní přehled všech 3 kurtů na jednom místě.</p></div><div className="space-y-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm"><div>Datum: <span className="font-semibold">{formattedSelectedDate}</span></div><label className="flex flex-col gap-1 text-xs font-medium text-slate-600" htmlFor="reservation-day">Vyberte den<input id="reservation-day" type="date" lang="cs-CZ" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" /></label></div></div>
    <ReservationGrid selectedDate={selectedDate} courts={courts} reservations={reservations} onSelectionChange={(selection) => {
      if (!selection) {
        setSelectionReady(false);
        return;
      }

      setCourtId(String(selection.courtId));
      setTimeFrom(selection.timeFrom);
      setTimeTo(selection.timeTo);
      setSelectionReady(true);
    }} />
    {isAuthenticated ? (
      <form onSubmit={handleCreateReservation} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
          {selectionReady ? (
            <p>
              Vybraný termín: <span className="font-semibold">{courts.find((court) => String(court.id) === courtId)?.name ?? `Kurt ${courtId}`}</span>, {timeFrom}–{timeTo}
            </p>
          ) : (
            <p className="text-slate-600">Nejdřív vyberte volná okna přímo v přehledu kurtů.</p>
          )}
        </div>
        <label className="flex flex-col gap-1 md:col-span-2">Poznámka<input value={note} onChange={(event) => setNote(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5"/></label>
        <button type="submit" disabled={!selectionReady} className="rounded-md border border-slate-300 px-3 py-2 text-left disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 md:col-span-2">Rezervovat vybraný termín</button>
        {submitMessage && <p className="md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{submitMessage}</p>}
        {submitError && <p className="md:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{submitError}</p>}
      </form>
    ) : (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Pro vytvoření rezervace se musíte přihlásit.</p>
        <a href="/prihlaseni" className="inline-flex rounded-md border border-amber-300 bg-white px-3 py-2 text-amber-900 transition hover:bg-amber-100">
          Přejít na přihlášení
        </a>
      </div>
    )}
  </div>;
}
