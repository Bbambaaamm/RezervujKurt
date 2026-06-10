import { buildOtpPayload, buildSupabaseOtpEndpoint, getOtpFailureMessage, getSupabaseOtpRequestConfig, resolveOtpEndpoint } from '@/lib/supabase/otp-proxy';

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    email?: string;
  };
};

type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';
type AuthListener = (event: AuthChangeEvent, session: AuthSession | null) => void;

type JwtPayload = {
  sub?: string;
  email?: string;
  exp?: number;
};

const SESSION_STORAGE_KEY = 'rezervujkurt.auth.session';
const REFRESH_EARLY_SECONDS = 60;
const listeners = new Set<AuthListener>();

let refreshTimeoutId: number | null = null;
let refreshInFlight: Promise<AuthSession | null> | null = null;

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.NODE_ENV === 'development') {
    console.info('[auth] Supabase runtime env:', {
      has_url: Boolean(url),
      url_preview: url ? `${url.slice(0, 48)}${url.length > 48 ? '…' : ''}` : null,
      has_anon_key: Boolean(anonKey),
      anon_key_prefix: anonKey ? anonKey.slice(0, 12) : null,
      anon_key_length: anonKey?.length ?? 0,
    });
  }
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const base64UrlPayload = token.split('.')[1];
    if (!base64UrlPayload) return null;
    const base64Payload = base64UrlPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = base64Payload.padEnd(base64Payload.length + ((4 - (base64Payload.length % 4)) % 4), '=');
    return JSON.parse(atob(paddedPayload)) as JwtPayload;
  } catch {
    return null;
  }
}

function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null') as AuthSession | null; } catch { return null; }
}

function setStoredSession(session: AuthSession | null): void {
  if (typeof window === 'undefined') return;
  if (!session) window.localStorage.removeItem(SESSION_STORAGE_KEY);
  else window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function emitAuthChange(event: AuthChangeEvent, session: AuthSession | null): void { listeners.forEach((listener) => listener(event, session)); }

function clearRefreshTimeout(): void {
  if (typeof window === 'undefined') return;
  if (refreshTimeoutId !== null) {
    window.clearTimeout(refreshTimeoutId);
    refreshTimeoutId = null;
  }
}

function getTokenExpirationEpoch(accessToken: string): number | null {
  const payload = parseJwtPayload(accessToken);
  return typeof payload?.exp === 'number' ? payload.exp : null;
}

function isAccessTokenExpired(accessToken: string): boolean {
  const exp = getTokenExpirationEpoch(accessToken);
  if (!exp) return true;
  return exp <= Math.floor(Date.now() / 1000);
}

function shouldRefreshSoon(accessToken: string): boolean {
  const exp = getTokenExpirationEpoch(accessToken);
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return exp - now <= REFRESH_EARLY_SECONDS;
}

function scheduleRefresh(session: AuthSession | null): void {
  if (typeof window === 'undefined') return;
  clearRefreshTimeout();
  if (!session?.access_token || !session.refresh_token) return;

  const exp = getTokenExpirationEpoch(session.access_token);
  if (!exp) return;

  const now = Math.floor(Date.now() / 1000);
  const refreshAtEpoch = exp - REFRESH_EARLY_SECONDS;
  const delayMs = Math.max((refreshAtEpoch - now) * 1000, 0);

  refreshTimeoutId = window.setTimeout(() => {
    void ensureValidSession({ allowRedirect: false });
  }, delayMs);
}

function hasAuthHash(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  return Boolean(params.get('access_token'));
}

function redirectToLoginIfNeeded(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== '/prihlaseni') {
    window.location.assign('/prihlaseni');
  }
}

function invalidateSession(options?: { redirectToLogin?: boolean; reason?: 'expired' | 'refresh_failed' }): void {
  if (options?.reason === 'expired' && process.env.NODE_ENV === 'development') {
    console.info('[auth] session expired');
  }
  setStoredSession(null);
  clearRefreshTimeout();
  emitAuthChange('SIGNED_OUT', null);

  if (options?.redirectToLogin) {
    redirectToLoginIfNeeded();
  }
}

