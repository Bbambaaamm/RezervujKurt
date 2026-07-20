import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReservationApprovedEmail,
  buildReservationNotificationEmail,
  buildReservationNotificationEmails,
  getNotificationPayload,
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
  userRole: 'user',
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
    messages: buildReservationNotificationEmails({
      detail,
      admins: [
        { email: 'prvni@example.com', admin_notifications_enabled: true },
        { email: 'druhy@example.com', admin_notifications_enabled: true },
      ],
      siteUrl: 'https://rezervuj-kurt.vercel.app',
    }),
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

test('uložený payload zachová přesnou zprávu a idempotency klíč pro retry', () => {
  const original = buildReservationNotificationEmails({
    detail,
    admins: [{ email: 'admin@example.com', admin_notifications_enabled: true }],
    siteUrl: 'https://rezervuj-kurt.vercel.app',
  });
  const payload = getNotificationPayload(JSON.parse(JSON.stringify({ messages: original })));

  assert.deepEqual(payload?.messages, original);
});

test('chyba jednoho admina nezablokuje odeslání dalším příjemcům', async () => {
  const attemptedRecipients: string[] = [];

  await assert.rejects(
    () => sendReservationNotificationEmails({
      messages: buildReservationNotificationEmails({
        detail,
        admins: [
          { email: 'chybny@example.com', admin_notifications_enabled: true },
          { email: 'funkcni@example.com', admin_notifications_enabled: true },
        ],
        siteUrl: 'https://rezervuj-kurt.vercel.app',
      }),
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

test('neplatný uložený payload se nepoužije k odesílání', () => {
  assert.equal(getNotificationPayload({ messages: [{ to: 'admin@example.com' }] }), null);
  assert.equal(getNotificationPayload({}), null);
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

test('approved e-mail pro ručně schváleného nečlena obsahuje instrukce k zámku', () => {
  const message = buildReservationApprovedEmail({
    ...detail,
    courtName: 'Kurt <script>alert("x")</script>',
    userEmail: 'uzivatel@example.com',
  }, 'https://rezervuj-kurt.vercel.app/');

  assert.ok(message);
  assert.equal(message.to, 'uzivatel@example.com');
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(message.text, /Kurt <script>alert\("x"\)<\/script>/);
  assert.match(message.text, /Moje rezervace/);
  assert.match(message.html, /\/moje-rezervace/);
  assert.match(message.text, /přední vchod zamčený/);
  assert.match(message.text, /zadní vchod/);
  assert.match(message.text, /2275/);
  assert.match(message.text, /250 Kč/);
  assert.match(message.text, /QR kód na nástěnce/);
  assert.match(message.html, /přední vchod zamčený/);
  assert.match(message.html, /zadní vchod/);
  assert.match(message.html, /2275/);
  assert.match(message.html, /250 Kč/);
  assert.match(message.html, /QR kód na nástěnce/);
  assert.match(message.idempotencyKey, /^reservation-approved-/);
});

test('approved e-mail při chybějící roli bere uživatele bezpečně jako nečlena', () => {
  const message = buildReservationApprovedEmail({
    ...detail,
    userRole: null,
  }, 'https://rezervuj-kurt.vercel.app');

  assert.ok(message);
  assert.match(message.text, /zadní vchod/);
  assert.match(message.text, /2275/);
  assert.match(message.text, /250 Kč/);
  assert.match(message.text, /QR kód na nástěnce/);
  assert.match(message.html, /zadní vchod/);
  assert.match(message.html, /2275/);
  assert.match(message.html, /250 Kč/);
  assert.match(message.html, /QR kód na nástěnce/);
});

test('approved e-mail pro člena neobsahuje instrukce k zadnímu vchodu', () => {
  const message = buildReservationApprovedEmail({
    ...detail,
    userRole: 'member',
  }, 'https://rezervuj-kurt.vercel.app');

  assert.ok(message);
  assert.doesNotMatch(message.text, /zadní vchod/);
  assert.doesNotMatch(message.text, /2275/);
  assert.doesNotMatch(message.text, /250 Kč/);
  assert.doesNotMatch(message.text, /QR kód na nástěnce/);
  assert.doesNotMatch(message.html, /zadní vchod/);
  assert.doesNotMatch(message.html, /2275/);
  assert.doesNotMatch(message.html, /250 Kč/);
  assert.doesNotMatch(message.html, /QR kód na nástěnce/);
});

test('approved e-mail se neposílá adminům a retry zachová idempotenci uživatele', async () => {
  const message = buildReservationApprovedEmail(detail, 'https://rezervuj-kurt.vercel.app');
  assert.ok(message);

  const acceptedKeys = new Set<string>();
  const delivered: EmailMessage[] = [];
  const input = {
    messages: [message],
    sendEmail: async (email: EmailMessage) => {
      if (acceptedKeys.has(email.idempotencyKey)) return;
      acceptedKeys.add(email.idempotencyKey);
      delivered.push(email);
    },
  };

  await sendReservationNotificationEmails(input);
  await sendReservationNotificationEmails(input);

  assert.deepEqual(delivered.map((email) => email.to), ['jan@example.com']);
  assert.ok(delivered.every((email) => email.to !== 'admin@example.com'));
});

test('approved event bez e-mailu uživatele nevytvoří zprávu', () => {
  assert.equal(buildReservationApprovedEmail({
    ...detail,
    userEmail: '   ',
  }, 'https://rezervuj-kurt.vercel.app'), null);
  assert.equal(buildReservationApprovedEmail({
    ...detail,
    userEmail: null,
  }, 'https://rezervuj-kurt.vercel.app'), null);
});
