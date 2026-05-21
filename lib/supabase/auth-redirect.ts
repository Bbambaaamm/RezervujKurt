export function buildEmailRedirectTo(options: {
  envRedirectUrl?: string;
  envAuthRedirectUrl?: string;
  windowOrigin?: string;
}): string {
  const redirectBase = options.envRedirectUrl?.trim() || options.envAuthRedirectUrl?.trim();
  const baseUrl = redirectBase || options.windowOrigin?.trim() || '';

  if (!baseUrl) return '/rezervace';

  try {
    return new URL('/rezervace', baseUrl).toString();
  } catch {
    return '/rezervace';
  }
}
