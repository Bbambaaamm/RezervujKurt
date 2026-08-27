type ClientOperationalEventInput =
  | {
      level: 'warn';
      operation: 'auth.magic_link';
      errorCode: 'AUTH_MAGIC_LINK_FAILED';
    }
  | {
      level: 'warn';
      operation: 'auth.sign_out';
      errorCode: 'AUTH_SIGN_OUT_FAILED';
    };

export function reportClientOperationalEvent(input: ClientOperationalEventInput): void {
  fetch('/api/observability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {
    // Observabilita nesmí rozbít uživatelský auth flow.
  });
}
