"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getQuickReservationCourtHoursLabel, getQuickReservationSummaryLabel, shouldRenderQuickStatusCards } from '@/lib/services/reservation-overview-ui';
import { getCourtsReadOnly, getReservationsReadOnly } from '@/lib/services/read-only';
import { getUpcomingTournaments, type Tournament } from '@/lib/tournaments';
import { supabaseAuthClient, type AuthSession } from '@/lib/supabase/auth-client';
import type { Court, Reservation } from '@/lib/types/domain';

type DayReservationSummary = {
  date: string;
  reservationsCount: number;
  courtNames: string[];
  reservationCourtHoursLabel: string | null;
  totalReservedHours: number;
};

const QUICK_STATUS_DAYS = 3;

function getTodayLocalDate() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const parsedDate = new Date(`${date}T00:00:00`);
  parsedDate.setDate(parsedDate.getDate() + days);
  const timezoneOffsetMs = parsedDate.getTimezoneOffset() * 60_000;
  return new Date(parsedDate.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function formatCzechDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsedDate);
}

function formatCzechDayLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  }).format(parsedDate);
}

function createEmptySummaries() {
  const today = getTodayLocalDate();

  return Array.from({ length: QUICK_STATUS_DAYS }, (_, index) => ({
    date: addDays(today, index),
    reservationsCount: 0,
    courtNames: [],
    reservationCourtHoursLabel: null,
    totalReservedHours: 0,
  }));
}

function getCourtNamesById(courts: Court[]) {
  return new Map(courts.map((court) => [court.id, court.name]));
}

function getReservedCourtNames(reservations: Reservation[], courtNamesById: Map<number, string>) {
  const reservedCourtNames = reservations.map((reservation) => courtNamesById.get(reservation.courtId) ?? `Kurt #${reservation.courtId}`);

  return [...new Set(reservedCourtNames)].sort((left, right) => left.localeCompare(right, 'cs'));
}

function getStatusTone(summary: DayReservationSummary) {
  if (summary.reservationsCount === 0) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }

  if (summary.courtNames.length >= 3) {
    return 'border-amber-200 bg-amber-50 text-amber-950';
  }

  return 'border-blue-200 bg-blue-50 text-blue-950';
}

