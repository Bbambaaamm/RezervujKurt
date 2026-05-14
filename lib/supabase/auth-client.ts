type AuthSession = {
  access_token: string;
  user: {
    id: string;
    email?: string;
  };
};

type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';
type AuthListener = (event: AuthChangeEvent, session: AuthSession | null) => void;

const SESSION_STORAGE_KEY = 'rezervujkurt.auth.session';
const listeners = new Set<AuthListener>();

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try { return JSON.parse(atob(token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '')); } catch { return null; }
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

function readSessionFromUrl(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  const payload = parseJwtPayload(accessToken);
  const userId = typeof payload?.sub === 'string' ? payload.sub : '';
  const email = typeof payload?.email === 'string' ? payload.email : undefined;
  if (!userId) return null;
  const session: AuthSession = { access_token: accessToken, user: { id: userId, email } };
  setStoredSession(session);
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  emitAuthChange('SIGNED_IN', session);
  return session;
}

export const supabaseAuthClient = {
  auth: {
    async getSession() {
      const session = readSessionFromUrl() ?? getStoredSession();
      return { data: { session } };
    },
    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
    },
    async signInWithOtp({ email, options }: { email: string; options?: { emailRedirectTo?: string } }) {
      const config = getSupabaseConfig();
      if (!config) return { error: new Error('Chybí NEXT_PUBLIC_SUPABASE_URL nebo NEXT_PUBLIC_SUPABASE_ANON_KEY.') };
      const endpoint = `${config.url}/auth/v1/otp`;
      const payload = {
        email,
        create_user: true,
        options: {
          email_redirect_to: options?.emailRedirectTo,
        },
      };

      if (process.env.NODE_ENV === 'development') {
        console.info('[auth] Supabase OTP endpoint:', endpoint);
        console.info('[auth] Supabase OTP payload:', {
          email_domain: email.includes('@') ? email.split('@')[1] : null,
          create_user: payload.create_user,
          options: {
            email_redirect_to: payload.options.email_redirect_to,
          },
        });
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: config.anonKey },
          body: JSON.stringify(payload),
        });
        if (!response.ok) return { error: new Error(`Supabase Auth OTP selhalo (${response.status}).`) };
        return { error: null };
      } catch {
        return { error: new Error('Síťová chyba při volání Supabase Auth OTP.') };
      }
    },
    async signOut() { setStoredSession(null); emitAuthChange('SIGNED_OUT', null); return { error: null }; },
  },
};
