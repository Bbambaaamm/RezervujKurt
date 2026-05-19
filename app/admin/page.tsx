"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getPendingReservationsReadOnly, type PendingReservationOverview } from '@/lib/services/read-only';
import { getCurrentUserRoleFromSession, type CurrentUserRole } from '@/lib/services/profile';
import { supabaseAuthClient } from '@/lib/supabase/auth-client';
import { SupabaseRequestError } from '@/lib/supabase/client';

function formatDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;
  return new Intl.DateTimeFormat('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsedDate);
}

function formatIdentity(reservation: PendingReservationOverview) {
  if (reservation.userEmail) return reservation.userEmail;
  return reservation.userId;
}

export default function AdminPage() {
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  const [userRole, setUserRole] = useState<CurrentUserRole>('anonymous');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<PendingReservationOverview[]>([]);

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
        const loadedReservations = await getPendingReservationsReadOnly();
        if (!active) return;
        setReservations(loadedReservations);

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
            response: loadError.responseBody,
          });
          return;
        }

        console.error('Admin pending reservations load failed.', loadError);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadReservations();

    return () => {
      active = false;
    };
  }, [isSessionChecked, userRole]);

  if (!isSessionChecked) {
    return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Kontroluji přihlášení…</div>;
  }

  if (userRole === 'anonymous') {
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

  if (userRole !== 'admin') {
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

      {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Načítám čekající rezervace…</div> : null}

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

      {!isLoading && !error && reservations.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Aktuálně nejsou žádné rezervace ve stavu čekající.</div>
      ) : null}

      {!isLoading && !error && reservations.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Čas od</th>
                <th className="px-4 py-3 font-medium">Čas do</th>
                <th className="px-4 py-3 font-medium">Kurt</th>
                <th className="px-4 py-3 font-medium">Uživatel</th>
                <th className="px-4 py-3 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{formatDate(reservation.reservationDate)}</td>
                  <td className="px-4 py-3">{reservation.timeFrom}</td>
                  <td className="px-4 py-3">{reservation.timeTo}</td>
                  <td className="px-4 py-3">{reservation.courtName}</td>
                  <td className="px-4 py-3">{formatIdentity(reservation)}</td>
                  <td className="px-4 py-3">{reservation.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
