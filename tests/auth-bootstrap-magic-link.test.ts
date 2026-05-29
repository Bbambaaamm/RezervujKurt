import test from 'node:test';
import assert from 'node:assert/strict';

import { extractMagicLink } from '../e2e/helpers/auth-bootstrap';

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
