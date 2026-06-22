function isVercelPreviewOrigin(origin?: string): boolean {
  if (!origin) return false;

  try {
    return new URL(origin).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export function buildEmailRedirectTo(options: {
  envRedirectUrl?: string;
  envAuthRedirectUrl?: string;
  windowOrigin?: string;
}): string {
  const windowOrigin = options.windowOrigin?.trim();
  const redirectBase = isVercelPreviewOrigin(windowOrigin)
    ? windowOrigin
    : options.envRedirectUrl?.trim() || options.envAuthRedirectUrl?.trim() || windowOrigin;
  const baseUrl = redirectBase || '';

  if (!baseUrl) return '/rezervace';

  try {
    return new URL('/rezervace', baseUrl).toString();
  } catch {
    return '/rezervace';
  }
}
