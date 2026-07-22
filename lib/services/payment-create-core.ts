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

function parseReservationTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');

  if (hours > 23 || minutes > 59 || seconds !== 0) return null;

  return (hours * 60) + minutes;
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
