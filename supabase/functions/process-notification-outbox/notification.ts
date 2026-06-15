export type NotificationOutboxEvent = {
  id: number;
  reservation_id: string;
  event_type: string;
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
  detail: ReservationNotificationDetail;
  admins: AdminRecipient[];
  siteUrl: string;
  sendEmail: EmailSender;
}): Promise<number> {
  const recipients = selectAdminEmails(input.admins);

  for (const recipient of recipients) {
    await input.sendEmail(buildReservationNotificationEmail(
      input.detail,
      recipient,
      input.siteUrl,
    ));
  }

  return recipients.length;
}
