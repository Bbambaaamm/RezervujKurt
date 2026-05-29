export type OtpRequestPayload = {
  email: string;
  create_user: boolean;
  redirect_to?: string;
};

export function isValidOtpEmail(email: unknown): email is string {
  return typeof email === 'string' && email.trim().length > 3 && email.includes('@');
}

export function normalizeOtpRedirectTo(redirectTo?: string): string | undefined {
  if (!redirectTo) return undefined;
  const trimmed = redirectTo.trim();
  if (!trimmed) return undefined;

  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

export function buildOtpPayload(email: string, emailRedirectTo?: string, options?: { createUser?: boolean }): OtpRequestPayload {
  const redirectTo = normalizeOtpRedirectTo(emailRedirectTo);
  const createUser = options?.createUser ?? false;

  return {
    email,
    create_user: createUser,
    ...(redirectTo ? { redirect_to: redirectTo } : {}),
  };
}

export function getOtpFailureMessage(status: number, responseBody: string): string {
  const fallbackMessage = `Supabase Auth OTP selhalo (${status}).`;

  try {
    const parsed = JSON.parse(responseBody) as { error_code?: unknown; msg?: unknown; message?: unknown };
    const errorCode = typeof parsed.error_code === 'string' ? parsed.error_code : null;

    if (status === 422 && errorCode === 'otp_disabled') {
      return 'Lokální Supabase Auth vrátilo otp_disabled. V supabase/config.toml musí být povolené [auth].enable_signup = true a [auth.email].enable_signup = true. Pokud už tam jsou, restartujte lokální Supabase stack příkazem: npx supabase stop && npx supabase start.';
    }

    const message = typeof parsed.msg === 'string' ? parsed.msg : typeof parsed.message === 'string' ? parsed.message : null;
    return message ? `${fallbackMessage} ${message}` : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export function getSupabaseOtpRequestConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Chybí NEXT_PUBLIC_SUPABASE_URL nebo NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return {
    endpoint: `${supabaseUrl}/auth/v1/otp`,
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
  };
}

export function shouldUseOtpProxyForRuntime(windowOrigin?: string): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (!windowOrigin) return false;
  return windowOrigin.includes('.app.github.dev');
}

export function resolveOtpEndpoint(directEndpoint: string, windowOrigin?: string): string {
  return shouldUseOtpProxyForRuntime(windowOrigin) ? '/api/auth/otp' : directEndpoint;
}
