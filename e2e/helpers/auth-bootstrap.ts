import { expect, type Page } from '@playwright/test';

import { buildSupabaseOtpEndpoint } from '../../lib/supabase/otp-proxy';

const MAILPIT_BASE_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';
const MAGIC_LINK_TIMEOUT_MS = Number(process.env.E2E_MAGIC_LINK_TIMEOUT_MS ?? '20000');
const MAILPIT_FRESH_MESSAGE_TOLERANCE_MS = 5000;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_SESSION_STORAGE_KEY = 'rezervujkurt.auth.session';
const AUTH_SESSION_TIMEOUT_MS = Number(process.env.E2E_AUTH_SESSION_TIMEOUT_MS ?? '15000');
const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeCommonHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeMailpitTransferContent(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/=\r?\n/g, '').replace(/=3D/gi, '=');
}

function normalizeMailpitContent(value: unknown): string {
  return decodeCommonHtmlEntities(normalizeMailpitTransferContent(value));
}

function buildE2eEmailRedirectTo(): string {
  try {
    return new URL('/rezervace', APP_BASE_URL).toString();
  } catch {
    return 'http://127.0.0.1:3000/rezervace';
  }
}

type StoredAuthSessionDiagnostics = {
  exists: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  email?: string;
  userId?: string;
  parseError?: string;
};

