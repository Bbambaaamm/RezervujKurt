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

export default function ReservationPage() {
  const [selectedDate, setSelectedDate] = useState('2026-05-14');
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sourceMode, setSourceMode] = useState<DataSourceMode>('supabase');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [courtId, setCourtId] = useState('1');
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('10:00');
  const [note, setNote] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formattedSelectedDate = useMemo(() => formatCzechDate(selectedDate), [selectedDate]);

  useEffect(() => {
    supabaseAuthClient.auth.getSession().then(({ data }) => {
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

  async function handleCreateReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage(null);
    setSubmitError(null);

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
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h1 className="text-3xl font-bold">Rezervace kurtů</h1><p className="text-slate-600">Denní přehled všech 3 kurtů na jednom místě.</p></div><div className="space-y-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm"><div>Datum: <span className="font-semibold">{formattedSelectedDate}</span></div><label className="flex flex-col gap-1 text-xs font-medium text-slate-600" htmlFor="reservation-day">Vyberte den<input id="reservation-day" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" /></label></div></div>
    <ReservationGrid selectedDate={selectedDate} courts={courts} reservations={reservations} />
    <form onSubmit={handleCreateReservation} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-2">
      <label className="flex flex-col gap-1">Kurt<select value={courtId} onChange={(event) => setCourtId(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5">{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label>
      <label className="flex flex-col gap-1">Od<input type="time" value={timeFrom} onChange={(event) => setTimeFrom(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5"/></label>
      <label className="flex flex-col gap-1">Do<input type="time" value={timeTo} onChange={(event) => setTimeTo(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5"/></label>
      <label className="flex flex-col gap-1 md:col-span-2">Poznámka<input value={note} onChange={(event) => setNote(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5"/></label>
      <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-left md:col-span-2">Vytvořit rezervaci</button>
      {!sessionToken && <p className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">Uživatel není přihlášen.</p>}
      {submitMessage && <p className="md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{submitMessage}</p>}
      {submitError && <p className="md:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{submitError}</p>}
    </form>
  </div>;
}
