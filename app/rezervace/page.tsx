"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ReservationGrid } from '@/components/reservation-grid';
import { courts as fallbackCourts, mockReservations as fallbackReservations } from '@/lib/mockData';
import { checkReservationSlotAvailability, createReservation } from '@/lib/services/reservations';
import { ReservationConflictError, ReservationUnauthorizedError, ReservationValidationError } from '@/lib/services/supabase-error-mapping';
import { getCourtsReadOnly, getReservationsReadOnly } from '@/lib/services/read-only';
import { supabaseAuthClient } from '@/lib/supabase/auth-client';
import { SupabaseRequestError } from '@/lib/supabase/client';
import { isSlotOccupiedByPublicReservations } from '@/lib/services/reservation-submit-guard';
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
  const [courtsSourceMode, setCourtsSourceMode] = useState<DataSourceMode>('supabase');
  const [reservationsSourceMode, setReservationsSourceMode] = useState<DataSourceMode>('supabase');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [courtId, setCourtId] = useState('1');
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('10:00');
  const [selectionReady, setSelectionReady] = useState(false);
  const [note, setNote] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null);
  const formattedSelectedDate = useMemo(() => formatCzechDate(selectedDate), [selectedDate]);
  const isAuthenticated = Boolean(sessionToken && sessionUserId);

  const selectedCourtName = useMemo(
    () => courts.find((court) => String(court.id) === courtId)?.name ?? `Kurt #${courtId}`,
    [courtId, courts],
  );
  const reservationSummary = selectionReady
    ? `${selectedCourtName}, ${timeFrom}–${timeTo}, ${formattedSelectedDate}`
    : 'Vyberte volný termín v přehledu kurtů';
  const showDevFallbackWarning =
    process.env.NODE_ENV === 'development' &&
    (courtsSourceMode === 'mock fallback' || reservationsSourceMode === 'mock fallback');

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

  useEffect(() => { /* existing */ let active = true; async function loadCourts() { try { const loadedCourts = await getCourtsReadOnly(); if (active && loadedCourts.length > 0) { setCourts(loadedCourts); setCourtId(String(loadedCourts[0].id)); setCourtsSourceMode('supabase'); } } catch (error) { if (active) { setCourts(fallbackCourts); setCourtsSourceMode('mock fallback'); } if (error instanceof SupabaseRequestError) { console.error('[DEV fallback] Načtení kurtů ze Supabase selhalo, používám fallback data.', { endpoint: error.endpoint, status: error.status, response: error.responseBody, }); return; } console.error('[DEV fallback] Načtení kurtů ze Supabase selhalo, používám fallback data.', error); }} loadCourts(); return () => { active = false; }; }, []);

  const reservationsReloadRequestRef = useRef(0);

  const reloadReservations = useCallback(async (date: string, accessToken?: string | null) => {
    const requestId = ++reservationsReloadRequestRef.current;

    if (process.env.NODE_ENV === 'development') {
      console.info('reservation reload started', { date, requestId });
    }

    try {
      const loadedReservations = await getReservationsReadOnly(date, accessToken);

      if (requestId !== reservationsReloadRequestRef.current) {
        return;
      }

      setReservations(loadedReservations);
      setReservationsSourceMode('supabase');

      if (process.env.NODE_ENV === 'development') {
        console.info('reservation grid loaded public occupancy', { date, requestId, count: loadedReservations.length });
      }
    } catch (error) {
      if (requestId !== reservationsReloadRequestRef.current) {
        return;
      }

      setReservations(fallbackReservations.filter((reservation) => reservation.date === date));
      setReservationsSourceMode('mock fallback');

      if (process.env.NODE_ENV === 'development') {
        console.warn('[DEV fallback] public occupancy request failed, používám fallback data', { date, requestId, error });
      }
    }
  }, []);

  useEffect(() => {
    void reloadReservations(selectedDate, sessionToken);
  }, [reloadReservations, selectedDate, sessionToken]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.info('reservation page passing reservations to grid', { count: reservations.length, sample: reservations.slice(0, 3) });
    }
  }, [reservations]);

  const gridSelection = selectionReady ? { courtId: Number(courtId), timeFrom, timeTo } : null;

  if (process.env.NODE_ENV === 'development') {
    console.info('reservation page grid selection debug', {
      selectedCourtId: courtId,
      selectedTimeFrom: timeFrom,
      selectedTimeTo: timeTo,
      selection: gridSelection,
    });
  }

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


  useEffect(() => {
    if (!selectionReady) {
      setAvailabilityWarning(null);
      return;
    }

    let active = true;

    async function runAvailabilityCheck() {
      if (process.env.NODE_ENV === 'development') {
        console.info('reservation availability check started');
      }

      try {
        const isAvailable = await checkReservationSlotAvailability({
          courtId: Number(courtId),
          reservationDate: selectedDate,
          timeFrom,
          timeTo,
        });

        if (!active) return;

        if (isAvailable) {
          if (process.env.NODE_ENV === 'development') {
            console.info('reservation availability free');
          }
          setAvailabilityWarning(null);
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.info('reservation availability conflict');
        }
        setAvailabilityWarning('Vybraný termín je pravděpodobně obsazen.');
      } catch (error) {
        if (!active) return;
        if (process.env.NODE_ENV === 'development') {
          console.error('availability check failed', error);
        }
        setAvailabilityWarning(null);
      }
    }

    runAvailabilityCheck();

    return () => {
      active = false;
    };
  }, [courtId, selectedDate, selectionReady, timeFrom, timeTo]);
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

    if (isSlotOccupiedByPublicReservations({
      reservations,
      courtId: Number(courtId),
      date: selectedDate,
      timeFrom,
      timeTo,
    })) {
      setSubmitError('Kolize rezervace. Vybraný termín je už obsazen.');
      return;
    }

    try {
      await createReservation({ accessToken: sessionToken, userId: sessionUserId, courtId: Number(courtId), reservationDate: selectedDate, timeFrom, timeTo, note });
      await reloadReservations(selectedDate, sessionToken);
      setSubmitMessage('Rezervace vytvořena.');
    } catch (error) {
      if (error instanceof ReservationConflictError) {
        setSubmitError('Kolize rezervace. Vybraný termín je už obsazen.');
        return;
      }
      if (error instanceof ReservationUnauthorizedError) {
        setSubmitError('Chyba oprávnění. Nemáte právo vytvořit tuto rezervaci.');
        return;
      }
      if (error instanceof ReservationValidationError) {
        setSubmitError('Zadané údaje rezervace nejsou platné. Zkontrolujte prosím termín.');
        return;
      }
      setSubmitError('Rezervaci se nepodařilo vytvořit. Zkuste to prosím znovu.');
    }
  }

  return <div className="space-y-3 pb-32">{/* ... */}
    <div className="mb-1 flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h1 className="text-2xl font-bold tracking-tight">Rezervace kurtů</h1><p className="text-slate-600">Denní přehled všech 3 kurtů na jednom místě.</p></div><div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><div>Datum: <span className="font-semibold">{formattedSelectedDate}</span></div><label className="flex flex-col gap-1 text-xs font-medium text-slate-600" htmlFor="reservation-day">Vyberte den<input id="reservation-day" type="date" lang="cs-CZ" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" /></label></div></div>
    {showDevFallbackWarning && (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        DEV upozornění: čtení ze Supabase selhalo a stránka používá mock fallback data.
      </p>
    )}
    <ReservationGrid selectedDate={selectedDate} courts={courts} reservations={reservations} selection={gridSelection} onSelectionChange={(selection: { courtId: number; timeFrom: string; timeTo: string } | null) => {
      if (!selection) {
        setSelectionReady(false);
        return;
      }

      setCourtId(String(selection.courtId));
      setTimeFrom(selection.timeFrom);
      setTimeTo(selection.timeTo);
      setSelectionReady(true);
    }} />
    <form onSubmit={handleCreateReservation} className="sticky bottom-2 z-20 mx-auto grid w-full max-w-6xl gap-3 rounded-2xl border border-slate-200 bg-white/95 p-2.5 text-sm shadow-lg shadow-slate-900/10 backdrop-blur md:grid-cols-[minmax(240px,1fr)_minmax(320px,1.4fr)_auto] md:items-end">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500">Souhrn výběru</p>
        <div className={`flex min-h-10 items-center rounded-xl border px-3 ${selectionReady ? 'border-blue-200 bg-blue-50/70' : 'border-slate-200 bg-white'}`}>
          <p className={`truncate text-sm ${selectionReady ? 'font-semibold text-slate-950' : 'text-slate-600'}`}>
            {reservationSummary}
          </p>
        </div>
      </div>

      {isAuthenticated ? (
        <label className="flex min-w-0 flex-col text-xs font-semibold tracking-wide text-slate-500">
          <span className="mb-1">Poznámka</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
          />
        </label>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pro dokončení rezervace se nejdřív přihlaste. Vybraný termín uvidíte dál v souhrnu.
        </p>
      )}

      {isAuthenticated ? (
        <button
          type="submit"
          disabled={!selectionReady || Boolean(availabilityWarning)}
          className="h-10 self-end rounded-xl bg-blue-600 px-5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          Rezervovat vybraný termín
        </button>
      ) : (
        <a
          href="/prihlaseni"
          className="inline-flex h-10 items-center justify-center self-end rounded-xl bg-blue-600 px-5 font-semibold text-white transition hover:bg-blue-700"
        >
          Přihlásit se a rezervovat
        </a>
      )}

      {submitMessage && <p className="md:col-span-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{submitMessage}</p>}
      {availabilityWarning && (
        <p role="status" aria-live="polite" className="md:col-span-3 rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 font-medium text-amber-950 shadow-sm">
          {availabilityWarning} Vyberte prosím jiný volný termín.
        </p>
      )}
      {submitError && <p className="md:col-span-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{submitError}</p>}
    </form>
  </div>;
}
