"use client";

import { developmentConsole } from '@/lib/services/development-console';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { supabaseAuthClient } from '@/lib/supabase/auth-client';

export function AuthSessionSync() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const { handled, session } = supabaseAuthClient.auth.processSessionFromUrlHash();

    if (!handled) return;

    if (process.env.NODE_ENV === 'development') {
      if (session) {
        developmentConsole.info('[auth] session found');
      } else {
        developmentConsole.info('[auth] session missing');
      }
    }

    if (pathname === '/') {
      router.replace('/rezervace');
      if (process.env.NODE_ENV === 'development') {
        developmentConsole.info('[auth] redirected after auth callback');
      }
    }
  }, [pathname, router]);

  return null;
}
