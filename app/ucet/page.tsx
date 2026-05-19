"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseAuthClient, type AuthSession } from '@/lib/supabase/auth-client';

export default function AccountPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseAuthClient.auth.getSession().then(({ data }) => {
      const nextSession = data.session ?? null;
      setSession(nextSession);
      console.info(nextSession ? '[auth] account page: session found' : '[auth] account page: session missing');
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

  async function handleLogout() {
    setError(null);

    const { error: signOutError } = await supabaseAuthClient.auth.signOut();

    if (signOutError) {
      setError('Odhlášení se nepodařilo. Zkuste to znovu.');
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-bold">Účet</h1>

      {session ? (
        <>
          <p className="text-sm text-slate-700">
            <span className="font-medium">E-mail:</span> {session.user.email ?? 'Není dostupný'}
          </p>
          <p className="text-sm text-slate-700">
            <span className="font-medium">User ID:</span> {session.user.id}
          </p>
          <p className="text-sm text-emerald-700 font-medium">Stav: Přihlášen</p>
          <button onClick={handleLogout} className="w-full rounded-md border border-slate-300 px-4 py-2 text-left">
            Odhlásit se
          </button>
        </>
      ) : (
        <p className="text-sm text-slate-700">
          Nejste přihlášen(a). Pokračujte na stránku{' '}
          <Link href="/prihlaseni" className="text-court underline">
            Přihlášení
          </Link>
          .
        </p>
      )}

      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    </div>
  );
}
