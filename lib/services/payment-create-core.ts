import { createHash } from 'node:crypto';

export type PaymentReservationUserRole = 'anonymous' | 'user' | 'member' | 'admin';

export type ReservationPaymentFlow = 'requires_login' | 'without_payment' | 'gopay_payment';

type ReservationPriceInput = {
  timeFrom: string;
  timeTo: string;
  pricePerHourCents: number;
};

type PaymentExpirationInput = {
  now: Date;
  ttlMinutes: number;
};

export type PaymentIdempotencyKeyInput = {
  userId: string;
  courtId: number;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
  amountCents: number;
  currency: 'CZK';
};

function parseReservationTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');

  if (hours > 23 || minutes > 59 || seconds !== 0) return null;

  return (hours * 60) + minutes;
}

function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || year > 9999) return false;

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

export function resolveReservationPaymentFlow(role: PaymentReservationUserRole): ReservationPaymentFlow {
  switch (role) {
    case 'anonymous':
      return 'requires_login';
    case 'user':
      return 'gopay_payment';
    case 'member':
    case 'admin':
      return 'without_payment';
    default: {
      const exhaustiveCheck: never = role;
      throw new Error(`Nepodporovaná role platebního flow: ${String(exhaustiveCheck)}`);
    }
  }
}

export function calculateReservationPriceCents(input: ReservationPriceInput): number {
  if (!Number.isSafeInteger(input.pricePerHourCents) || input.pricePerHourCents <= 0) {
    throw new Error('Hodinová cena rezervace musí být kladná bezpečná celočíselná hodnota v haléřích.');
  }

  const fromMinutes = parseReservationTimeToMinutes(input.timeFrom);
  const toMinutes = parseReservationTimeToMinutes(input.timeTo);

  if (fromMinutes === null || toMinutes === null || toMinutes <= fromMinutes) {
    throw new Error('Časový rozsah rezervace není platný.');
  }

  const durationMinutes = toMinutes - fromMinutes;
  const multipliedAmount = durationMinutes * input.pricePerHourCents;

  if (!Number.isSafeInteger(multipliedAmount)) {
    throw new Error('Vypočtená cena rezervace je mimo podporovaný rozsah.');
  }

  const amountCents = multipliedAmount / 60;

  if (!Number.isSafeInteger(amountCents)) {
    throw new Error('Vypočtená cena rezervace musí vycházet na celé haléře.');
  }

  return amountCents;
}

export function calculatePaymentExpiresAt(input: PaymentExpirationInput): Date {
  if (!Number.isFinite(input.now.getTime())) {
    throw new Error('Výchozí čas pro expiraci platby není platný.');
  }

  if (!Number.isSafeInteger(input.ttlMinutes) || input.ttlMinutes <= 0) {
    throw new Error('TTL platby musí být kladný bezpečný počet minut.');
  }

  const expiresAtMs = input.now.getTime() + (input.ttlMinutes * 60 * 1000);

  if (!Number.isSafeInteger(expiresAtMs)) {
    throw new Error('Výsledný čas expirace je mimo podporovaný rozsah.');
  }

  const expiresAt = new Date(expiresAtMs);

  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error('Výsledný čas expirace platby není platný.');
  }

  return expiresAt;
}


function assertIdempotencyTextPart(name: string, value: string, pattern: RegExp) {
  if (!pattern.test(value)) {
    throw new Error(`Hodnota ${name} není platná pro idempotency key platby.`);
  }
}

export function buildReservationPaymentIdempotencyPayload(input: PaymentIdempotencyKeyInput): string {
  assertIdempotencyTextPart('userId', input.userId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  if (!isValidIsoDate(input.reservationDate)) {
    throw new Error('Datum rezervace není platné pro idempotency key platby.');
  }

  const fromMinutes = parseReservationTimeToMinutes(input.timeFrom);
  const toMinutes = parseReservationTimeToMinutes(input.timeTo);

  if (fromMinutes === null || toMinutes === null || toMinutes <= fromMinutes) {
    throw new Error('Časový rozsah rezervace není platný pro idempotency key platby.');
  }

  if (!Number.isSafeInteger(input.courtId) || input.courtId <= 0) {
    throw new Error('Kurt rezervace není platný pro idempotency key platby.');
  }

  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('Částka rezervace není platná pro idempotency key platby.');
  }

  if (input.currency !== 'CZK') {
    throw new Error('Měna rezervace není platná pro idempotency key platby.');
  }

  return JSON.stringify({
    version: 1,
    purpose: 'reservation-payment',
    userId: input.userId.toLowerCase(),
    courtId: input.courtId,
    reservationDate: input.reservationDate,
    timeFrom: formatMinutesAsTime(fromMinutes),
    timeTo: formatMinutesAsTime(toMinutes),
    amountCents: input.amountCents,
    currency: input.currency,
  });
}

export function buildReservationPaymentIdempotencyKey(input: PaymentIdempotencyKeyInput): string {
  const payload = buildReservationPaymentIdempotencyPayload(input);
  const payloadHash = createHash('sha256').update(payload).digest('hex');

  return `reservation-payment:v1:${payloadHash}`;
}
