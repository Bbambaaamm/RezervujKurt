import { expect, type Page } from '@playwright/test';

const MAILPIT_BASE_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';
const MAGIC_LINK_TIMEOUT_MS = Number(process.env.E2E_MAGIC_LINK_TIMEOUT_MS ?? '20000');

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getVisiblePageText(page: Page): Promise<string> {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  return bodyText.replace(/\s+/g, ' ').trim();
}

async function waitForOtpOutcomeOrMailpit(page: Page, email: string): Promise<string> {
  const encodedQuery = encodeURIComponent(`to:${email}`);
  const searchUrl = `${MAILPIT_BASE_URL}/api/v1/search?kind=to&query=${encodedQuery}`;

  const otpErrorRegex = /Přihlášení se nepodařilo\.|Neplatné JSON tělo požadavku\.|Pole email musí být validní řetězec\.|Síťová chyba při volání Supabase Auth OTP\./i;
  const otpMessageRegex = /Na e-mail byl odeslán odkaz pro přihlášení\.|Jste přihlášen\(a\)\./i;

  const startedAt = Date.now();

  while (Date.now() - startedAt < MAGIC_LINK_TIMEOUT_MS) {
    const visibleText = await getVisiblePageText(page);

    if (otpErrorRegex.test(visibleText)) {
      throw new Error(
        `OTP požadavek selhal podle UI hlášky. URL: ${page.url()}. Viditelný text: ${visibleText}`,
      );
    }

    const response = await page.request.get(searchUrl);
    if (!response.ok()) {
      throw new Error(`Mailpit search selhal se statusem ${response.status()}. URL: ${searchUrl}`);
    }

    const body = (await response.json()) as {
      messages?: Array<{
        ID: string;
      }>;
    };

    const latestMessage = body.messages?.[0];
    if (latestMessage?.ID) {
      const messageResponse = await page.request.get(`${MAILPIT_BASE_URL}/api/v1/message/${latestMessage.ID}`);
      if (!messageResponse.ok()) {
        throw new Error(`Načtení zprávy z Mailpit selhalo se statusem ${messageResponse.status()}.`);
      }

      const messageBody = (await messageResponse.json()) as {
        Text?: string;
        HTML?: string;
      };

      const candidateText = `${messageBody.HTML ?? ''}\n${messageBody.Text ?? ''}`;
      const linkRegex = /(https?:\/\/[^\s"'<>]+auth\/v1\/verify[^\s"'<>]+)/i;
      const matched = candidateText.match(linkRegex);

      if (matched?.[1]) {
        return matched[1].replace(/&amp;/g, '&');
      }
    }

    // UI hláška může být pomalejší/odlišná; logiku úspěchu bereme primárně z Mailpitu.
    void otpMessageRegex.test(visibleText);
    await page.waitForTimeout(500);
  }

  const visibleText = await getVisiblePageText(page);
  throw new Error(
    `Magic link pro ${email} nebyl v Mailpit nalezen do ${MAGIC_LINK_TIMEOUT_MS} ms. URL: ${page.url()}. Viditelný text: ${visibleText}`,
  );
}

export async function loginViaMagicLink(params: {
  page: Page;
  email: string;
}): Promise<void> {
  const { page, email } = params;

  await page.goto('/prihlaseni');
  await expect(page.getByRole('heading', { name: 'Přihlášení' })).toBeVisible();

  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Poslat odkaz pro přihlášení' }).click();

  const magicLink = await waitForOtpOutcomeOrMailpit(page, email);

  const verifyLink = new RegExp(`auth\\/v1\\/verify.*${escapeForRegex(email)}`, 'i');
  if (!verifyLink.test(magicLink) && !magicLink.includes('auth/v1/verify')) {
    throw new Error('Nalezený odkaz z Mailpit nevypadá jako Supabase verify link.');
  }

  await page.goto(magicLink);
  await page.waitForURL(/\/rezervace|\/$/, { timeout: 15_000 });

  await page.goto('/prihlaseni');
  await expect(page.getByText('Jste přihlášen(a).')).toBeVisible();
}
