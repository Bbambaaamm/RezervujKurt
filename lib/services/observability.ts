type ObservabilityEnvironment = 'development' | 'staging' | 'production' | 'test' | 'unknown';
type ObservabilityLevel = 'info' | 'warn' | 'error';

type ObservabilityEventInput = {
  level: ObservabilityLevel;
  operation: string;
  message: string;
  environment?: string;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY_PATTERN = /(token|secret|key|authorization|magic|otp|password|email)/i;

function resolveRuntimeEnvironment(value = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV): ObservabilityEnvironment {
  if (value === 'development' || value === 'staging' || value === 'production' || value === 'test') {
    return value;
  }

  if (value === 'preview') {
    return 'staging';
  }

  return 'unknown';
}

function sanitizeObservabilityMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : value,
    ]),
  );
}

export function buildObservabilityEvent(input: ObservabilityEventInput) {
  return {
    event: 'rezervuj_kurt.observability',
    level: input.level,
    environment: resolveRuntimeEnvironment(input.environment),
    operation: input.operation,
    message: input.message,
    metadata: sanitizeObservabilityMetadata(input.metadata),
    timestamp: new Date().toISOString(),
  };
}

export function reportOperationalEvent(input: ObservabilityEventInput): void {
  const event = buildObservabilityEvent(input);

  if (input.level === 'error') {
    console.error(event);
    return;
  }

  if (input.level === 'warn') {
    console.warn(event);
    return;
  }

  console.info(event);
}
