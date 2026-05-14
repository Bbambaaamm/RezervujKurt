"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabaseAuthClient } from '@/lib/supabase/auth-client';

const baseLinks = [
  { href: '/', label: 'Domů' },
  { href: '/rezervace', label: 'Rezervace' },
];

function getAuthStatusText(session: Session | null): string {
  const email = session?.user?.email?.trim();
  return email ? `Přihlášen jako ${email}` : 'Přihlášen';
}

export function Header() {
  const [session, setSession] = useState<Session | null>(null);

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

  const authLinks = session
    ? [
        { href: '/prihlaseni', label: 'Účet' },
        { href: '/prihlaseni', label: 'Odhlásit' },
      ]
    : [{ href: '/prihlaseni', label: 'Přihlášení' }];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-lg font-semibold">RezervujKurt</p>
          <p className="text-sm text-slate-600">TJ Baník Stříbro</p>
          {session && <p className="text-xs text-emerald-700">{getAuthStatusText(session)}</p>}
        </div>
        <nav className="flex gap-4 text-sm font-medium">
          {[...baseLinks, ...authLinks].map((link, index) => (
            <Link key={`${link.href}-${index}`} href={link.href} className="text-slate-700 transition hover:text-court">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
