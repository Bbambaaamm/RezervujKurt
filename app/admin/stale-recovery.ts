type StaleRecoveryAccessTokenResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export function resolveStaleRecoveryAccessToken(accessToken: string | null | undefined): StaleRecoveryAccessTokenResult {
  if (accessToken) {
    return { ok: true, token: accessToken };
  }

  return { ok: false, error: 'Pro obnovení administrace je potřeba přihlášení.' };
}
