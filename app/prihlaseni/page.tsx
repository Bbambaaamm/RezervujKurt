"use client";

import { FormEvent, useEffect, useState } from 'react';
import { supabaseAuthClient, type AuthSession } from '@/lib/supabase/auth-client';
import { buildEmailRedirectTo } from '@/lib/supabase/auth-redirect';

const MAGIC_LINK_COOLDOWN_SECONDS = 60;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    supabaseAuthClient.auth.getSession().then(({ data }) => {
      const nextSession = data.session ?? null;
      setSession(nextSession);

      if (nextSession) {
        setMessage('Jste přihlášen(a).');
      }
    });

    const {
      data: { subscription },
    } = supabaseAuthClient.auth.onAuthStateChange((event, nextSession) => {
      const normalizedSession = nextSession ?? null;
      setSession(normalizedSession);

      if (normalizedSession) {
        setError(null);
        setMessage('Jste přihlášen(a).');
        return;
      }

      if (event === 'SIGNED_OUT') {
        setMessage(null);
        setError(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setCooldownSeconds((currentSeconds) => Math.max(0, currentSeconds - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [cooldownSeconds]);

  function getMagicLinkRedirectUrl(): string {
    const emailRedirectTo = buildEmailRedirectTo({
      envRedirectUrl: process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL,
      envAuthRedirectUrl: process.env.NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL,
      windowOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    if (process.env.NODE_ENV === 'development') {
      console.info('[auth] Redirect base source:', {
        from_env_redirect_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL?.trim()),
        from_env_auth_redirect_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL?.trim()),
        from_window_origin: !(process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL?.trim()) && Boolean(typeof window !== 'undefined' ? window.location.origin : ''),
      });
    }

    return emailRedirectTo;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || cooldownSeconds > 0) return;

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
      setError(signInError.message || 'Přihlášení se nepodařilo. Zkontrolujte e-mail a zkuste to znovu.');
      return;
    }

    setCooldownSeconds(MAGIC_LINK_COOLDOWN_SECONDS);
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

    setSession(null);
    setMessage('Byli jste odhlášeni.');
  }

  const isLoggedIn = Boolean(session);
  const isLoginDisabled = isSubmitting || cooldownSeconds > 0;
  const loginButtonLabel = isSubmitting
    ? 'Odesílám odkaz…'
    : cooldownSeconds > 0
      ? `Další odkaz lze poslat za ${cooldownSeconds} s`
      : 'Poslat odkaz pro přihlášení';

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-bold">Přihlášení</h1>
      <p className="text-sm text-slate-600">Pro vytvoření rezervace použijte přihlášení e-mailem.</p>

      {isLoggedIn ? (
        <>
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Jste přihlášen(a).</p>
          <button onClick={handleLogout} className="w-full rounded-md border border-slate-300 px-4 py-2 text-left">
            Odhlásit se
          </button>
        </>
      ) : (
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
          <button disabled={isLoginDisabled} className="w-full rounded-md border border-slate-300 px-4 py-2 text-left disabled:opacity-60">
            {loginButtonLabel}
          </button>
        </form>
      )}

      {message && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    </div>
  );
}