export function HomePage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [quickStatus, setQuickStatus] = useState<DayReservationSummary[]>([]);
  const [isQuickStatusLoading, setIsQuickStatusLoading] = useState(true);
  const [quickStatusError, setQuickStatusError] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isTournamentsLoading, setIsTournamentsLoading] = useState(true);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  const isAuthenticated = Boolean(session);

  const quickStatusDescription = useMemo(
    () => `Nejbližší ${QUICK_STATUS_DAYS} dny ukazují počet rezervací, celkový čas a obsazenost podle kurtů. Detailní volné časy najdete v přehledu rezervací.`,
    [],
  );

  useEffect(() => {
    supabaseAuthClient.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabaseAuthClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadQuickStatus() {
      setIsQuickStatusLoading(true);
      setQuickStatusError(null);

      const emptySummaries = createEmptySummaries();

      try {
        const courts = await getCourtsReadOnly();
        const reservationsByDay = await Promise.all(
          emptySummaries.map((summary) => getReservationsReadOnly(summary.date)),
        );

        if (!active) return;

        const courtNamesById = getCourtNamesById(courts);

        setQuickStatus(emptySummaries.map((summary, index) => {
          const reservations = reservationsByDay[index];

          return {
            ...summary,
            reservationsCount: reservations.length,
            courtNames: getReservedCourtNames(reservations, courtNamesById),
            reservationCourtHoursLabel: getQuickReservationCourtHoursLabel(reservations, courtNamesById),
            totalReservedHours: reservations.reduce((sum, reservation) => sum + Math.max(0, reservation.toHour - reservation.fromHour), 0),
          };
        }));
      } catch (error) {
        if (!active) return;

        console.warn('homepage quick reservation status unavailable', error);
        setQuickStatus([]);
        setQuickStatusError('Rychlý stav se teď nepodařilo načíst. Rezervace samotné jsou dostupné v detailním přehledu.');
      } finally {
        if (active) {
          setIsQuickStatusLoading(false);
        }
      }
    }

    void loadQuickStatus();

    return () => {
      active = false;
    };
  }, []);


  useEffect(() => {
    let active = true;

    async function loadTournaments() {
      setIsTournamentsLoading(true);

      try {
        const loadedTournaments = await getUpcomingTournaments();
        if (!active) return;
        setTournaments(loadedTournaments);
        setTournamentsError(null);
      } catch (error) {
        if (!active) return;
        console.warn('homepage tournaments unavailable', error);
        setTournaments([]);
        setTournamentsError('Turnaje se teď nepodařilo načíst. Zkuste to prosím později.');
      } finally {
        if (active) {
          setIsTournamentsLoading(false);
        }
      }
    }

    void loadTournaments();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-xl shadow-slate-900/5 backdrop-blur md:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/45 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-lime-200/35 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-5">
            <div className="space-y-4">
              <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold uppercase tracking-wide text-court ring-1 ring-emerald-100">Online rezervace kurtů</p>
              <h1 className="max-w-3xl text-4xl font-black tracking-tight text-slate-950 md:text-6xl">Tenisové kurty TJ Baník Stříbro</h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-700">Moderní a přehledný rezervační systém pro 3 venkovní antukové kurty. Vyberte den, volný kurt a odešlete rezervaci ke schválení.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/rezervace" className="inline-flex items-center justify-center rounded-xl bg-court px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-green-700">
                Rezervovat kurt
              </Link>
              {isAuthenticated ? (
                <Link href="/moje-rezervace" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white/90 px-6 py-3 font-semibold text-slate-800 transition hover:border-court hover:text-court">
                  Moje rezervace
                </Link>
              ) : (
                <Link href="/prihlaseni" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white/90 px-6 py-3 font-semibold text-slate-800 transition hover:border-court hover:text-court">
                  Přihlásit se
                </Link>
              )}
            </div>
          </div>

          <aside className="rounded-3xl border border-white bg-white/90 p-5 shadow-xl shadow-slate-900/10">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Rychlý stav rezervací</h2>
                <p className="mt-1 text-sm text-slate-600">{quickStatusDescription}</p>
              </div>
              {isQuickStatusLoading && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Načítám…</span>}
            </div>
            {quickStatusError && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{quickStatusError}</p>}
            <div className="space-y-2">
              {quickStatus.length === 0 && isQuickStatusLoading && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  Aktuální stav rezervací se načítá.
                </div>
              )}
              {shouldRenderQuickStatusCards({ isLoading: isQuickStatusLoading, hasError: Boolean(quickStatusError), count: quickStatus.length }) && quickStatus.map((summary) => (
                <div key={summary.date} className={`rounded-xl border px-3 py-3 ${getStatusTone(summary)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold capitalize">{formatCzechDayLabel(summary.date)}</p>
                    <p className="text-sm font-medium">{getQuickReservationSummaryLabel(summary.reservationsCount, summary.totalReservedHours)}</p>
                  </div>
                  <p className="mt-1 text-sm opacity-85">
                    {summary.reservationCourtHoursLabel ?? 'V systému zatím nejsou žádné rezervace pro tento den.'}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-6 shadow-lg shadow-emerald-900/5 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-court">Turnaje a uzavírky kurtů</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Blížící se turnaje</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-700">V den turnaje jsou kurty blokované centrálně pořadatelem. Běžné rezervace pro hráče proto zůstávají dostupné jen mimo vyhlášený termín.</p>
          </div>
          <Link href="/rezervace" className="inline-flex items-center justify-center rounded-md border border-court bg-white px-4 py-2 text-sm font-semibold text-court transition hover:bg-emerald-50">
            Zkontrolovat volné termíny
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          {tournamentsError ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:col-span-2">{tournamentsError}</p>
          ) : null}
          {isTournamentsLoading ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:col-span-2">Načítám turnaje…</p>
          ) : null}
          {!isTournamentsLoading && tournaments.length === 0 && !tournamentsError ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:col-span-2">Momentálně nejsou vypsané žádné blížící se turnaje.</p>
          ) : null}
          {!isTournamentsLoading && tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              href={`/rezervace?datum=${encodeURIComponent(tournament.date)}`}
              aria-label={`Zobrazit turnaj ${tournament.title} v rezervacích`}
              className="group grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-court hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-court focus-visible:ring-offset-2 sm:grid-cols-[minmax(240px,0.9fr)_1fr] lg:col-span-2"
            >
              <div className={`relative min-h-72 overflow-hidden bg-gradient-to-br ${tournament.accent} p-5 text-white sm:min-h-full`}>
                {tournament.posterUrl ? <div aria-label={`Plakát turnaje ${tournament.title}`} role="img" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${tournament.posterUrl})` }} /> : null}
                {tournament.posterUrl ? <div className="absolute inset-0 bg-emerald-950/45" /> : null}
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-white/30" />
                <div className="absolute -bottom-12 left-8 h-40 w-40 rounded-full bg-white/10" />
                <div className="relative flex h-full min-h-60 flex-col justify-between rounded-xl border border-white/25 bg-white/10 p-4 shadow-inner backdrop-blur-sm">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Náhled plakátu</p>
                    <h3 className="mt-4 text-2xl font-black uppercase leading-tight tracking-tight">{tournament.title}</h3>
                  </div>
                  <div>
                    <p className="text-4xl font-black leading-none">{new Date(`${tournament.date}T00:00:00`).getDate()}.</p>
                    <p className="text-lg font-bold uppercase">{formatCzechDateLabel(tournament.date).replace(/^\d+\.\s*/, '')}</p>
                    <p className="mt-3 rounded-full bg-white px-3 py-1 text-center text-sm font-bold text-emerald-700">TJ Baník Stříbro</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <p className="text-sm font-semibold text-court">{formatCzechDateLabel(tournament.date)} · {tournament.time}</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">{tournament.title}</h3>
                  <p className="mt-2 text-sm text-slate-700">{tournament.description}</p>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Obsazenost</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{tournament.courts}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Přihlášky</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">{tournament.registration}</dd>
                  </div>
                </dl>
                <p className="inline-flex items-center text-sm font-semibold text-court transition group-hover:translate-x-1">
                  Otevřít termín v rezervacích →
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
