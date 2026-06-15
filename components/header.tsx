"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
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

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-base font-semibold">RezervujKurt</p>
          <p className="text-xs text-slate-600">TJ Baník Stříbro</p>
          {session && <p className="hidden max-w-72 truncate text-xs text-emerald-700 md:block">{getAuthStatusText(session)}</p>}
        </div>
        <nav aria-label="Hlavní navigace" className="hidden items-center gap-4 text-sm font-medium md:flex">
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

        <button
          type="button"
          aria-controls="mobile-navigation"
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? 'Zavřít menu' : 'Otevřít menu'}
          onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:border-court hover:text-court focus:outline-none focus:ring-2 focus:ring-court focus:ring-offset-2 md:hidden"
        >
          <span className="sr-only">{isMobileMenuOpen ? 'Zavřít menu' : 'Otevřít menu'}</span>
          <span aria-hidden="true" className="flex w-5 flex-col gap-1">
            <span className="h-0.5 w-full rounded bg-current" />
            <span className="h-0.5 w-full rounded bg-current" />
            <span className="h-0.5 w-full rounded bg-current" />
          </span>
        </button>

        {isMobileMenuOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Mobilní navigace"
            className="absolute left-4 right-4 top-full z-50 mt-2 flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2 text-sm font-medium shadow-lg md:hidden"
          >
            {session && (
              <p className="break-all border-b border-slate-100 px-3 py-2 text-xs font-normal text-emerald-700">
                {getAuthStatusText(session)}
              </p>
            )}

            {baseLinks.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2.5 text-slate-700 transition hover:bg-slate-50 hover:text-court">
                {link.label}
              </Link>
            ))}

            {session ? (
              <>
                {isAdmin && (
                  <Link href="/admin" className="rounded-lg px-3 py-2.5 text-slate-700 transition hover:bg-slate-50 hover:text-court">
                    Admin
                  </Link>
                )}
                <Link href="/moje-rezervace" className="rounded-lg px-3 py-2.5 text-slate-700 transition hover:bg-slate-50 hover:text-court">
                  Moje rezervace
                </Link>
                <Link href="/ucet" className="rounded-lg px-3 py-2.5 text-slate-700 transition hover:bg-slate-50 hover:text-court">
                  Účet
                </Link>
                <button
                  onClick={handleMenuLogout}
                  disabled={isLoggingOut}
                  className="rounded-lg px-3 py-2.5 text-left text-slate-700 transition hover:bg-slate-50 hover:text-court disabled:opacity-60"
                >
                  {isLoggingOut ? 'Odhlašuji…' : 'Odhlášení'}
                </button>
              </>
            ) : (
              <Link href="/prihlaseni" className="rounded-lg px-3 py-2.5 text-slate-700 transition hover:bg-slate-50 hover:text-court">
                Přihlášení
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
