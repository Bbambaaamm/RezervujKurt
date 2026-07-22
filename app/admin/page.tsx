"use client";

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import {
  getPendingReservationsReadOnlyWithSession,
  getRecentReservationsReadOnlyWithSession,
  type ReservationOverview,
} from '@/lib/services/read-only';
import { ReservationNoLongerPendingError, ReservationUnauthorizedError, ReservationValidationError } from '@/lib/services/supabase-error-mapping';
import { resolveAdminGuardState } from '@/lib/services/admin-guard';
import { getCurrentUserRoleFromSession, type CurrentUserRole } from '@/lib/services/profile';
import { updateReservationStatus } from '@/lib/services/reservations';
import { createTournament, deleteTournament, getAdminTournaments, updateTournament, type Tournament, type TournamentFormInput } from '@/lib/tournaments';
import { supabaseAuthClient } from '@/lib/supabase/auth-client';
import { SupabaseRequestError } from '@/lib/supabase/client';
import { isMyReservationCancelable } from '@/lib/services/my-reservations';
import {
  getAriaBusy,
  getAriaDisabled,
  getReservationStatusLabel,
  getReservationUserLabel,
  getReservationUserRoleLabel,
  shouldRenderEmptyState,
  shouldRenderLoadingState,
} from '@/lib/services/reservation-overview-ui';
import { resolveStaleRecoveryAccessToken } from './stale-recovery';

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

function getErrorName(error: unknown) {
  if (error instanceof Error && error.name) return error.name;
  return 'UnknownError';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}


function formatReservationNote(note: string | null) {
  return note?.trim() || '—';
}

const recentReservationsLimit = 50;
const adminListScrollClassName = 'max-h-[34rem] overflow-y-auto pr-1';

const emptyTournamentForm: TournamentFormInput = {
  title: '',
  date: '',
  timeFrom: '08:00',
  timeTo: '18:00',
  posterUrl: '',
  posterFile: null,
  note: '',
};

const statusBadgeClasses: Record<ReservationOverview['status'], string> = {
  waiting_for_payment: 'border-sky-200 bg-sky-50 text-sky-800',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-800',
};

function getStatusBadgeClass(status: ReservationOverview['status']) {
  return statusBadgeClasses[status];
}

function canAdminCancelReservation(reservation: ReservationOverview) {
  return isMyReservationCancelable(reservation);
}


