"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseAuthClient, type AuthSession } from '@/lib/supabase/auth-client';
import { supabaseSelectWithAccessToken } from '@/lib/supabase/client';
import { resolveProfileSaveErrorMessage } from '@/lib/services/profile-save-error';

type ProfileRow = {
  full_name: string | null;
  role: 'user' | 'member' | 'admin' | null;
};

function getProfileRoleLabel(role: ProfileRow['role']) {
  if (role === 'member') return 'Člen';
  if (role === 'admin') return 'Administrátor';
  return 'Nečlen';
}

export default function AccountPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [profileRole, setProfileRole] = useState<ProfileRow['role']>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseAuthClient.auth.getSession().then(async ({ data }) => {
      const nextSession = data.session ?? null;
      setSession(nextSession);
      console.info(nextSession ? '[auth] account page: session found' : '[auth] account page: session missing');

      if (nextSession?.access_token && nextSession.user.id) {
        const profileRows = await supabaseSelectWithAccessToken<ProfileRow>(
          `profiles?select=full_name,role&id=eq.${nextSession.user.id}&limit=1`,
          nextSession.access_token,
        );
        setDisplayName(profileRows[0]?.full_name ?? '');
        setProfileRole(profileRows[0]?.role ?? null);
      } else {
        setDisplayName('');
        setProfileRole(null);
      }
    });

    const {
      data: { subscription },
    } = supabaseAuthClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      if (!nextSession) setProfileRole(null);
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

  async function handleSaveDisplayName() {
    if (!session?.access_token || !session.user.id) return;

    const normalizedDisplayName = displayName.trim();
    if (!normalizedDisplayName) {
      setError('Jméno nesmí být prázdné.');
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Nastavení aplikace je neúplné. Chybí Supabase konfigurace.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ full_name: normalizedDisplayName }),
      });

      if (!response.ok) {
        const responseError = resolveProfileSaveErrorMessage(null, response.ok);
        if (responseError) {
          setError(responseError);
        }
        return;
      }

      setDisplayName(normalizedDisplayName);
      setSuccessMessage('Jméno bylo uloženo.');
    } catch (transportError) {
      const transportErrorMessage = resolveProfileSaveErrorMessage(transportError);
      if (transportErrorMessage) {
        setError(transportErrorMessage);
      }
    } finally {
      setIsSaving(false);
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
            <span className="font-medium">Typ účtu:</span> {getProfileRoleLabel(profileRole)}
          </p>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">Jméno pro rezervace</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSaveDisplayName()}
            disabled={isSaving}
            className="w-full rounded-md border border-slate-300 px-4 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Ukládám jméno…' : 'Uložit jméno'}
          </button>
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

      {successMessage && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{successMessage}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    </div>
  );
}
