"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabaseAuthClient, type AuthSession } from '@/lib/supabase/auth-client';
import { clearCurrentUserRoleCache, getCurrentUserRoleFromSession } from '@/lib/services/profile';

const baseLinks = [
  { href: '/', label: 'Domů' },
  { href: '/rezervace', label: 'Rezervace' },
];

function getAuthStatusText(session: AuthSession | null): string {
  const email = session?.user?.email?.trim();
  return email ? `Přihlášen jako ${email}` : 'Přihlášen';
}

export function Header() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

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
    let isMounted = true;

    getCurrentUserRoleFromSession(session)
      .then((role) => {
        if (!isMounted) {
          return;
        }

        const shouldShowAdminLink = role === 'admin';
        setIsAdmin(shouldShowAdminLink);
        console.info(shouldShowAdminLink ? 'header admin link visible' : 'header admin link hidden');
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setIsAdmin(false);
        console.info('header admin link hidden');
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  async function handleMenuLogout() {
    console.info('[auth] header logout clicked');
    setIsLoggingOut(true);

    const { error } = await supabaseAuthClient.auth.signOut();

    setIsLoggingOut(false);

    if (!error) {
      clearCurrentUserRoleCache();
      router.push('/prihlaseni');
      router.refresh();
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-lg font-semibold">RezervujKurt</p>
          <p className="text-sm text-slate-600">TJ Baník Stříbro</p>
          {session && <p className="text-xs text-emerald-700">{getAuthStatusText(session)}</p>}
        </div>
        <nav className="flex gap-4 text-sm font-medium">
          {baseLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-slate-700 transition hover:text-court">
              {link.label}
            </Link>
          ))}

          {session ? (
            <>
              {isAdmin && (
                <Link href="/admin" className="text-slate-700 transition hover:text-court">
                  Admin
                </Link>
              )}
              <Link href="/moje-rezervace" className="text-slate-700 transition hover:text-court">
                Moje rezervace
              </Link>
              <Link href="/ucet" className="text-slate-700 transition hover:text-court">
                Účet
              </Link>
              <button onClick={handleMenuLogout} disabled={isLoggingOut} className="text-slate-700 transition hover:text-court disabled:opacity-60">
                {isLoggingOut ? 'Odhlašuji…' : 'Odhlášení'}
              </button>
            </>
          ) : (
            <Link href="/prihlaseni" className="text-slate-700 transition hover:text-court">
              Přihlášení
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