export default function AdminPage() {
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  const [userRole, setUserRole] = useState<CurrentUserRole>('anonymous');
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoadingById, setIsActionLoadingById] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationOverview[]>([]);
  const [recentReservations, setRecentReservations] = useState<ReservationOverview[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentForm, setTournamentForm] = useState<TournamentFormInput>(emptyTournamentForm);
  const [editedTournamentId, setEditedTournamentId] = useState<string | null>(null);
  const [tournamentMessage, setTournamentMessage] = useState<string | null>(null);
  const [isTournamentSaving, setIsTournamentSaving] = useState(false);

  useEffect(() => {
    let active = true;

    supabaseAuthClient.auth.getSession().then(async ({ data }) => {
      if (!active) return;

      try {
        const nextRole = await getCurrentUserRoleFromSession(data.session);
        if (!active) return;

        setUserRole(nextRole);

        if (nextRole === 'anonymous') {
          console.info('admin guard: anonymous');
        } else if (nextRole === 'admin') {
          console.info('admin guard: admin');
        } else if (nextRole === 'member') {
          console.info('admin guard: member');
        } else {
          console.info('admin guard: user');
        }

        if (process.env.NODE_ENV === 'development') {
          console.info('admin authorization verification passed', { state: resolveAdminGuardState(nextRole) });
        }
      } catch (guardError) {
        if (!active) return;
        setUserRole('anonymous');
        setError('Ověření přístupu do administrace selhalo. Zkuste to prosím znovu.');
        console.error('Admin guard check failed.', guardError);
      } finally {
        if (active) setIsSessionChecked(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isSessionChecked || userRole !== 'admin') {
      return;
    }

    let active = true;

    async function loadReservations() {
      setIsLoading(true);
      setError(null);

      try {
        const { data } = await supabaseAuthClient.auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken) {
          throw new ReservationUnauthorizedError('Pro zobrazení administrace je potřeba přihlášení.');
        }

        const [pendingResult, recentResult, tournamentsResult] = await Promise.allSettled([
          getPendingReservationsReadOnlyWithSession(accessToken),
          getRecentReservationsReadOnlyWithSession(accessToken, recentReservationsLimit),
          getAdminTournaments(accessToken),
        ]);
        if (!active) return;

        if (pendingResult.status === 'rejected') {
          throw pendingResult.reason;
        }

        if (recentResult.status === 'rejected') {
          throw recentResult.reason;
        }

        setReservations(pendingResult.value);
        setRecentReservations(recentResult.value);

        if (tournamentsResult.status === 'fulfilled') {
          setTournaments(tournamentsResult.value);
          setTournamentMessage(null);
        } else {
          setTournaments([]);
          setTournamentMessage('Turnaje se nepodařilo načíst. Rezervace v administraci zůstávají dostupné.');
          console.warn('Admin tournaments load failed.', tournamentsResult.reason);
        }

        if (process.env.NODE_ENV === 'development') {
          console.info('admin reservations loaded', { count: pendingResult.value.length });
        }
      } catch (loadError) {
        if (!active) return;
        setError('Načtení čekajících rezervací se nepodařilo. Zkuste to prosím později.');

        if (loadError instanceof SupabaseRequestError) {
          console.error('Admin pending reservations load failed.', {
            endpoint: loadError.endpoint,
            status: loadError.status,
            responseBody: loadError.responseBody,
            errorName: loadError.name,
            errorMessage: loadError.message,
          });
          return;
        }

        console.error('Admin pending reservations load failed.', {
          endpoint: 'n/a',
          status: 'n/a',
          responseBody: 'n/a',
          errorName: getErrorName(loadError),
          errorMessage: getErrorMessage(loadError),
        });
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadReservations();

    return () => {
      active = false;
    };
  }, [isSessionChecked, userRole]);

  async function reloadTournaments(accessToken: string) {
    setTournaments(await getAdminTournaments(accessToken));
  }

  function editTournament(tournament: Tournament) {
    setEditedTournamentId(tournament.id);
    setTournamentForm({
      title: tournament.title,
      date: tournament.date,
      timeFrom: `${String(Math.floor(tournament.blockFromHour)).padStart(2, '0')}:${tournament.blockFromHour % 1 === 0 ? '00' : '30'}`,
      timeTo: `${String(Math.floor(tournament.blockToHour)).padStart(2, '0')}:${tournament.blockToHour % 1 === 0 ? '00' : '30'}`,
      posterUrl: tournament.posterUrl ?? '',
      posterFile: null,
      note: tournament.note ?? '',
    });
  }

  async function handleTournamentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTournamentMessage(null);

    if (!tournamentForm.title.trim() || !tournamentForm.date || !tournamentForm.timeFrom || !tournamentForm.timeTo || tournamentForm.timeFrom >= tournamentForm.timeTo) {
      setTournamentMessage('Vyplňte název, datum a platný časový rozsah turnaje.');
      return;
    }

    setIsTournamentSaving(true);
    try {
      const { data } = await supabaseAuthClient.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new ReservationUnauthorizedError('Pro správu turnajů je potřeba přihlášení.');

      if (editedTournamentId) {
        await updateTournament(accessToken, editedTournamentId, tournamentForm);
      } else {
        await createTournament(accessToken, tournamentForm);
      }

      await reloadTournaments(accessToken);
      setTournamentForm(emptyTournamentForm);
      setEditedTournamentId(null);
      setTournamentMessage(editedTournamentId ? 'Turnaj byl upraven.' : 'Turnaj byl vytvořen.');
    } catch (tournamentError) {
      console.error('tournament save failed', tournamentError);
      setTournamentMessage(tournamentError instanceof Error ? tournamentError.message : 'Uložení turnaje se nepodařilo.');
    } finally {
      setIsTournamentSaving(false);
    }
  }

  async function handleTournamentDelete(id: string) {
    setTournamentMessage(null);
    try {
      const { data } = await supabaseAuthClient.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new ReservationUnauthorizedError('Pro správu turnajů je potřeba přihlášení.');
      await deleteTournament(accessToken, id);
      await reloadTournaments(accessToken);
      setTournamentMessage('Turnaj byl zrušen.');
    } catch (tournamentError) {
      console.error('tournament delete failed', tournamentError);
      setTournamentMessage('Zrušení turnaje se nepodařilo.');
    }
  }

  async function handleReservationAction(reservationId: string, action: 'approve' | 'cancel', options?: { fromStatuses?: Array<'pending' | 'approved'> }) {
    const status = action === 'approve' ? 'approved' : 'cancelled';
    const startedMessage = action === 'approve' ? 'admin approve started' : 'admin cancel started';
    const successMessage = action === 'approve' ? 'admin approve success' : 'admin cancel success';

    console.info(startedMessage, { reservationId });

    if (action === 'cancel') {
      const currentReservation = [...reservations, ...recentReservations].find((reservation) => reservation.id === reservationId);

      if (currentReservation && !canAdminCancelReservation(currentReservation)) {
        setError('Proběhlou rezervaci už není potřeba rušit.');
        console.info('admin cancel skipped for past reservation', { reservationId });
        return;
      }
    }

    setIsActionLoadingById((prev) => ({ ...prev, [reservationId]: true }));
    setError(null);

    try {
      const { data } = await supabaseAuthClient.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new ReservationUnauthorizedError('Provedení admin akce vyžaduje platné přihlášení.');
      }

      await updateReservationStatus({
        accessToken,
        reservationId,
        status,
        fromStatuses: options?.fromStatuses,
      });

      const [loadedReservations, loadedRecentReservations] = await Promise.all([
        getPendingReservationsReadOnlyWithSession(accessToken),
        getRecentReservationsReadOnlyWithSession(accessToken, recentReservationsLimit),
      ]);
      setReservations(loadedReservations);
      setRecentReservations(loadedRecentReservations);
      console.info(successMessage, { reservationId });
    } catch (actionError) {
      console.error('admin action failed', {
        reservationId,
        action,
        errorName: getErrorName(actionError),
        errorMessage: getErrorMessage(actionError),
      });

      if (actionError instanceof ReservationUnauthorizedError) {
        setError('Nemáte oprávnění provést tuto admin akci.');
      } else if (actionError instanceof ReservationNoLongerPendingError) {
        setError('Rezervace už není ve stavu, který lze změnit.');
        console.info('admin stale pending detected', { reservationId, action });
        const { data } = await supabaseAuthClient.auth.getSession();
        const refreshedAccessToken = data.session?.access_token;

        const staleRecovery = resolveStaleRecoveryAccessToken(refreshedAccessToken);
        if (!staleRecovery.ok) {
          setError(staleRecovery.error);
          return;
        }

        const [loadedReservations, loadedRecentReservations] = await Promise.all([
          getPendingReservationsReadOnlyWithSession(staleRecovery.token),
          getRecentReservationsReadOnlyWithSession(staleRecovery.token, recentReservationsLimit),
        ]);
        setReservations(loadedReservations);
        setRecentReservations(loadedRecentReservations);
        console.info('admin stale pending refresh', { reservationId, count: loadedReservations.length });
      } else if (actionError instanceof ReservationValidationError) {
        setError('Rezervaci se nepodařilo změnit. Zkontrolujte prosím její aktuální stav.');
      } else if (actionError instanceof SupabaseRequestError) {
        setError('Admin akce se nepodařila dokončit. Zkuste to prosím znovu.');
      } else {
        setError('Došlo k neočekávané chybě při admin akci.');
      }
    } finally {
      setIsActionLoadingById((prev) => ({ ...prev, [reservationId]: false }));
    }
  }

  if (!isSessionChecked) {
    return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Kontroluji přihlášení…</div>;
  }

  const guardState = resolveAdminGuardState(userRole);

  if (guardState === 'unauthorized') {
    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h1 className="text-2xl font-bold text-slate-900">Administrace rezervací</h1>
        <p>Pro zobrazení administrace se musíte přihlásit.</p>
        <Link href="/prihlaseni" className="inline-flex rounded-md border border-amber-300 bg-white px-3 py-2 text-amber-900 hover:bg-amber-100">
          Přejít na přihlášení
        </Link>
      </div>
    );
  }

  if (guardState === 'forbidden') {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <h1 className="text-2xl font-bold text-slate-900">Administrace rezervací</h1>
        <p>Nemáte oprávnění pro správu rezervací.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Administrace rezervací</h1>
      <p className="text-sm text-slate-600">Přehled čekajících rezervací, historie a možnost zrušit aktivní rezervace uživatelů.</p>

      {shouldRenderLoadingState(isLoading) ? <div aria-busy={getAriaBusy(isLoading)} className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Načítání rezervací...</div> : null}

      {error ? <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

      {shouldRenderEmptyState(isLoading, Boolean(error), reservations.length) ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Žádné čekající rezervace.</div>
      ) : null}

      {!isLoading && !error && reservations.length > 0 ? (
        <>
        <div className={`${adminListScrollClassName} space-y-3 lg:hidden`}>
          {reservations.map((reservation) => (
            <article key={`mobile-pending-${reservation.id}`} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
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
                  <dt className="text-slate-500">Uživatel</dt>
                  <dd className="mt-0.5 break-words text-slate-900">{getReservationUserLabel(reservation)} · {getReservationUserRoleLabel(reservation)}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-slate-500">Poznámka</dt>
                  <dd className="mt-0.5 break-words text-slate-900">{formatReservationNote(reservation.note)}</dd>
                </div>
              </dl>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleReservationAction(reservation.id, 'approve')}
                  disabled={isActionLoadingById[reservation.id]}
                  aria-disabled={getAriaDisabled(Boolean(isActionLoadingById[reservation.id]))}
                  className="min-h-11 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isActionLoadingById[reservation.id] ? 'Schvaluji…' : 'Schválit'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleReservationAction(reservation.id, 'cancel')}
                  disabled={isActionLoadingById[reservation.id]}
                  aria-disabled={getAriaDisabled(Boolean(isActionLoadingById[reservation.id]))}
                  className="min-h-11 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isActionLoadingById[reservation.id] ? 'Ruším…' : 'Zrušit'}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-white lg:block">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Čas od</th>
                <th className="px-4 py-3 font-medium">Čas do</th>
                <th className="px-4 py-3 font-medium">Vytvořeno</th>
                <th className="px-4 py-3 font-medium">Kurt</th>
                <th className="px-4 py-3 font-medium">Uživatel</th>
                <th className="px-4 py-3 font-medium">Poznámka</th>
                <th className="px-4 py-3 font-medium">Stav</th>
                <th className="px-4 py-3 font-medium">Akce</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => {
                if (process.env.NODE_ENV === 'development') {
                  console.info('admin pending timestamp rendered', { reservationId: reservation.id });
                }

                return (
                  <tr key={reservation.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{formatDate(reservation.reservationDate)}</td>
                  <td className="px-4 py-3">{reservation.timeFrom}</td>
                  <td className="px-4 py-3">{reservation.timeTo}</td>
                  <td className="px-4 py-3">{formatCreatedAt(reservation.createdAt)}</td>
                  <td className="px-4 py-3">{reservation.courtName}</td>
                  <td className="px-4 py-3">{getReservationUserLabel(reservation)} · {getReservationUserRoleLabel(reservation)}</td>
                  <td className="max-w-[18rem] px-4 py-3"><span className="block truncate" title={formatReservationNote(reservation.note)}>{formatReservationNote(reservation.note)}</span></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(reservation.status)}`}>
                      {getReservationStatusLabel(reservation.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReservationAction(reservation.id, 'approve')}
                        disabled={isActionLoadingById[reservation.id]}
                        aria-disabled={getAriaDisabled(Boolean(isActionLoadingById[reservation.id]))}
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isActionLoadingById[reservation.id] ? 'Schvaluji…' : 'Schválit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReservationAction(reservation.id, 'cancel')}
                        disabled={isActionLoadingById[reservation.id]}
                        aria-disabled={getAriaDisabled(Boolean(isActionLoadingById[reservation.id]))}
                        className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isActionLoadingById[reservation.id] ? 'Ruším…' : 'Zrušit'}
                      </button>
                    </div>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      ) : null}


      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Turnaje a blokace kurtů</h2>
          <p className="text-sm text-slate-600">Jedna centrální událost automaticky blokuje všechny aktivní kurty v rezervačním přehledu.</p>
        </div>
        <form onSubmit={handleTournamentSubmit} className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Název
            <input value={tournamentForm.title} onChange={(event) => setTournamentForm((prev) => ({ ...prev, title: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">Datum
            <input type="date" value={tournamentForm.date} onChange={(event) => setTournamentForm((prev) => ({ ...prev, date: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">Od
            <input type="time" value={tournamentForm.timeFrom} onChange={(event) => setTournamentForm((prev) => ({ ...prev, timeFrom: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">Do
            <input type="time" value={tournamentForm.timeTo} onChange={(event) => setTournamentForm((prev) => ({ ...prev, timeTo: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Plakát turnaje
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setTournamentForm((prev) => ({ ...prev, posterFile: event.target.files?.[0] ?? null }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-court file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">Vyberte obrázek z počítače nebo mobilu. Podporované formáty: JPG, PNG, WebP, max. 5 MB.</span>
            {editedTournamentId && tournamentForm.posterUrl && !tournamentForm.posterFile ? <span className="mt-1 block text-xs font-normal text-slate-500">Pokud nevyberete nový obrázek, zůstane zachovaný stávající plakát.</span> : null}
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Poznámka
            <input value={tournamentForm.note} onChange={(event) => setTournamentForm((prev) => ({ ...prev, note: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" disabled={isTournamentSaving} className="rounded-md bg-court px-4 py-2 font-semibold text-white disabled:opacity-60">{editedTournamentId ? 'Uložit změny' : 'Vytvořit turnaj'}</button>
          {editedTournamentId ? <button type="button" onClick={() => { setEditedTournamentId(null); setTournamentForm(emptyTournamentForm); }} className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700">Zrušit úpravu</button> : null}
        </form>
        {tournamentMessage ? <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">{tournamentMessage}</p> : null}
        <div className="divide-y divide-slate-100">
          {tournaments.length === 0 ? <p className="py-3 text-sm text-slate-600">Žádné turnaje nejsou založené.</p> : null}
          {tournaments.map((tournament) => (
            <article key={tournament.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-slate-900">{tournament.title}</p>
                <p className="text-sm text-slate-600">{formatDate(tournament.date)} · {tournament.time}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => editTournament(tournament)} className="rounded-md border border-slate-300 px-3 py-1 text-sm">Upravit</button>
                <button type="button" onClick={() => void handleTournamentDelete(tournament.id)} className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-sm text-rose-800">Zrušit</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {!isLoading && !error ? (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Poslední rezervace</h2>
          {recentReservations.length === 0 ? (
            <p className="text-sm text-slate-600">Historie rezervací je prázdná.</p>
          ) : (
            <>
            <div className={`${adminListScrollClassName} divide-y divide-slate-100 lg:hidden`}>
              {recentReservations.map((reservation) => (
                <article key={`mobile-recent-${reservation.id}`} className="space-y-3 py-4 first:pt-1 last:pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{formatDate(reservation.reservationDate)}</p>
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
                      <dt className="text-slate-500">Uživatel</dt>
                      <dd className="mt-0.5 break-words text-slate-900">{getReservationUserLabel(reservation)} · {getReservationUserRoleLabel(reservation)}</dd>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <dt className="text-slate-500">Poznámka</dt>
                      <dd className="mt-0.5 break-words text-slate-900">{formatReservationNote(reservation.note)}</dd>
                    </div>
                  </dl>
                  {canAdminCancelReservation(reservation) ? (
                    <button
                      type="button"
                      onClick={() => void handleReservationAction(reservation.id, 'cancel', { fromStatuses: ['pending', 'approved'] })}
                      disabled={isActionLoadingById[reservation.id]}
                      aria-disabled={getAriaDisabled(Boolean(isActionLoadingById[reservation.id]))}
                      className="min-h-11 w-full rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActionLoadingById[reservation.id] ? 'Ruším…' : 'Zrušit rezervaci'}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="hidden max-h-[32rem] overflow-auto lg:block">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Datum</th>
                    <th className="px-4 py-3 font-medium">Čas od</th>
                    <th className="px-4 py-3 font-medium">Čas do</th>
                    <th className="px-4 py-3 font-medium">Vytvořeno</th>
                    <th className="px-4 py-3 font-medium">Kurt</th>
                    <th className="px-4 py-3 font-medium">Uživatel</th>
                    <th className="px-4 py-3 font-medium">Poznámka</th>
                    <th className="px-4 py-3 font-medium">Stav</th>
                    <th className="px-4 py-3 font-medium">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReservations.map((reservation) => {
                    if (process.env.NODE_ENV === 'development') {
                      console.info('admin reservation history timestamp rendered', { reservationId: reservation.id });
                    }

                    return (
                      <tr key={`recent-${reservation.id}`} className="border-t border-slate-100">
                        <td className="px-4 py-3">{formatDate(reservation.reservationDate)}</td>
                        <td className="px-4 py-3">{reservation.timeFrom}</td>
                        <td className="px-4 py-3">{reservation.timeTo}</td>
                        <td className="px-4 py-3">{formatCreatedAt(reservation.createdAt)}</td>
                        <td className="px-4 py-3">{reservation.courtName}</td>
                        <td className="px-4 py-3">{getReservationUserLabel(reservation)} · {getReservationUserRoleLabel(reservation)}</td>
                        <td className="max-w-[18rem] px-4 py-3"><span className="block truncate" title={formatReservationNote(reservation.note)}>{formatReservationNote(reservation.note)}</span></td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(reservation.status)}`}>
                            {getReservationStatusLabel(reservation.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {canAdminCancelReservation(reservation) ? (
                            <button
                              type="button"
                              onClick={() => void handleReservationAction(reservation.id, 'cancel', { fromStatuses: ['pending', 'approved'] })}
                              disabled={isActionLoadingById[reservation.id]}
                              aria-disabled={getAriaDisabled(Boolean(isActionLoadingById[reservation.id]))}
                              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isActionLoadingById[reservation.id] ? 'Ruším…' : 'Zrušit'}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
      ) : null}

    </div>
  );
}
