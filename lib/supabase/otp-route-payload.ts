export type OtpRouteInput = {
  redirect_to?: unknown;
  emailRedirectTo?: unknown;
};

export function resolveOtpRouteRedirectTo(input: OtpRouteInput): string | undefined {
  const raw = typeof input.redirect_to === 'string'
    ? input.redirect_to
    : typeof input.emailRedirectTo === 'string'
      ? input.emailRedirectTo
      : undefined;

  const trimmed = raw?.trim();
  return trimmed || undefined;
}
