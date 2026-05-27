import { expect, type Page } from '@playwright/test';

const MAILPIT_BASE_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';
const MAGIC_LINK_TIMEOUT_MS = Number(process.env.E2E_MAGIC_LINK_TIMEOUT_MS ?? '20000');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const otpSuccessRegex = /Na e-mail byl odeslán odkaz pro přihlášení\.|Jste přihlášen\(a\)\./i;

  const startedAt = Date.now();
  let otpRequestConfirmed = false;

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
    void otpSuccessRegex.test(visibleText);
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
  createUser?: boolean;
}): Promise<void> {
  const { page, email, createUser = false } = params;

  if (createUser) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Pro E2E signup chybí NEXT_PUBLIC_SUPABASE_URL nebo NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    }

    const response = await page.request.post(`${SUPABASE_URL}/auth/v1/otp`, {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      data: {
        email,
        create_user: true,
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

  const magicLink = await waitForOtpOutcomeOrMailpit(page, email);

  const verifyLink = new RegExp(`auth\/v1\/verify.*${escapeForRegex(email)}`, 'i');
  if (!verifyLink.test(magicLink) && !magicLink.includes('auth/v1/verify')) {
    throw new Error('Nalezený odkaz z Mailpit nevypadá jako Supabase verify link.');
  }

  await page.goto(magicLink);
  await page.waitForURL(/\/rezervace|\/$/, { timeout: 15_000 });

  await page.goto('/prihlaseni');
  await expect(page.getByText('Jste přihlášen(a).')).toBeVisible();
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
    data: [
      {
        id: user.id,
        email,
        role,
      },
    ],
  });

  if (!upsertResponse.ok()) {
    throw new Error(`Upsert e2e profile role selhal (${upsertResponse.status()}): ${await upsertResponse.text()}`);
  }
}
