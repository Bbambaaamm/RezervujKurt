"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ReservationGrid } from '@/components/reservation-grid';
import { courts as fallbackCourts, mockReservations as fallbackReservations } from '@/lib/mockData';
import { checkReservationSlotAvailability, createReservation } from '@/lib/services/reservations';
import { ReservationConflictError, ReservationUnauthorizedError, ReservationValidationError } from '@/lib/services/supabase-error-mapping';
import { getCourtsReadOnly, getReservationsReadOnly } from '@/lib/services/read-only';
import { supabaseAuthClient } from '@/lib/supabase/auth-client';
import { SupabaseRequestError } from '@/lib/supabase/client';
import { isReservationStartInPast, getPragueTodayDate } from '@/lib/services/reservation-time';
import { isSlotOccupiedByPublicReservations } from '@/lib/services/reservation-submit-guard';
import { canUseReservationMockFallback, getReservationAvailabilityLoadErrorMessage, getReservationAvailabilityPrecheckErrorMessage, shouldBlockReservationSubmit } from '@/lib/services/reservation-availability-safety';
import { getTournamentBlocksForCourtsFromList, getTournamentsForDate, isTournamentDateBlocked, type Tournament } from '@/lib/tournaments';
import type { Court, Reservation } from '@/lib/types/domain';

type DataSourceMode = 'supabase' | 'mock fallback';

function formatCzechDate(date: string) { /* unchanged */
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return 'Neplatné datum';
  return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(parsedDate);
}

function getTodayLocalDate() {
  return getPragueTodayDate();
}

function getDateFromSearchParams(search: string) {
  const dateFromUrl = new URLSearchParams(search).get('datum');

  return dateFromUrl && /^\d{4}-\d{2}-\d{2}$/.test(dateFromUrl) ? dateFromUrl : null;
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
  const [reservationsLoadError, setReservationsLoadError] = useState<string | null>(null);
  const [selectedTournaments, setSelectedTournaments] = useState<Tournament[]>([]);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const formattedSelectedDate = useMemo(() => formatCzechDate(selectedDate), [selectedDate]);
  const selectedTournament = selectedTournaments[0] ?? null;
  const displayedReservations = useMemo(
    () => [...reservations, ...getTournamentBlocksForCourtsFromList(selectedTournaments, courts)],
    [courts, reservations, selectedTournaments],
  );
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
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const dateFromUrl = getDateFromSearchParams(window.location.search);
    if (dateFromUrl) setSelectedDate(dateFromUrl);
  }, []);

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
      setReservationsLoadError(null);

      if (process.env.NODE_ENV === 'development') {
        console.info('reservation grid loaded public occupancy', { date, requestId, count: loadedReservations.length });
      }
    } catch (error) {
      if (requestId !== reservationsReloadRequestRef.current) {
        return;
      }

      if (canUseReservationMockFallback(process.env.NODE_ENV)) {
        setReservations(fallbackReservations.filter((reservation) => reservation.date === date));
        setReservationsSourceMode('mock fallback');
        setReservationsLoadError(null);
        console.warn('[DEV fallback] public occupancy request failed, používám fallback data', { date, requestId, error });
        return;
      }

      setReservations([]);
      setReservationsSourceMode('supabase');
      setReservationsLoadError(getReservationAvailabilityLoadErrorMessage());
      setSelectionReady(false);
      console.error('public occupancy request failed, rezervace jsou zablokované do ověření dostupnosti', { date, requestId, error });
    }
  }, []);

  useEffect(() => {
    void reloadReservations(selectedDate, sessionToken);
  }, [reloadReservations, selectedDate, sessionToken]);


  useEffect(() => {
    let active = true;

    async function loadSelectedTournaments() {
      try {
        const loadedTournaments = await getTournamentsForDate(selectedDate);
        if (!active) return;
        setSelectedTournaments(loadedTournaments);
      } catch (error) {
        if (!active) return;
        console.warn('selected date tournaments unavailable', { selectedDate, error });
        setSelectedTournaments([]);
      }
    }

    void loadSelectedTournaments();

    return () => {
      active = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.info('reservation page passing reservations to grid', { count: reservations.length, sample: reservations.slice(0, 3) });
    }
  }, [reservations]);

  const selectedStartIsPast = selectionReady && isReservationStartInPast(selectedDate, timeFrom, currentTime);
  const gridSelection = selectionReady && !selectedStartIsPast ? { courtId: Number(courtId), timeFrom, timeTo } : null;

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

    if (selectedStartIsPast) {
      setAvailabilityWarning('Vybraný termín už začal nebo proběhl.');
      return;
    }

    let active = true;

    async function runAvailabilityCheck() {
      if (process.env.NODE_ENV === 'development') {
        console.info('reservation availability check started');
      }

      try {
        if (isTournamentDateBlocked(selectedDate, selectedTournaments)) {
          if (!active) return;
          setAvailabilityWarning('Vybraný den je vyhrazený pro turnaj a běžné rezervace jsou blokované.');
          return;
        }

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
        setAvailabilityWarning(getReservationAvailabilityPrecheckErrorMessage());
      }
    }

    runAvailabilityCheck();

    return () => {
      active = false;
    };
  }, [courtId, selectedDate, selectedStartIsPast, selectedTournaments, selectionReady, timeFrom, timeTo]);
  async function handleCreateReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage(null);
    setSubmitError(null);

    if (!selectionReady) {
      setSubmitError('Nejdřív vyberte volný termín v přehledu kurtů.');
      return;
    }

    const submitTime = new Date();
    setCurrentTime(submitTime);

    if (isReservationStartInPast(selectedDate, timeFrom, submitTime)) {
      setSubmitError('Vybraný termín už začal nebo proběhl. Vyberte prosím budoucí čas.');
      return;
    }

    if (isTournamentDateBlocked(selectedDate, selectedTournaments)) {
      setSubmitError('Vybraný den je vyhrazený pro turnaj a běžné rezervace jsou blokované.');
      return;
    }

    if (reservationsLoadError) {
      setSubmitError(reservationsLoadError);
      return;
    }

    if (!sessionToken || !sessionUserId) {
      setSubmitError('Uživatel není přihlášen. Pro vytvoření rezervace se prosím přihlaste.');
      return;
    }

    try {
      const isAvailable = await checkReservationSlotAvailability({
        courtId: Number(courtId),
        reservationDate: selectedDate,
        timeFrom,
        timeTo,
      });

      if (!isAvailable) {
        setSubmitError('Kolize rezervace. Vybraný termín je už obsazen.');
        return;
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('availability precheck before submit failed', error);
      }
      setSubmitError(getReservationAvailabilityPrecheckErrorMessage());
      return;
    }

    if (isSlotOccupiedByPublicReservations({
      reservations: displayedReservations,
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
    {reservationsLoadError && (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900">
        {reservationsLoadError} Rezervace je do ověření dostupnosti zablokovaná.
      </p>
    )}
    {selectedTournament && (
      <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
        {selectedTournament.title}: tento den jsou všechny kurty v aplikaci zablokované pro turnaj. Běžnou rezervaci prosím vyberte v jiném termínu.
      </p>
    )}
    <ReservationGrid selectedDate={selectedDate} courts={courts} reservations={displayedReservations} selection={gridSelection} now={currentTime} onSelectionChange={(selection: { courtId: number; timeFrom: string; timeTo: string } | null) => {
      if (reservationsLoadError) {
        setSelectionReady(false);
        setSubmitError(reservationsLoadError);
        return;
      }

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
          disabled={!selectionReady || selectedStartIsPast || shouldBlockReservationSubmit({ reservationsLoadError, availabilityWarning })}
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