async function refreshSession(currentSession: AuthSession, options?: { allowRedirect?: boolean }): Promise<AuthSession | null> {
  if (!currentSession.refresh_token) {
    invalidateSession({ redirectToLogin: options?.allowRedirect ?? false, reason: 'expired' });
    return null;
  }

  const config = getSupabaseConfig();
  if (!config) return currentSession;

  if (process.env.NODE_ENV === 'development') {
    console.info('[auth] session refresh started');
  }

  const endpoint = `${config.url}/auth/v1/token?grant_type=refresh_token`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
      },
      body: JSON.stringify({ refresh_token: currentSession.refresh_token }),
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[auth] session refresh failed');
      }
      invalidateSession({ redirectToLogin: options?.allowRedirect ?? true, reason: 'refresh_failed' });
      return null;
    }

    const responseData = (await response.json()) as { access_token?: string; refresh_token?: string; user?: { id?: string; email?: string } };
    if (!responseData.access_token) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[auth] session refresh failed');
      }
      invalidateSession({ redirectToLogin: options?.allowRedirect ?? true, reason: 'refresh_failed' });
      return null;
    }

    const payload = parseJwtPayload(responseData.access_token);
    const userId = responseData.user?.id ?? (typeof payload?.sub === 'string' ? payload.sub : '');
    const email = responseData.user?.email ?? (typeof payload?.email === 'string' ? payload.email : undefined);

    if (!userId) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[auth] session refresh failed');
      }
      invalidateSession({ redirectToLogin: options?.allowRedirect ?? true, reason: 'refresh_failed' });
      return null;
    }

    const nextSession: AuthSession = {
      access_token: responseData.access_token,
      refresh_token: responseData.refresh_token ?? currentSession.refresh_token,
      user: { id: userId, email },
    };

    setStoredSession(nextSession);
    scheduleRefresh(nextSession);
    emitAuthChange('TOKEN_REFRESHED', nextSession);

    if (process.env.NODE_ENV === 'development') {
      console.info('[auth] session refresh success');
    }

    return nextSession;
  } catch {
    if (process.env.NODE_ENV === 'development') {
      console.info('[auth] session refresh failed');
    }
    invalidateSession({ redirectToLogin: options?.allowRedirect ?? true, reason: 'refresh_failed' });
    return null;
  }
}

async function ensureValidSession(options?: { allowRedirect?: boolean }): Promise<AuthSession | null> {
  const storedSession = getStoredSession();
  if (!storedSession) {
    clearRefreshTimeout();
    return null;
  }

  if (!storedSession.access_token) {
    invalidateSession({ redirectToLogin: options?.allowRedirect ?? true, reason: 'expired' });
    return null;
  }

  if (!isAccessTokenExpired(storedSession.access_token) && !shouldRefreshSoon(storedSession.access_token)) {
    scheduleRefresh(storedSession);
    return storedSession;
  }

  if (!storedSession.refresh_token) {
    invalidateSession({ redirectToLogin: options?.allowRedirect ?? true, reason: 'expired' });
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshSession(storedSession, options).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

function readSessionFromUrl(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken) return null;
  if (process.env.NODE_ENV === 'development') {
    console.info('[auth] auth hash detected');
  }
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

  const payload = parseJwtPayload(accessToken);
  const userId = typeof payload?.sub === 'string' ? payload.sub : '';
  const email = typeof payload?.email === 'string' ? payload.email : undefined;
  if (!userId) return null;
  const session: AuthSession = {
    access_token: accessToken,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    user: { id: userId, email },
  };
  setStoredSession(session);
  scheduleRefresh(session);
  if (process.env.NODE_ENV === 'development') {
    console.info('[auth] session stored from magic link hash');
  }
  emitAuthChange('SIGNED_IN', session);
  return session;
}

export const supabaseAuthClient = {
  auth: {
    processSessionFromUrlHash() {
      const handled = hasAuthHash();
      const session = readSessionFromUrl();
      return { handled, session };
    },
    async getSession() {
      const session = await ensureValidSession({ allowRedirect: false });
      return { data: { session } };
    },
    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
    },
    async signInWithOtp({ email, options }: { email: string; options?: { emailRedirectTo?: string } }) {
      const payload = buildOtpPayload(email, options?.emailRedirectTo, { createUser: false });
      const config = getSupabaseConfig();
      if (!config) return { error: new Error('Chybí NEXT_PUBLIC_SUPABASE_URL nebo NEXT_PUBLIC_SUPABASE_ANON_KEY.') };
      const directEndpoint = buildSupabaseOtpEndpoint(`${config.url}/auth/v1/otp`, payload.redirect_to);
      const windowOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const endpoint = resolveOtpEndpoint(directEndpoint, windowOrigin);
      const useProxy = endpoint === '/api/auth/otp';

      if (process.env.NODE_ENV === 'development') {
        console.info('[auth] Supabase OTP endpoint:', endpoint);
        console.info('[auth] Supabase OTP payload:', {
          email_domain: email.includes('@') ? email.split('@')[1] : null,
          create_user: payload.create_user,
          redirect_to: 'redirect_to' in payload ? payload.redirect_to : null,
        });
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: useProxy ? { 'Content-Type': 'application/json' } : getSupabaseOtpRequestConfig().headers,
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const responseBody = await response.text();
          if (process.env.NODE_ENV === 'development') {
            console.info('[auth] Supabase OTP failed response:', {
              status: response.status,
              statusText: response.statusText,
              body: responseBody,
            });
          }
          return { error: new Error(getOtpFailureMessage(response.status, responseBody)) };
        }
        if (process.env.NODE_ENV === 'development') {
          const responseBody = await response.text();
          console.info('[auth] Supabase OTP success response:', {
            status: response.status,
            statusText: response.statusText,
            body: responseBody || null,
          });
        }
        return { error: null };
      } catch {
        return { error: new Error('Síťová chyba při volání Supabase Auth OTP.') };
      }
    },
    async signOut() { invalidateSession({ redirectToLogin: false }); return { error: null }; },
  },
};
