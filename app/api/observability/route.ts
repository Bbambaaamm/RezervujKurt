import { NextRequest, NextResponse } from 'next/server';
import { reportOperationalEvent, type ObservabilityEventInput } from '../../../lib/services/observability';

const ALLOWED_CLIENT_EVENTS = {
  'auth.magic_link': {
    level: 'warn',
    errorCode: 'AUTH_MAGIC_LINK_FAILED',
  },
  'auth.sign_out': {
    level: 'warn',
    errorCode: 'AUTH_SIGN_OUT_FAILED',
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePayload(body: unknown): ObservabilityEventInput | null {
  if (!isRecord(body)) return null;

  // Klientský endpoint přijímá pouze tři explicitně povolená pole.
  const keys = Object.keys(body);
  if (keys.length !== 3 || keys.some((key) => !['level', 'operation', 'errorCode'].includes(key))) {
    return null;
  }

  if (typeof body.operation !== 'string' || !(body.operation in ALLOWED_CLIENT_EVENTS)) return null;
  const operation = body.operation as keyof typeof ALLOWED_CLIENT_EVENTS;
  const allowedEvent = ALLOWED_CLIENT_EVENTS[operation];

  if (body.level !== allowedEvent.level || body.errorCode !== allowedEvent.errorCode) return null;

  if (operation === 'auth.magic_link') {
    return { level: 'warn', operation, errorCode: 'AUTH_MAGIC_LINK_FAILED' };
  }

  return { level: 'warn', operation, errorCode: 'AUTH_SIGN_OUT_FAILED' };
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Neplatné JSON tělo požadavku.' }, { status: 400 });
  }

  const payload = normalizePayload(body);
  if (!payload) {
    return NextResponse.json({ error: 'Neplatná observability událost.' }, { status: 400 });
  }

  reportOperationalEvent(payload);

  return NextResponse.json({ ok: true });
}
