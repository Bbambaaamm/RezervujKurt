import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMailpitDiagnostics, extractMagicLink, normalizeMagicLinkForLocalE2e, selectFreshMailpitMessages } from '../e2e/helpers/auth-bootstrap';

const supabaseVerifyUrl = 'http://127.0.0.1:54321/auth/v1/verify?token=abc123&type=magiclink&redirect_to=http%3A%2F%2F127.0.0.1%3A3000%2Frezervace';

test('extractMagicLink najde Supabase verify URL v textové části bez redakce tokenu', () => {
  const magicLink = extractMagicLink({
    Text: `Přihlášení dokončíte otevřením odkazu: ${supabaseVerifyUrl}`,
    HTML: '',
  });

  assert.equal(magicLink, supabaseVerifyUrl);
});

test('extractMagicLink najde Supabase verify URL v HTML href s escapovanými ampersandy', () => {
  const htmlUrl = supabaseVerifyUrl.replaceAll('&', '&amp;');
  const magicLink = extractMagicLink({
    Text: '',
    HTML: `<p>Pro přihlášení klikněte na <a href="${htmlUrl}">magic link</a>.</p>`,
  });

  assert.equal(magicLink, supabaseVerifyUrl);
});

test('extractMagicLink ignoruje diagnosticky redigovaný odkaz bez původního tokenu', () => {
  const magicLink = extractMagicLink({
    Text: 'http://127.0.0.1:54321/auth/v1/verify?token=<redacted>&type=magiclink&redirect_to=http%3A%2F%2F127.0.0.1%3A3000%2Frezervace',
    HTML: '',
  });

  assert.equal(magicLink, undefined);
});

test('extractMagicLink najde Supabase verify URL v HTML href zalomeném přes redirect_to', () => {
  const wrappedHtmlUrl = supabaseVerifyUrl.replace('http%3A%2F%2F127.0.0.1', 'http%3A%2F%2F\n127.0.0.1');
  const magicLink = extractMagicLink({
    Text: '',
    HTML: `<p><a href="${wrappedHtmlUrl.replaceAll('&', '&amp;')}">Přihlásit se</a></p>`,
  });

  assert.equal(magicLink, supabaseVerifyUrl);
});

test('extractMagicLink neořízne plain-text URL o redirect_to a ignoruje uzavírací závorku', () => {
  const plainTextUrl = 'http://127.0.0.1:54321/auth/v1/verify?token=abc123&type=magiclink&redirect_to=http://127.0.0.1:3000/rezervace';
  const magicLink = extractMagicLink({
    Text: `Přihlásit se ( ${plainTextUrl} ).`,
    HTML: '',
  });

  assert.equal(magicLink, plainTextUrl);
});

test('validní jediný kandidát bez odmítnutí se vrátí jako magic link a diagnostika ho označí jako accepted', () => {
  const messageBody = {
    Subject: 'Přihlášení do RezervujKurt',
    Text: `Klikněte na odkaz níže pro přihlášení: Přihlásit se ( ${supabaseVerifyUrl} )`,
    HTML: '',
  };

  const magicLink = extractMagicLink(messageBody);
  const diagnostics = buildMailpitDiagnostics({
    matchingMessagesCount: 1,
    latestMessage: {
      ID: 'message-1',
      To: [{ Address: 'e2e.member@example.com' }],
    },
    detailBody: messageBody,
  });

  assert.equal(magicLink, supabaseVerifyUrl);
  assert.match(diagnostics, /candidateCount=1/);
  assert.match(diagnostics, /acceptedCandidateFound=true/);
  assert.match(diagnostics, /rejectedCandidates=\(žádné\)/);
});

test('normalizeMagicLinkForLocalE2e přepíše Codespaces Supabase tunnel na lokální Supabase origin', () => {
  const codespacesUrl = 'https://example-name-54321.app.github.dev/auth/v1/verify?token=abc123&type=magiclink&redirect_to=http%3A%2F%2F127.0.0.1%3A3000%2Frezervace';
  const normalized = normalizeMagicLinkForLocalE2e(codespacesUrl, 'http://127.0.0.1:54321');
  const normalizedUrl = new URL(normalized);

  assert.equal(normalizedUrl.origin, 'http://127.0.0.1:54321');
  assert.equal(normalizedUrl.pathname, '/auth/v1/verify');
  assert.equal(normalizedUrl.searchParams.get('token'), 'abc123');
  assert.equal(normalizedUrl.searchParams.get('type'), 'magiclink');
  assert.equal(normalizedUrl.searchParams.get('redirect_to'), 'http://127.0.0.1:3000/rezervace');
  assert.ok(!normalized.startsWith('https://github.com/login'));
  assert.ok(!normalizedUrl.hostname.endsWith('.app.github.dev'));
});

test('normalizeMagicLinkForLocalE2e dekóduje Codespaces postback tunnel rd na lokální verify URL', () => {
  const verifyUrl = 'http://127.0.0.1:54321/auth/v1/verify?token=rd-token&type=magiclink&redirect_to=http%3A%2F%2F127.0.0.1%3A3000%2Frezervace';
  const tunnelUrl = `https://example-name-54321.app.github.dev/auth/postback/tunnel?rd=${encodeURIComponent(verifyUrl)}`;
  const normalized = normalizeMagicLinkForLocalE2e(tunnelUrl, 'http://127.0.0.1:54321');
  const normalizedUrl = new URL(normalized);

  assert.equal(normalizedUrl.origin, 'http://127.0.0.1:54321');
  assert.equal(normalizedUrl.pathname, '/auth/v1/verify');
  assert.equal(normalizedUrl.searchParams.get('token'), 'rd-token');
  assert.equal(normalizedUrl.searchParams.get('type'), 'magiclink');
  assert.equal(normalizedUrl.searchParams.get('redirect_to'), 'http://127.0.0.1:3000/rezervace');
  assert.ok(!normalized.startsWith('https://github.com/login'));
  assert.ok(!normalizedUrl.hostname.endsWith('.app.github.dev'));
});

test('selectFreshMailpitMessages vrací nejnovější čerstvý e-mail jako první', () => {
  const startedAt = Date.parse('2026-06-22T10:00:10.000Z');
  const messages = [
    { ID: 'old-expired-link', CreatedAt: '2026-06-22T10:00:10.000Z' },
    { ID: 'new-valid-link', CreatedAt: '2026-06-22T10:00:12.000Z' },
    { ID: 'too-old-link', CreatedAt: '2026-06-22T10:00:00.000Z' },
  ];

  assert.deepEqual(
    selectFreshMailpitMessages(messages, startedAt).map((message) => message.ID),
    ['new-valid-link', 'old-expired-link'],
  );
});
