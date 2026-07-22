"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMyReservationsReadOnly, type ReservationOverview } from '@/lib/services/read-only';
import { cancelMyReservation, getMyReservationsFeedbackOnReload, isMyReservationCancelable, isMyReservationUpcoming } from '@/lib/services/my-reservations';
import { ReservationNoLongerPendingError, ReservationUnauthorizedError } from '@/lib/services/supabase-error-mapping';
import { supabaseAuthClient } from '@/lib/supabase/auth-client';
import { getAriaBusy, getAriaDisabled, getReservationStatusLabel } from '@/lib/services/reservation-overview-ui';

function formatDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;
  return new Intl.DateTimeFormat('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsedDate);
}

function formatCreatedAt(value: string | null) {
  if (!value) return '—';
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return '—';
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate);
}

function formatReservationNote(note: string | null) {
  return note?.trim() || '—';
}

const reservationListScrollClassName = 'max-h-[34rem] space-y-3 overflow-y-auto pr-1';

const statusBadgeClasses: Record<ReservationOverview['status'], string> = {
  waiting_for_payment: 'border-sky-200 bg-sky-50 text-sky-800',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-800',
};

function getStatusBadgeClass(status: ReservationOverview['status']) {
  return statusBadgeClasses[status];
}

export default function MyReservationsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationOverview[]>([]);
  const [cancelingReservationId, setCancelingReservationId] = useState<string | null>(null);

  async function loadMyReservations(options?: { activeGuard?: { active: boolean }; preserveSuccessMessage?: string | null }) {
    setIsLoading(true);
    const nextFeedback = getMyReservationsFeedbackOnReload({
      currentSuccessMessage: successMessage,
      preservedSuccessMessage: options?.preserveSuccessMessage,
    });
    setErrorMessage(nextFeedback.errorMessage);
    setSuccessMessage(nextFeedback.successMessage);

    try {
      const { data } = await supabaseAuthClient.auth.getSession();
      const loadedReservations = await getMyReservationsReadOnly(data.session ?? null);

      if (options?.activeGuard && !options.activeGuard.active) return;
      setReservations(loadedReservations);
      setIsAuthorized(true);
    } catch (loadError) {
      if (options?.activeGuard && !options.activeGuard.active) return;

      if (loadError instanceof ReservationUnauthorizedError) {
        setIsAuthorized(false);
        return;
      }

      setErrorMessage('Načtení rezervací se nepodařilo. Zkuste to prosím později.');
    } finally {
      if (!options?.activeGuard || options.activeGuard.active) setIsLoading(false);
    }
  }

  useEffect(() => {
    const activeGuard = { active: true };
    void loadMyReservations({ activeGuard });

    return () => {
      activeGuard.active = false;
    };
  }, []);

  async function handleCancelReservation(reservation: ReservationOverview) {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isMyReservationCancelable(reservation)) {
      setErrorMessage('Rezervaci už není možné zrušit.');
      return;
    }

    setCancelingReservationId(reservation.id);

    try {
      const { data } = await supabaseAuthClient.auth.getSession();
      await cancelMyReservation({ session: data.session ?? null, reservationId: reservation.id });
      const preservedSuccessMessage = 'Rezervace byla zrušena.';
      setSuccessMessage(preservedSuccessMessage);
      await loadMyReservations({ preserveSuccessMessage: preservedSuccessMessage });
    } catch (cancelError) {
      if (cancelError instanceof ReservationNoLongerPendingError) {
        setErrorMessage('Rezervaci už není možné zrušit.');
        await loadMyReservations();
        return;
      }

      if (cancelError instanceof ReservationUnauthorizedError) {
        setErrorMessage('Nemáte oprávnění zrušit tuto rezervaci.');
        return;
      }

      setErrorMessage('Rezervaci se nepodařilo zrušit.');
    } finally {
      setCancelingReservationId(null);
    }
  }

  if (isLoading) {
    return <div aria-busy={getAriaBusy(isLoading)} className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Načítání rezervací...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h1 className="text-2xl font-bold text-slate-900">Moje rezervace</h1>
        <p>Pro zobrazení vašich rezervací se musíte přihlásit.</p>
        <Link href="/prihlaseni" className="inline-flex rounded-md border border-amber-300 bg-white px-3 py-2 text-amber-900 hover:bg-amber-100">
          Přejít na přihlášení
        </Link>
      </div>
    );
  }

  const upcomingReservations = reservations.filter((reservation) => isMyReservationUpcoming(reservation));
  const reservationHistory = reservations.filter((reservation) => !isMyReservationUpcoming(reservation));

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Moje rezervace</h1>
      {successMessage && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{successMessage}</p>}
      {errorMessage && <p role="status" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{errorMessage}</p>}
      <div className="space-y-6 lg:hidden">
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Nadcházející rezervace</h2>
            <p className="text-sm text-slate-600">Schválené a čekající rezervace, které vás teprve čekají.</p>
          </div>
          <div className={reservationListScrollClassName}>
            {upcomingReservations.map((reservation) => (
          <article key={`mobile-${reservation.id}`} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Termín</p>
                <p className="mt-1 font-semibold text-slate-900">{formatDate(reservation.reservationDate)}</p>
                <p className="text-sm text-slate-600">{reservation.timeFrom}–{reservation.timeTo}</p>
              </div>
              <span className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(reservation.status)}`}>
                {getReservationStatusLabel(reservation.status)}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Kurt</dt>
                <dd className="mt-0.5 min-w-0 break-words font-medium text-slate-900">{reservation.courtName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Vytvořeno</dt>
                <dd className="mt-0.5 text-slate-900">{formatCreatedAt(reservation.createdAt)}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-slate-500">Poznámka</dt>
                <dd className="mt-0.5 break-words text-slate-900">{formatReservationNote(reservation.note)}</dd>
              </div>
            </dl>

            {isMyReservationCancelable(reservation) ? (
              <button
                type="button"
                onClick={() => void handleCancelReservation(reservation)}
                disabled={cancelingReservationId === reservation.id}
                aria-disabled={getAriaDisabled(cancelingReservationId === reservation.id)}
                className="min-h-11 w-full rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelingReservationId === reservation.id ? 'Ruším...' : 'Zrušit rezervaci'}
              </button>
            ) : null}
          </article>
            ))}
          </div>
          {upcomingReservations.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
              Nemáte žádné nadcházející rezervace.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Historie rezervací</h2>
            <p className="text-sm text-slate-600">Uplynulé nebo zrušené rezervace pro rychlou kontrolu zpětně.</p>
          </div>
          <div className={reservationListScrollClassName}>
            {reservationHistory.map((reservation) => (
          <article key={`mobile-history-${reservation.id}`} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Termín</p>
                <p className="mt-1 font-semibold text-slate-900">{formatDate(reservation.reservationDate)}</p>
                <p className="text-sm text-slate-600">{reservation.timeFrom}–{reservation.timeTo}</p>
              </div>
              <span className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(reservation.status)}`}>
                {getReservationStatusLabel(reservation.status)}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Kurt</dt>
                <dd className="mt-0.5 min-w-0 break-words font-medium text-slate-900">{reservation.courtName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Vytvořeno</dt>
                <dd className="mt-0.5 text-slate-900">{formatCreatedAt(reservation.createdAt)}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-slate-500">Poznámka</dt>
                <dd className="mt-0.5 break-words text-slate-900">{formatReservationNote(reservation.note)}</dd>
              </div>
            </dl>
          </article>
            ))}
          </div>
          {reservationHistory.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
              Historie rezervací je zatím prázdná.
            </p>
          )}
        </section>
      </div>

      <div className="hidden space-y-6 lg:block">
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Nadcházející rezervace</h2>
            <p className="text-sm text-slate-600">Schválené a čekající rezervace, které vás teprve čekají.</p>
          </div>
          <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Čas od</th>
                  <th className="px-3 py-2">Čas do</th>
                  <th className="px-3 py-2">Kurt</th>
                  <th className="px-3 py-2">Stav</th>
                  <th className="px-3 py-2">Poznámka</th>
                  <th className="px-3 py-2">Vytvořeno</th>
                  <th className="px-3 py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {upcomingReservations.map((reservation) => (
                  <tr key={`upcoming-${reservation.id}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{formatDate(reservation.reservationDate)}</td>
                    <td className="px-3 py-2">{reservation.timeFrom}</td>
                    <td className="px-3 py-2">{reservation.timeTo}</td>
                    <td className="px-3 py-2">{reservation.courtName}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(reservation.status)}`}>
                        {getReservationStatusLabel(reservation.status)}
                      </span>
                    </td>
                    <td className="max-w-[16rem] px-3 py-2"><span className="block truncate" title={formatReservationNote(reservation.note)}>{formatReservationNote(reservation.note)}</span></td>
                    <td className="px-3 py-2">{formatCreatedAt(reservation.createdAt)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void handleCancelReservation(reservation)}
                        disabled={cancelingReservationId === reservation.id}
                        aria-disabled={getAriaDisabled(cancelingReservationId === reservation.id)}
                        className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cancelingReservationId === reservation.id ? 'Ruším...' : 'Zrušit'}
                      </button>
                    </td>
                  </tr>
                ))}
                {upcomingReservations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-slate-500">Nemáte žádné nadcházející rezervace.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Historie rezervací</h2>
            <p className="text-sm text-slate-600">Uplynulé nebo zrušené rezervace pro rychlou kontrolu zpětně.</p>
          </div>
          <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Čas od</th>
                  <th className="px-3 py-2">Čas do</th>
                  <th className="px-3 py-2">Kurt</th>
                  <th className="px-3 py-2">Stav</th>
                  <th className="px-3 py-2">Poznámka</th>
                  <th className="px-3 py-2">Vytvořeno</th>
                </tr>
              </thead>
              <tbody>
                {reservationHistory.map((reservation) => (
                  <tr key={`history-${reservation.id}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{formatDate(reservation.reservationDate)}</td>
                    <td className="px-3 py-2">{reservation.timeFrom}</td>
                    <td className="px-3 py-2">{reservation.timeTo}</td>
                    <td className="px-3 py-2">{reservation.courtName}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(reservation.status)}`}>
                        {getReservationStatusLabel(reservation.status)}
                      </span>
                    </td>
                    <td className="max-w-[16rem] px-3 py-2"><span className="block truncate" title={formatReservationNote(reservation.note)}>{formatReservationNote(reservation.note)}</span></td>
                    <td className="px-3 py-2">{formatCreatedAt(reservation.createdAt)}</td>
                  </tr>
                ))}
                {reservationHistory.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-slate-500">Historie rezervací je zatím prázdná.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
