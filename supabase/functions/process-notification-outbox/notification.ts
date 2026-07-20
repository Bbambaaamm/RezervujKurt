export type NotificationOutboxEvent = {
  id: number;
  reservation_id: string;
  event_type: string;
  payload: unknown;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempt_count: number;
};

export type ReservationNotificationDetail = {
  reservationId: string;
  reservationDate: string;
  timeFrom: string;
  timeTo: string;
  note: string | null;
  courtName: string;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
  userRole: 'user' | 'member' | 'admin' | null;
};

export type AdminRecipient = {
  email: string | null;
  admin_notifications_enabled: boolean;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type EmailSender = (message: EmailMessage) => Promise<void>;

export type NotificationPayload = {
  messages: EmailMessage[];
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function selectAdminEmails(admins: AdminRecipient[]): string[] {
  const uniqueEmails = new Map<string, string>();

  for (const admin of admins) {
    const email = admin.email?.trim();
    if (!admin.admin_notifications_enabled || !email) continue;

    const normalizedEmail = email.toLocaleLowerCase('en-US');
    if (!uniqueEmails.has(normalizedEmail)) {
      uniqueEmails.set(normalizedEmail, email);
    }
  }

  return [...uniqueEmails.values()];
}

function formatTime(value: string): string {
  return value.slice(0, 5);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}. ${month}. ${year}`;
}

function safeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

const NON_MEMBER_APPROVED_RESERVATION_ACCESS_TEXT = 'Pokud by byl přední vchod zamčený, použijte prosím zadní vchod. Na zadním vchodu je visací zámek na kód 2275.';
const NON_MEMBER_APPROVED_RESERVATION_PAYMENT_TEXT = [
  'Hodina hry stojí 250 Kč.',
  'Platba probíhá přes QR kód na nástěnce na budově, kde se zároveň zapíšete do evidence hry nečlenů.',
].join(' ');

function hashIdempotencyValue(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildReservationNotificationEmail(
  detail: ReservationNotificationDetail,
  recipient: string,
  siteUrl: string,
): EmailMessage {
  const note = detail.note?.trim() || 'Bez poznámky';
  const userContact = detail.userEmail?.trim() || 'E-mail neuveden';
  const phone = detail.userPhone?.trim() || 'Telefon neuveden';
  const adminUrl = `${safeSiteUrl(siteUrl)}/admin`;
  const subject = `Nová rezervace čeká na schválení – ${detail.courtName}`;

  const text = [
    'Byla vytvořena nová rezervace.',
    '',
    `Kurt: ${detail.courtName}`,
    `Datum: ${formatDate(detail.reservationDate)}`,
    `Čas: ${formatTime(detail.timeFrom)}–${formatTime(detail.timeTo)}`,
    `Uživatel: ${detail.userName}`,
    `E-mail: ${userContact}`,
    `Telefon: ${phone}`,
    `Poznámka: ${note}`,
    '',
    `Rezervaci zkontrolujete v administraci: ${adminUrl}`,
  ].join('\n');

  const html = `
    <h1>Nová rezervace čeká na schválení</h1>
    <p>Byla vytvořena nová rezervace.</p>
    <table>
      <tbody>
        <tr><th align="left">Kurt</th><td>${escapeHtml(detail.courtName)}</td></tr>
        <tr><th align="left">Datum</th><td>${escapeHtml(formatDate(detail.reservationDate))}</td></tr>
        <tr><th align="left">Čas</th><td>${escapeHtml(formatTime(detail.timeFrom))}–${escapeHtml(formatTime(detail.timeTo))}</td></tr>
        <tr><th align="left">Uživatel</th><td>${escapeHtml(detail.userName)}</td></tr>
        <tr><th align="left">E-mail</th><td>${escapeHtml(userContact)}</td></tr>
        <tr><th align="left">Telefon</th><td>${escapeHtml(phone)}</td></tr>
        <tr><th align="left">Poznámka</th><td>${escapeHtml(note)}</td></tr>
      </tbody>
    </table>
    <p><a href="${escapeHtml(adminUrl)}">Otevřít administraci rezervací</a></p>
  `.trim();

  return {
    to: recipient,
    subject,
    html,
    text,
    idempotencyKey: `reservation-created-${detail.reservationId}-${hashIdempotencyValue(recipient.toLocaleLowerCase('en-US'))}`,
  };
}

export function buildReservationNotificationEmails(input: {
  detail: ReservationNotificationDetail;
  admins: AdminRecipient[];
  siteUrl: string;
}): EmailMessage[] {
  return selectAdminEmails(input.admins).map((recipient) => buildReservationNotificationEmail(
    input.detail,
    recipient,
    input.siteUrl,
  ));
}

export function buildReservationApprovedEmail(
  detail: ReservationNotificationDetail,
  siteUrl: string,
): EmailMessage | null {
  const recipient = detail.userEmail?.trim();
  if (!recipient) return null;

  const reservationsUrl = `${safeSiteUrl(siteUrl)}/moje-rezervace`;
  const subject = `Rezervace byla schválena – ${detail.courtName}`;
  const includeNonMemberAccessInfo = detail.userRole !== 'member' && detail.userRole !== 'admin';
  const text = [
    'Dobrý den,',
    '',
    'vaše rezervace byla schválena.',
    '',
    `Kurt: ${detail.courtName}`,
    `Datum: ${formatDate(detail.reservationDate)}`,
    `Čas: ${formatTime(detail.timeFrom)}–${formatTime(detail.timeTo)}`,
    '',
    ...(
      includeNonMemberAccessInfo
        ? [NON_MEMBER_APPROVED_RESERVATION_ACCESS_TEXT, NON_MEMBER_APPROVED_RESERVATION_PAYMENT_TEXT, '']
        : []
    ),
    'Rezervaci najdete v přehledu „Moje rezervace“:',
    reservationsUrl,
    '',
    'S pozdravem',
    'RezervujKurt',
  ].join('\n');
  const html = `
    <p>Dobrý den,</p>
    <p>vaše rezervace byla schválena.</p>
    <table>
      <tbody>
        <tr><th align="left">Kurt</th><td>${escapeHtml(detail.courtName)}</td></tr>
        <tr><th align="left">Datum</th><td>${escapeHtml(formatDate(detail.reservationDate))}</td></tr>
        <tr><th align="left">Čas</th><td>${escapeHtml(formatTime(detail.timeFrom))}–${escapeHtml(formatTime(detail.timeTo))}</td></tr>
      </tbody>
    </table>
    ${includeNonMemberAccessInfo
      ? `<p>${escapeHtml(NON_MEMBER_APPROVED_RESERVATION_ACCESS_TEXT)}</p><p>${escapeHtml(NON_MEMBER_APPROVED_RESERVATION_PAYMENT_TEXT)}</p>`
      : ''}
    <p>Rezervaci najdete v přehledu <a href="${escapeHtml(reservationsUrl)}">Moje rezervace</a>.</p>
    <p>S pozdravem<br>RezervujKurt</p>
  `.trim();

  return {
    to: recipient,
    subject,
    html,
    text,
    idempotencyKey: `reservation-approved-${detail.reservationId}-${hashIdempotencyValue(recipient.toLocaleLowerCase('en-US'))}`,
  };
}

function isEmailMessage(value: unknown): value is EmailMessage {
  if (!value || typeof value !== 'object') return false;

  const message = value as Record<string, unknown>;
  return (
    typeof message.to === 'string'
    && typeof message.subject === 'string'
    && typeof message.html === 'string'
    && typeof message.text === 'string'
    && typeof message.idempotencyKey === 'string'
  );
}

export function getNotificationPayload(value: unknown): NotificationPayload | null {
  if (!value || typeof value !== 'object') return null;

  const messages = (value as Record<string, unknown>).messages;
  if (!Array.isArray(messages) || !messages.every(isEmailMessage)) return null;

  return { messages };
}

export function getRetryDecision(attemptCount: number, now = new Date()): {
  terminal: boolean;
  retryAt: string;
} {
  const maxAttempts = 5;
  const terminal = attemptCount >= maxAttempts;
  const delayMinutes = Math.min(2 ** Math.max(attemptCount - 1, 0), 60);

  return {
    terminal,
    retryAt: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
  };
}

export function sanitizeProviderError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Neznámá chyba při odesílání e-mailu.';
  }

  return error.message
    .replace(/Bearer\s+\S+/gi, 'Bearer [SKRYTO]')
    .replace(/\b(re_[A-Za-z0-9_-]{8,})\b/g, '[SKRYTO]')
    .slice(0, 500);
}

export async function sendReservationNotificationEmails(input: {
  messages: EmailMessage[];
  sendEmail: EmailSender;
}): Promise<number> {
  const failures: unknown[] = [];

  for (const message of input.messages) {
    try {
      await input.sendEmail(message);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    const firstError = sanitizeProviderError(failures[0]);
    throw new Error(
      `Odeslání selhalo pro ${failures.length} z ${input.messages.length} příjemců. První chyba: ${firstError}`,
    );
  }

  return input.messages.length;
}
