import { NextRequest, NextResponse } from 'next/server';
import { reportOperationalEvent } from '../../../lib/services/observability';

type ClientObservabilityPayload = {
  level?: unknown;
  operation?: unknown;
  message?: unknown;
  metadata?: unknown;
};

const ALLOWED_LEVELS = new Set(['info', 'warn', 'error']);
const ALLOWED_OPERATIONS = new Set(['auth.magic_link', 'auth.sign_out']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePayload(body: unknown) {
  if (!isRecord(body)) return null;

  const payload = body as ClientObservabilityPayload;
  if (typeof payload.level !== 'string' || !ALLOWED_LEVELS.has(payload.level)) return null;
  if (typeof payload.operation !== 'string' || !ALLOWED_OPERATIONS.has(payload.operation)) return null;
  if (typeof payload.message !== 'string' || payload.message.length === 0 || payload.message.length > 200) return null;

  return {
    level: payload.level as 'info' | 'warn' | 'error',
    operation: payload.operation,
    message: payload.message,
    metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
  };
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
