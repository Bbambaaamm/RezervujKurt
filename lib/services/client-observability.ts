type ClientOperationalEventInput = {
  level: 'info' | 'warn' | 'error';
  operation: 'auth.magic_link' | 'auth.sign_out';
  message: string;
  metadata?: Record<string, unknown>;
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
