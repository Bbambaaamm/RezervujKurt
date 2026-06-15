"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  getPendingReservationsReadOnlyWithSession,
  getRecentReservationsReadOnlyWithSession,
  type ReservationOverview,
} from '@/lib/services/read-only';
import { ReservationNoLongerPendingError, ReservationUnauthorizedError, ReservationValidationError } from '@/lib/services/supabase-error-mapping';
import { resolveAdminGuardState } from '@/lib/services/admin-guard';
import { getCurrentUserRoleFromSession, type CurrentUserRole } from '@/lib/services/profile';
import { updateReservationStatus } from '@/lib/services/reservations';
import { supabaseAuthClient } from '@/lib/supabase/auth-client';
import { SupabaseRequestError } from '@/lib/supabase/client';
import {
  getAriaBusy,
  getAriaDisabled,
  getReservationStatusLabel,
  getReservationUserLabel,
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


function getStatusBadgeClass(status: ReservationOverview['status']) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'cancelled') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}


export default function AdminPage() {
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  const [userRole, setUserRole] = useState<CurrentUserRole>('anonymous');
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoadingById, setIsActionLoadingById] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationOverview[]>([]);
  const [recentReservations, setRecentReservations] = useState<ReservationOverview[]>([]);

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

        const [loadedReservations, loadedRecentReservations] = await Promise.all([
          getPendingReservationsReadOnlyWithSession(accessToken),
          getRecentReservationsReadOnlyWithSession(accessToken, 20),
        ]);
        if (!active) return;
        setReservations(loadedReservations);
        setRecentReservations(loadedRecentReservations);

        if (process.env.NODE_ENV === 'development') {
          console.info('admin reservations loaded', { count: loadedReservations.length });
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

  async function handleReservationAction(reservationId: string, action: 'approve' | 'cancel') {
    const status = action === 'approve' ? 'approved' : 'cancelled';
    const startedMessage = action === 'approve' ? 'admin approve started' : 'admin cancel started';
    const successMessage = action === 'approve' ? 'admin approve success' : 'admin cancel success';

    console.info(startedMessage, { reservationId });
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
      });

      const [loadedReservations, loadedRecentReservations] = await Promise.all([
        getPendingReservationsReadOnlyWithSession(accessToken),
        getRecentReservationsReadOnlyWithSession(accessToken, 20),
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
        setError('Rezervace už není ve stavu pending.');
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
          getRecentReservationsReadOnlyWithSession(staleRecovery.token, 20),
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
      <p className="text-sm text-slate-600">Read-only přehled rezervací čekajících na schválení.</p>

      {shouldRenderLoadingState(isLoading) ? <div aria-busy={getAriaBusy(isLoading)} className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Načítání rezervací...</div> : null}

      {error ? <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

      {shouldRenderEmptyState(isLoading, Boolean(error), reservations.length) ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Žádné čekající rezervace.</div>
      ) : null}

      {!isLoading && !error && reservations.length > 0 ? (
        <>
        <div className="space-y-3 lg:hidden">
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
                  <dd className="mt-0.5 font-medium text-slate-900">{reservation.courtName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Vytvořeno</dt>
                  <dd className="mt-0.5 text-slate-900">{formatCreatedAt(reservation.createdAt)}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-slate-500">Uživatel</dt>
                  <dd className="mt-0.5 break-words text-slate-900">{getReservationUserLabel(reservation)}</dd>
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

        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Čas od</th>
                <th className="px-4 py-3 font-medium">Čas do</th>
                <th className="px-4 py-3 font-medium">Vytvořeno</th>
                <th className="px-4 py-3 font-medium">Kurt</th>
                <th className="px-4 py-3 font-medium">Uživatel</th>
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
                  <td className="px-4 py-3">{getReservationUserLabel(reservation)}</td>
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


      {!isLoading && !error ? (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Poslední rezervace</h2>
          {recentReservations.length === 0 ? (
            <p className="text-sm text-slate-600">Historie rezervací je prázdná.</p>
          ) : (
            <>
            <div className="divide-y divide-slate-100 lg:hidden">
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
                      <dd className="mt-0.5 font-medium text-slate-900">{reservation.courtName}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Vytvořeno</dt>
                      <dd className="mt-0.5 text-slate-900">{formatCreatedAt(reservation.createdAt)}</dd>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <dt className="text-slate-500">Uživatel</dt>
                      <dd className="mt-0.5 break-words text-slate-900">{getReservationUserLabel(reservation)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Datum</th>
                    <th className="px-4 py-3 font-medium">Čas od</th>
                    <th className="px-4 py-3 font-medium">Čas do</th>
                    <th className="px-4 py-3 font-medium">Vytvořeno</th>
                    <th className="px-4 py-3 font-medium">Kurt</th>
                    <th className="px-4 py-3 font-medium">Uživatel</th>
                    <th className="px-4 py-3 font-medium">Stav</th>
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
                        <td className="px-4 py-3">{getReservationUserLabel(reservation)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(reservation.status)}`}>
                            {getReservationStatusLabel(reservation.status)}
                          </span>
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
