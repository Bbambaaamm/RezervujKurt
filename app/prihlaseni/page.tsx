"use client";

import { FormEvent, useEffect, useState } from 'react';
import { supabaseAuthClient } from '@/lib/supabase/auth-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabaseAuthClient.auth.getSession().then(({ data }) => {
      setIsLoggedIn(Boolean(data.session));
    });
  }, []);

  function getMagicLinkRedirectUrl(): string {
    const redirectBase = process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL?.trim();
    const fallbackBase = typeof window !== 'undefined' ? window.location.origin : '';
    const baseUrl = redirectBase || fallbackBase;

    if (!baseUrl) return '/rezervace';

    try {
      const redirectUrl = new URL('/rezervace', baseUrl);
      return redirectUrl.toString();
    } catch {
      return '/rezervace';
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const emailRedirectTo = getMagicLinkRedirectUrl();

    if (process.env.NODE_ENV === 'development') {
      console.info('[auth] Magic link redirect URL:', emailRedirectTo);
    }

    const { error: signInError } = await supabaseAuthClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    });

    setIsSubmitting(false);

    if (signInError) {
      setError('Přihlášení se nepodařilo. Zkontrolujte e-mail a zkuste to znovu.');
      return;
    }

    setMessage('Na e-mail byl odeslán odkaz pro přihlášení.');
  }

  async function handleLogout() {
    setError(null);
    setMessage(null);

    const { error: signOutError } = await supabaseAuthClient.auth.signOut();

    if (signOutError) {
      setError('Odhlášení se nepodařilo. Zkuste to znovu.');
      return;
    }

    setIsLoggedIn(false);
    setMessage('Byli jste odhlášeni.');
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-bold">Přihlášení</h1>
      <p className="text-sm text-slate-600">Pro vytvoření rezervace použijte přihlášení e-mailem.</p>

      <form onSubmit={handleLogin} className="space-y-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            placeholder="jmeno@domena.cz"
          />
        </label>
        <button disabled={isSubmitting} className="w-full rounded-md border border-slate-300 px-4 py-2 text-left disabled:opacity-60">
          {isSubmitting ? 'Odesílám odkaz…' : 'Poslat odkaz pro přihlášení'}
        </button>
      </form>

      <button onClick={handleLogout} disabled={!isLoggedIn} className="w-full rounded-md border border-slate-300 px-4 py-2 text-left disabled:opacity-60">
        Odhlásit se
      </button>

      {message && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    </div>
  );
}