async function getStoredAuthSessionDiagnostics(page: Page): Promise<StoredAuthSessionDiagnostics> {
  return page.evaluate((storageKey) => {
    const rawSession = window.localStorage.getItem(storageKey);
    if (!rawSession) {
      return { exists: false, hasAccessToken: false, hasRefreshToken: false };
    }

    try {
      const session = JSON.parse(rawSession) as {
        access_token?: unknown;
        refresh_token?: unknown;
        user?: { id?: unknown; email?: unknown };
      };

      return {
        exists: true,
        hasAccessToken: typeof session.access_token === 'string' && session.access_token.length > 0,
        hasRefreshToken: typeof session.refresh_token === 'string' && session.refresh_token.length > 0,
        email: typeof session.user?.email === 'string' ? session.user.email : undefined,
        userId: typeof session.user?.id === 'string' ? session.user.id : undefined,
      };
    } catch (error) {
      return {
        exists: true,
        hasAccessToken: false,
        hasRefreshToken: false,
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
  }, AUTH_SESSION_STORAGE_KEY);
}

function formatStoredAuthSessionDiagnostics(diagnostics: StoredAuthSessionDiagnostics): string {
  return `localStorage.${AUTH_SESSION_STORAGE_KEY}: exists=${diagnostics.exists}; `
    + `hasAccessToken=${diagnostics.hasAccessToken}; hasRefreshToken=${diagnostics.hasRefreshToken}; `
    + `email=${diagnostics.email ?? '(žádný)'}; userId=${diagnostics.userId ?? '(žádný)'}; `
    + `parseError=${diagnostics.parseError ?? '(žádná)'}`;
}

async function buildCurrentPageDiagnostics(page: Page): Promise<string> {
  const visibleText = shortExcerpt(await getVisiblePageText(page), 500);
  const storageDiagnostics = await getStoredAuthSessionDiagnostics(page).catch((error) => ({
    exists: false,
    hasAccessToken: false,
    hasRefreshToken: false,
    parseError: error instanceof Error ? error.message : String(error),
  }));
  const cookies = await page.context().cookies().catch(() => []);
  const cookieNames = cookies.map((cookie) => cookie.name).sort().join(', ') || '(žádné)';

  return `URL: ${redactSensitive(page.url())}. Viditelný text: ${visibleText}. `
    + `${formatStoredAuthSessionDiagnostics(storageDiagnostics)}; cookies=${redactSensitive(cookieNames)}`;
}

async function waitForStoredAuthSession(page: Page, email: string): Promise<void> {
  const startedAt = Date.now();
  let lastDiagnostics: StoredAuthSessionDiagnostics | undefined;

  while (Date.now() - startedAt < AUTH_SESSION_TIMEOUT_MS) {
    lastDiagnostics = await getStoredAuthSessionDiagnostics(page);
    const sessionEmailMatches = !lastDiagnostics.email || lastDiagnostics.email.toLowerCase() === email.toLowerCase();

    if (lastDiagnostics.hasAccessToken && lastDiagnostics.userId && sessionEmailMatches) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(
    `Po ověření magic linku nevznikla platná E2E auth session do ${AUTH_SESSION_TIMEOUT_MS} ms. `
      + `${await buildCurrentPageDiagnostics(page)}. `
      + `Poslední stav session: ${lastDiagnostics ? formatStoredAuthSessionDiagnostics(lastDiagnostics) : '(neznámý)'}`,
  );
}

function redactSensitive(value: string): string {
  return value
    .replace(/([?&](?:token|access_token|refresh_token|code)=)[^&\s"'<>]+/gi, '$1<redacted>')
    .replace(/(token_hash=)[^&\s"'<>]+/gi, '$1<redacted>')
    .replace(/(otp=)[^&\s"'<>]+/gi, '$1<redacted>')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1<redacted>')
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9._-]{24,}/g, '<redacted-jwt>');
}

function shortExcerpt(value: string, maxLength = 240): string {
  if (!value.trim()) {
    return '(prázdné)';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  const excerpt = normalized.slice(0, maxLength);
  return redactSensitive(excerpt);
}

type MailpitMessageDetail = {
  Subject?: string;
  Text?: string;
  HTML?: string;
  [key: string]: unknown;
};

type MagicLinkCandidate = {
  value: string;
  source: string;
};

type MagicLinkValidation = {
  ok: boolean;
  reason?: string;
};

function stripTrailingUrlNoise(value: string): string {
  let normalized = value.trim();

  while (/[.,;!?\])}>]$/.test(normalized)) {
    normalized = normalized.slice(0, -1).trimEnd();
  }

  return normalized;
}

function normalizeCandidateUrl(value: string): string {
  return stripTrailingUrlNoise(decodeCommonHtmlEntities(value).replace(/\s+/g, ''));
}

function isLocalE2eSupabaseOrigin(url: URL): boolean {
  return url.protocol === 'http:'
    && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    && url.port === '54321';
}

function isCodespacesSupabaseTunnelUrl(url: URL): boolean {
  return url.protocol === 'https:'
    && url.hostname.endsWith('.app.github.dev')
    && /(?:^|-)54321(?:\.|-|$)/.test(url.hostname);
}

function decodeCodespacesTunnelRedirect(url: URL): string | undefined {
  if (url.pathname !== '/auth/postback/tunnel') {
    return undefined;
  }

  const redirectTarget = url.searchParams.get('rd');
  if (!redirectTarget) {
    return undefined;
  }

  try {
    return new URL(redirectTarget).toString();
  } catch {
    return undefined;
  }
}

export function normalizeMagicLinkForLocalE2e(value: string, supabaseUrl = SUPABASE_URL): string {
  if (!supabaseUrl) {
    return value;
  }

  let localSupabaseUrl: URL;
  try {
    localSupabaseUrl = new URL(supabaseUrl);
  } catch {
    return value;
  }

  if (!isLocalE2eSupabaseOrigin(localSupabaseUrl)) {
    return value;
  }

  let magicLinkUrl: URL;
  try {
    magicLinkUrl = new URL(value);
  } catch {
    return value;
  }

  if (!isCodespacesSupabaseTunnelUrl(magicLinkUrl)) {
    return value;
  }

  const decodedRedirect = decodeCodespacesTunnelRedirect(magicLinkUrl);
  if (decodedRedirect) {
    try {
      const decodedRedirectUrl = new URL(decodedRedirect);
      if (decodedRedirectUrl.pathname === '/auth/v1/verify') {
        decodedRedirectUrl.protocol = localSupabaseUrl.protocol;
        decodedRedirectUrl.host = localSupabaseUrl.host;
        return decodedRedirectUrl.toString();
      }
    } catch {
      // Neplatné rd ignorujeme a níže bezpečně přepíšeme pouze origin původního odkazu.
    }
  }

  magicLinkUrl.protocol = localSupabaseUrl.protocol;
  magicLinkUrl.host = localSupabaseUrl.host;
  return magicLinkUrl.toString();
}

function validateSupabaseVerifyMagicLink(value: string): MagicLinkValidation {
  try {
    const url = new URL(value);
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type');

    if (url.pathname !== '/auth/v1/verify') {
      return { ok: false, reason: `cesta je ${url.pathname || '(prázdná)'}` };
    }

    if (!token) {
      return { ok: false, reason: 'chybí token' };
    }

    if (/redacted/i.test(token)) {
      return { ok: false, reason: 'token je redigovaný' };
    }

    if (type && type !== 'magiclink') {
      return { ok: false, reason: `type je ${type}` };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'URL nejde parsovat' };
  }
}

function collectMagicLinkCandidates(source: string, sourceLabel: string): MagicLinkCandidate[] {
  const candidates: MagicLinkCandidate[] = [];
  const attributeRegex = /\b(?:href|action)\s*=\s*(["'])([\s\S]*?)\1/gi;
  const bareUrlRegex = /https?:\/\/[^\s"'<>()[\]{}]+/gi;
  const canContainMagicLink = (value: string) => value.includes('/auth/v1/verify')
    || value.includes('/auth/postback/tunnel')
    || value.includes(encodeURIComponent('/auth/v1/verify'));

  for (const match of source.matchAll(attributeRegex)) {
    const value = match[2];
    if (canContainMagicLink(value)) {
      candidates.push({ value, source: `${sourceLabel}:atribut` });
    }
  }

  for (const match of source.matchAll(bareUrlRegex)) {
    const value = match[0];
    if (canContainMagicLink(value)) {
      candidates.push({ value, source: `${sourceLabel}:url` });
    }
  }

  return candidates;
}

function buildMagicLinkSources(messageBody: MailpitMessageDetail): Array<{ label: string; value: string }> {
  return [
    { label: 'HTML', value: normalizeMailpitTransferContent(messageBody.HTML) },
    { label: 'Text', value: normalizeMailpitContent(messageBody.Text) },
  ].filter((source) => source.value.trim());
}

function inspectMagicLinkCandidates(messageBody: MailpitMessageDetail): Array<MagicLinkCandidate & MagicLinkValidation> {
  const seenCandidates = new Set<string>();
  const inspected: Array<MagicLinkCandidate & MagicLinkValidation> = [];

  for (const source of buildMagicLinkSources(messageBody)) {
    for (const candidate of collectMagicLinkCandidates(source.value, source.label)) {
      const normalizedCandidate = normalizeMagicLinkForLocalE2e(normalizeCandidateUrl(candidate.value));
      if (seenCandidates.has(normalizedCandidate)) {
        continue;
      }

      seenCandidates.add(normalizedCandidate);
      inspected.push({
        value: normalizedCandidate,
        source: candidate.source,
        ...validateSupabaseVerifyMagicLink(normalizedCandidate),
      });
    }
  }

  return inspected;
}

function formatRejectedMagicLinkCandidates(candidates: Array<MagicLinkCandidate & MagicLinkValidation>): string {
  const rejected = candidates.filter((candidate) => !candidate.ok).slice(0, 5);

  if (rejected.length === 0) {
    return '(žádné)';
  }

  return rejected
    .map((candidate) => `${candidate.source}: ${candidate.reason ?? 'neznámý důvod'} (${shortExcerpt(candidate.value)})`)
    .join(' | ');
}

export function extractMagicLink(messageBody: MailpitMessageDetail): string | undefined {
  return inspectMagicLinkCandidates(messageBody).find((candidate) => candidate.ok)?.value;
}

export function buildMailpitDiagnostics(params: {
  matchingMessagesCount: number;
  latestMessage?: { ID?: string; To?: Array<{ Address?: string }> };
  detailBody?: MailpitMessageDetail;
  detailError?: string;
}): string {
  const { matchingMessagesCount, latestMessage, detailBody, detailError } = params;
  const detailFields = detailBody ? Object.keys(detailBody).sort().join(', ') || '(žádné)' : '(nedostupné)';
  const toAddresses = (latestMessage?.To ?? []).map((recipient) => recipient.Address ?? '(missing)').join(', ') || '(žádné)';
  const subject = detailBody ? redactSensitive(String(detailBody.Subject ?? '(bez předmětu)')) : '(nedostupné)';
  const textSnippet = detailBody ? shortExcerpt(normalizeMailpitContent(detailBody.Text)) : '(nedostupné)';
  const htmlSnippet = detailBody ? shortExcerpt(normalizeMailpitContent(detailBody.HTML)) : '(nedostupné)';
  const candidates = detailBody ? inspectMagicLinkCandidates(detailBody) : [];
  const rejectedCandidates = detailBody ? formatRejectedMagicLinkCandidates(candidates) : '(nedostupné)';
  const acceptedCandidateFound = candidates.some((candidate) => candidate.ok);

  return `messagesCount=${matchingMessagesCount}; latestMessageId=${latestMessage?.ID ?? '(žádné)'}; `
    + `toAddresses=${toAddresses}; detailFields=${detailFields}; detailError=${detailError ?? '(žádná)'}; `
    + `candidateCount=${candidates.length}; acceptedCandidateFound=${acceptedCandidateFound}; `
    + `rejectedCandidates=${rejectedCandidates}; `
    + `subject=${subject}; textSnippet=${textSnippet}; htmlSnippet=${htmlSnippet}`;
}

async function getVisiblePageText(page: Page): Promise<string> {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  return bodyText.replace(/\s+/g, ' ').trim();
}

async function waitForOtpOutcomeOrMailpit(
  page: Page,
  email: string,
  options: { otpRequestAlreadyConfirmed?: boolean } = {},
): Promise<string> {
  const messagesUrl = `${MAILPIT_BASE_URL}/api/v1/messages`;

  const otpErrorRegex = new RegExp([
    'Přihlášení se nepodařilo\\.',
    'Přihlášení e-mailem není v Supabase Auth povolené\\.',
    'Lokální Supabase Auth vrátilo otp_disabled\\.',
    'Supabase Auth OTP selhalo \\(\\d+\\)\\.',
    'Chybí NEXT_PUBLIC_SUPABASE_URL nebo NEXT_PUBLIC_SUPABASE_ANON_KEY\\.',
    'Neplatné JSON tělo požadavku\\.',
    'Pole email musí být validní řetězec\\.',
    'Síťová chyba při volání Supabase Auth OTP\\.',
  ].join('|'), 'i');
  const otpSuccessRegex = /Na e-mail byl odeslán odkaz pro přihlášení\.|Jste přihlášen\(a\)\./i;

  const startedAt = Date.now();
  let otpRequestConfirmed = options.otpRequestAlreadyConfirmed ?? false;

  while (Date.now() - startedAt < MAGIC_LINK_TIMEOUT_MS) {
    const visibleText = await getVisiblePageText(page);

    if (otpErrorRegex.test(visibleText)) {
      throw new Error(
        `OTP požadavek selhal podle UI hlášky. URL: ${page.url()}. Viditelný text: ${visibleText}`,
      );
    }

    // Čekáme na potvrzení aktuálního OTP požadavku, aby se nepoužil starý e-mail z Mailpitu.
    if (!otpRequestConfirmed) {
      otpRequestConfirmed = otpSuccessRegex.test(visibleText);
      await page.waitForTimeout(500);
      continue;
    }

    const response = await page.request.get(messagesUrl);
    if (!response.ok()) {
      throw new Error(`Mailpit messages selhal se statusem ${response.status()}. URL: ${messagesUrl}`);
    }

    const body = (await response.json()) as {
      messages?: Array<{
        ID?: string;
        Created?: string;
        CreatedAt?: string;
        To?: Array<{ Address?: string }>;
      }>;
    };

    const allMessages = body.messages ?? [];
    const normalizedEmail = email.toLowerCase();
    const matchingMessages = allMessages.filter((message) =>
      (message.To ?? []).some((recipient) => recipient.Address?.toLowerCase() === normalizedEmail),
    );

    const freshMessages = matchingMessages.filter((message) => {
      const createdRaw = message.CreatedAt ?? message.Created;
      const createdMs = createdRaw ? Date.parse(createdRaw) : Number.NaN;

      // Zachováme ochranu proti starým zprávám, ale Mailpit vrací čas bez milisekund.
      return Number.isFinite(createdMs) && createdMs >= startedAt - MAILPIT_FRESH_MESSAGE_TOLERANCE_MS;
    });

    const latestMessage = freshMessages[0];
    if (latestMessage?.ID) {
      const messageResponse = await page.request.get(`${MAILPIT_BASE_URL}/api/v1/message/${latestMessage.ID}`);
      if (!messageResponse.ok()) {
        throw new Error(`Načtení zprávy z Mailpit selhalo se statusem ${messageResponse.status()}.`);
      }

      const messageBody = (await messageResponse.json()) as MailpitMessageDetail;
      const magicLink = extractMagicLink(messageBody);

      if (magicLink) {
        return magicLink;
      }

      throw new Error(
        `Magic link pro ${email} nebyl nalezen v detailu Mailpit zprávy. `
        + buildMailpitDiagnostics({
          matchingMessagesCount: matchingMessages.length,
          latestMessage,
          detailBody: messageBody,
        }),
      );
    }

    // UI hláška může být pomalejší/odlišná; logiku úspěchu bereme primárně z Mailpitu.
    void otpSuccessRegex.test(visibleText);
    await page.waitForTimeout(500);
  }

  const visibleText = await getVisiblePageText(page);
  const diagnosticsResponse = await page.request.get(messagesUrl);
  let diagnostics = 'Mailpit diagnostika nedostupná';
  if (diagnosticsResponse.ok()) {
    const diagnosticsBody = (await diagnosticsResponse.json()) as {
      messages?: Array<{ ID?: string; To?: Array<{ Address?: string }> }>;
    };
    const diagnosticsMessages = diagnosticsBody.messages ?? [];
    const matchingMessages = diagnosticsMessages.filter((message) =>
      (message.To ?? []).some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()),
    );
    const latestMessage = matchingMessages[0];
    let detailBody: MailpitMessageDetail | undefined;
    let detailError: string | undefined;
    if (latestMessage?.ID) {
      const detailResponse = await page.request.get(`${MAILPIT_BASE_URL}/api/v1/message/${latestMessage.ID}`);
      if (detailResponse.ok()) {
        detailBody = (await detailResponse.json()) as MailpitMessageDetail;
      } else {
        detailError = `status=${detailResponse.status()}`;
      }
    }
    diagnostics = buildMailpitDiagnostics({
      matchingMessagesCount: matchingMessages.length,
      latestMessage,
      detailBody,
      detailError,
    });
  }
  throw new Error(
    `Magic link pro ${email} nebyl v Mailpit nalezen do ${MAGIC_LINK_TIMEOUT_MS} ms. URL: ${page.url()}. `
      + `Viditelný text: ${visibleText}. ${diagnostics}`,
  );
}

export async function loginViaMagicLink(params: {
  page: Page;
  email: string;
  createUser?: boolean;
}): Promise<void> {
  const { page, email, createUser = false } = params;

  if (createUser) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Pro E2E signup chybí NEXT_PUBLIC_SUPABASE_URL nebo NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    }

    const emailRedirectTo = buildE2eEmailRedirectTo();
    const otpEndpoint = buildSupabaseOtpEndpoint(`${SUPABASE_URL}/auth/v1/otp`, emailRedirectTo);
    const response = await page.request.post(otpEndpoint, {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      data: {
        email,
        create_user: true,
        redirect_to: emailRedirectTo,
      },
    });

    if (!response.ok()) {
      throw new Error(`E2E signup OTP selhal (${response.status()}): ${await response.text()}`);
    }
  } else {
    await page.goto('/prihlaseni');
    await expect(page.getByRole('heading', { name: 'Přihlášení' })).toBeVisible();

    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Poslat odkaz pro přihlášení' }).click();
  }

  const magicLink = await waitForOtpOutcomeOrMailpit(page, email, {
    otpRequestAlreadyConfirmed: createUser,
  });

  const normalizedMagicLink = normalizeMagicLinkForLocalE2e(magicLink);
  const verifyLink = new RegExp(`auth\/v1\/verify.*${escapeForRegex(email)}`, 'i');
  if (!verifyLink.test(normalizedMagicLink) && !normalizedMagicLink.includes('auth/v1/verify')) {
    throw new Error('Nalezený odkaz z Mailpit nevypadá jako Supabase verify link.');
  }

  await page.goto(normalizedMagicLink);
  await page.waitForURL(/\/rezervace|\/$/, { timeout: 15_000 });
  const verifiedRedirectUrl = page.url();
  await waitForStoredAuthSession(page, email);

  await page.goto('/prihlaseni');
  await waitForStoredAuthSession(page, email);
  const loginStateMessage = page.getByText('Jste přihlášen(a).', { exact: true }).first();
  try {
    await expect(loginStateMessage).toBeVisible({ timeout: 10_000 });
  } catch (error) {
    console.warn(
      `Přihlášení přes magic link vytvořilo session, ale /prihlaseni nezobrazilo očekávaný UI text. `
        + `Auth bootstrap pokračuje podle uložené session. URL po ověření: ${redactSensitive(verifiedRedirectUrl)}. `
        + `${await buildCurrentPageDiagnostics(page)}. `
        + `Původní chyba: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function buildE2eProfileUpsertData(params: {
  id: string;
  email: string;
  role: 'user' | 'admin';
}) {
  const { id, email, role } = params;
  const fullName = email.split('@')[0]?.trim() || 'E2E uživatel';

  return {
    id,
    email,
    full_name: fullName,
    role,
  };
}

export async function upsertE2eProfileRole(params: {
  page: Page;
  email: string;
  role: 'user' | 'admin';
}): Promise<void> {
  const { page, email, role } = params;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Pro E2E upsert profilu chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.');
  }

  const userResponse = await page.request.get(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );

  if (!userResponse.ok()) {
    throw new Error(`Načtení auth user podle e-mailu selhalo (${userResponse.status()}): ${await userResponse.text()}`);
  }

  const userBody = (await userResponse.json()) as { users?: Array<{ id: string; email?: string }> };
  const user = userBody.users?.find((item) => item.email?.toLowerCase() === email.toLowerCase());
  if (!user?.id) {
    throw new Error(`Pro e-mail ${email} nebyl v auth.users nalezen žádný uživatel.`);
  }

  const upsertResponse = await page.request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    params: {
      on_conflict: 'id',
    },
    data: [buildE2eProfileUpsertData({ id: user.id, email, role })],
  });

  if (!upsertResponse.ok()) {
    throw new Error(`Upsert e2e profile role selhal (${upsertResponse.status()}): ${await upsertResponse.text()}`);
  }
}
