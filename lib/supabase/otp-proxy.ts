export type OtpRequestPayload = {
  email: string;
  create_user: true;
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

export function buildOtpPayload(email: string, emailRedirectTo?: string): OtpRequestPayload {
  const redirectTo = normalizeOtpRedirectTo(emailRedirectTo);

  return {
    email,
    create_user: true,
    ...(redirectTo ? { redirect_to: redirectTo } : {}),
  };
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
