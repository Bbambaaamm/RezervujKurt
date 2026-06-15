import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReservationNotificationEmail,
  getRetryDecision,
  sanitizeProviderError,
  selectAdminEmails,
  sendReservationNotificationEmails,
  type EmailMessage,
  type ReservationNotificationDetail,
} from '../supabase/functions/process-notification-outbox/notification';

const detail: ReservationNotificationDetail = {
  reservationId: '11111111-1111-1111-1111-111111111111',
  reservationDate: '2026-06-18',
  timeFrom: '16:00:00',
  timeTo: '17:00:00',
  note: '<img src=x onerror="alert(1)"> & poznámka',
  courtName: 'Kurt 1',
  userName: 'Jan Novák',
  userEmail: 'jan@example.com',
  userPhone: '+420 123 456 789',
};

test('admin bez e-mailu nebo s vypnutými notifikacemi se přeskočí', () => {
  assert.deepEqual(selectAdminEmails([
    { email: null, admin_notifications_enabled: true },
    { email: '   ', admin_notifications_enabled: true },
    { email: 'vypnuto@example.com', admin_notifications_enabled: false },
    { email: 'Admin@example.com', admin_notifications_enabled: true },
    { email: 'admin@example.com', admin_notifications_enabled: true },
  ]), ['Admin@example.com']);
});

test('uživatelská poznámka je v HTML escapovaná a v textové verzi zůstává čitelná', () => {
  const message = buildReservationNotificationEmail(
    detail,
    'admin@example.com',
    'https://rezervuj-kurt.vercel.app/',
  );

  assert.doesNotMatch(message.html, /<img/);
  assert.match(message.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; poznámka/);
  assert.match(message.text, /<img src=x onerror="alert\(1\)"> & poznámka/);
  assert.match(message.html, /https:\/\/rezervuj-kurt\.vercel\.app\/admin/);
});

test('každý admin dostane samostatný e-mail s deterministickým idempotency klíčem', async () => {
  const providerAcceptedKeys = new Set<string>();
  const delivered: EmailMessage[] = [];
  const sendEmail = async (message: EmailMessage) => {
    if (providerAcceptedKeys.has(message.idempotencyKey)) return;
    providerAcceptedKeys.add(message.idempotencyKey);
    delivered.push(message);
  };
  const input = {
    detail,
    admins: [
      { email: 'prvni@example.com', admin_notifications_enabled: true },
      { email: 'druhy@example.com', admin_notifications_enabled: true },
    ],
    siteUrl: 'https://rezervuj-kurt.vercel.app',
    sendEmail,
  };

  await sendReservationNotificationEmails(input);
  await sendReservationNotificationEmails(input);

  assert.equal(delivered.length, 2);
  assert.deepEqual(delivered.map((message) => message.to), [
    'prvni@example.com',
    'druhy@example.com',
  ]);
  assert.equal(new Set(delivered.map((message) => message.idempotencyKey)).size, 2);
});

test('změna payloadu vytvoří nový idempotency klíč', () => {
  const original = buildReservationNotificationEmail(
    detail,
    'admin@example.com',
    'https://rezervuj-kurt.vercel.app',
  );
  const changed = buildReservationNotificationEmail(
    { ...detail, userName: 'Jan Novotný' },
    'admin@example.com',
    'https://rezervuj-kurt.vercel.app',
  );

  assert.notEqual(original.idempotencyKey, changed.idempotencyKey);
});

test('chyba jednoho admina nezablokuje odeslání dalším příjemcům', async () => {
  const attemptedRecipients: string[] = [];

  await assert.rejects(
    () => sendReservationNotificationEmails({
      detail,
      admins: [
        { email: 'chybny@example.com', admin_notifications_enabled: true },
        { email: 'funkcni@example.com', admin_notifications_enabled: true },
      ],
      siteUrl: 'https://rezervuj-kurt.vercel.app',
      sendEmail: async (message) => {
        attemptedRecipients.push(message.to);
        if (message.to === 'chybny@example.com') {
          throw new Error('E-mail provider vrátil stav 422.');
        }
      },
    }),
    /Odeslání selhalo pro 1 z 2 příjemců/,
  );

  assert.deepEqual(attemptedRecipients, [
    'chybny@example.com',
    'funkcni@example.com',
  ]);
});

test('chyba providera má omezený exponenciální retry a po pátém pokusu končí', () => {
  const firstRetry = getRetryDecision(1, new Date('2026-06-15T12:00:00.000Z'));
  const terminalRetry = getRetryDecision(5, new Date('2026-06-15T12:00:00.000Z'));

  assert.deepEqual(firstRetry, {
    terminal: false,
    retryAt: '2026-06-15T12:01:00.000Z',
  });
  assert.equal(terminalRetry.terminal, true);
});

test('chyba providera neukládá API klíč', () => {
  const sanitized = sanitizeProviderError(
    new Error('Request failed Bearer re_1234567890abcdefgh'),
  );

  assert.doesNotMatch(sanitized, /re_1234567890abcdefgh/);
  assert.match(sanitized, /\[SKRYTO\]/);
});
