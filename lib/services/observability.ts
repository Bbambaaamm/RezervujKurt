export type ObservabilityEnvironment = 'development' | 'staging' | 'production' | 'test' | 'unknown';
export type ObservabilityLevel = 'info' | 'warn' | 'error';
export type ObservabilityOperation =
  | 'auth.magic_link'
  | 'auth.sign_out'
  | 'reservation.create'
  | 'reservation.update'
  | 'reservation.cancel';
export type ObservabilityErrorCode =
  | 'AUTH_MAGIC_LINK_FAILED'
  | 'AUTH_SIGN_OUT_FAILED'
  | 'RESERVATION_SESSION_MISSING'
  | 'RESERVATION_WRITE_FAILED'
  | 'RESERVATION_CANCEL_FAILED';

export type ObservabilityMetadata = {
  status?: number;
};

export type ObservabilityEventInput = {
  environment?: string;
} & (
  | { level: 'warn'; operation: 'auth.magic_link'; errorCode: 'AUTH_MAGIC_LINK_FAILED' }
  | { level: 'warn'; operation: 'auth.sign_out'; errorCode: 'AUTH_SIGN_OUT_FAILED' }
  | { level: 'warn'; operation: 'reservation.cancel'; errorCode: 'RESERVATION_SESSION_MISSING' }
  | {
      level: 'error';
      operation: 'reservation.create' | 'reservation.update';
      errorCode: 'RESERVATION_WRITE_FAILED';
      metadata?: ObservabilityMetadata;
    }
  | {
      level: 'error';
      operation: 'reservation.cancel';
      errorCode: 'RESERVATION_CANCEL_FAILED';
      metadata?: ObservabilityMetadata;
    }
);

function resolveRuntimeEnvironment(value = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV): ObservabilityEnvironment {
  if (value === 'development' || value === 'staging' || value === 'production' || value === 'test') {
    return value;
  }

  if (value === 'preview') {
    return 'staging';
  }

  return 'unknown';
}

export function buildObservabilityEvent(input: ObservabilityEventInput) {
  const status = 'metadata' in input ? input.metadata?.status : undefined;

  return {
    event: 'rezervuj_kurt.observability' as const,
    level: input.level,
    environment: resolveRuntimeEnvironment(input.environment),
    operation: input.operation,
    errorCode: input.errorCode,
    ...(status !== undefined ? { metadata: { status } } : {}),
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
