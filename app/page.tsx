"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getCourtsReadOnly, getReservationsReadOnly } from '@/lib/services/read-only';
import { supabaseAuthClient, type AuthSession } from '@/lib/supabase/auth-client';
import type { Court, Reservation } from '@/lib/types/domain';

type DayReservationSummary = {
  date: string;
  reservationsCount: number;
  courtNames: string[];
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
  }));
}

function getReservedCourtNames(reservations: Reservation[], courts: Court[]) {
  const courtNamesById = new Map(courts.map((court) => [court.id, court.name]));
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

export default function HomePage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [quickStatus, setQuickStatus] = useState<DayReservationSummary[]>(createEmptySummaries);
  const [isQuickStatusLoading, setIsQuickStatusLoading] = useState(true);
  const [quickStatusError, setQuickStatusError] = useState<string | null>(null);
  const isAuthenticated = Boolean(session);

  const quickStatusDescription = useMemo(
    () => `Nejbližší ${QUICK_STATUS_DAYS} dny ukazují rychlou orientaci, jestli už jsou v systému rezervace. Detailní volné časy najdete v přehledu rezervací.`,
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

        setQuickStatus(emptySummaries.map((summary, index) => ({
          ...summary,
          reservationsCount: reservationsByDay[index].length,
          courtNames: getReservedCourtNames(reservationsByDay[index], courts),
        })));
      } catch (error) {
        if (!active) return;

        console.warn('homepage quick reservation status unavailable', error);
        setQuickStatus(emptySummaries);
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

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-court">Online rezervace kurtů</p>
            <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Tenisové kurty TJ Baník Stříbro</h1>
            <p className="max-w-2xl text-slate-700">Moderní a přehledný rezervační systém pro 3 venkovní antukové kurty. Vyberte den, volný kurt a odešlete rezervaci ke schválení.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/rezervace" className="inline-flex items-center justify-center rounded-md bg-court px-5 py-2.5 font-semibold text-white transition hover:bg-green-700">
              Rezervovat kurt
            </Link>
            {isAuthenticated ? (
              <Link href="/moje-rezervace" className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-800 transition hover:border-court hover:text-court">
                Moje rezervace
              </Link>
            ) : (
              <Link href="/prihlaseni" className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-800 transition hover:border-court hover:text-court">
                Přihlásit se
              </Link>
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Rychlý stav rezervací</h2>
              <p className="mt-1 text-sm text-slate-600">{quickStatusDescription}</p>
            </div>
            {isQuickStatusLoading && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Načítám…</span>}
          </div>
          {quickStatusError && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{quickStatusError}</p>}
          <div className="space-y-2">
            {quickStatus.map((summary) => (
              <div key={summary.date} className={`rounded-xl border px-3 py-3 ${getStatusTone(summary)}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold capitalize">{formatCzechDayLabel(summary.date)}</p>
                  <p className="text-sm font-medium">{summary.reservationsCount === 0 ? 'Zatím volno' : `${summary.reservationsCount} rezervací`}</p>
                </div>
                <p className="mt-1 text-sm opacity-85">
                  {summary.courtNames.length > 0 ? `Rezervace: ${summary.courtNames.join(', ')}` : 'V systému zatím nejsou žádné rezervace pro tento den.'}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-950">Jak rezervace funguje</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ['1', 'Vyberte den', 'V přehledu rezervací zvolte datum, které vám vyhovuje.'],
            ['2', 'Vyberte kurt a čas', 'Klikněte na volný blok v denním přehledu všech kurtů.'],
            ['3', 'Přihlaste se a potvrďte', 'Po přihlášení odešlete rezervaci a vyčkejte na schválení.'],
          ].map(([step, title, description]) => (
            <article key={step} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-court text-sm font-bold text-white">{step}</div>
              <h3 className="font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Informace o kurtech</h2><p className="mt-2 text-sm text-slate-600">3 antukové venkovní kurty, adresa Palackého 1269, Stříbro.</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Rezervace pod kontrolou</h2><p className="mt-2 text-sm text-slate-600">Přihlášení uživatelé najdou své termíny v sekci Moje rezervace.</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Přehled pro každý den</h2><p className="mt-2 text-sm text-slate-600">Denní rozvrh ukazuje obsazenost všech kurtů a pomáhá rychle najít vhodný čas.</p></article>
      </section>
    </div>
  );
}
