import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COURT_ID = 1;
const TIME_FROM = '10:00:00';
const TIME_TO = '11:00:00';
const E2E_RESERVATION_NOTE = 'E2E-LIFECYCLE';

function getTargetDate(daysAhead: number): string {
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead);
  return new Date(utc).toISOString().slice(0, 10);
}

function formatCzechDate(date: string): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

async function cleanupReservationSlot(page: Page, reservationDate: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Pro cleanup E2E slotu chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.');
  }

  const response = await page.request.delete(`${SUPABASE_URL}/rest/v1/reservations`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    params: {
      court_id: `eq.${COURT_ID}`,
      reservation_date: `eq.${reservationDate}`,
      time_from: `eq.${TIME_FROM}`,
      time_to: `eq.${TIME_TO}`,
      note: `eq.${E2E_RESERVATION_NOTE}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Cleanup E2E rezervace selhal (${response.status()}): ${await response.text()}`);
  }
}

async function closeContext(context: BrowserContext | null) {
  if (context) {
    await context.close();
  }
}

test('reservation lifecycle smoke: pending -> approved -> cancelled uvolní slot', async ({ browser, page }) => {
  const reservationDate = getTargetDate(2);
  const formattedReservationDate = formatCzechDate(reservationDate);
  let memberContext: BrowserContext | null = null;
  let adminContext: BrowserContext | null = null;
  let publicContext: BrowserContext | null = null;

  await cleanupReservationSlot(page, reservationDate);

  try {
    memberContext = await browser.newContext({ storageState: 'e2e/.auth/member.json' });
    const memberPage = await memberContext.newPage();

    await memberPage.goto('/rezervace');
    await memberPage.locator('#reservation-day').fill(reservationDate);

    const slotButton = memberPage.getByRole('button', {
      name: /Kurt 1, 10:00 až 10:30, stav volno/i,
    });

    await expect(slotButton).toBeVisible();
    await slotButton.click();
    await memberPage.getByLabel('Poznámka').fill(E2E_RESERVATION_NOTE);

    await memberPage.getByRole('button', { name: /Rezervovat/i }).click();
    await expect(memberPage.getByText('Rezervace vytvořena.')).toBeVisible();
    await expect(
      memberPage.getByRole('button', {
        name: /Kurt 1, 10:00 až 10:30, stav obsazeno/i,
      }),
    ).toBeVisible();

    adminContext = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const adminPage = await adminContext.newPage();

    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { name: 'Administrace rezervací' })).toBeVisible();

    const pendingRow = adminPage
      .locator('tr')
      .filter({ hasText: formattedReservationDate })
      .filter({ hasText: '10:00:00' })
      .filter({ hasText: '11:00:00' });

    await expect(pendingRow).toHaveCount(1);
    await pendingRow.getByRole('button', { name: 'Schválit' }).click();
    await expect(pendingRow).toHaveCount(0);

    publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto('/rezervace');
    await publicPage.locator('#reservation-day').fill(reservationDate);

    const publicSlotButton = publicPage.getByRole('button', {
      name: /Kurt 1, 10:00 až 10:30, stav obsazeno/i,
    });
    await expect(publicSlotButton).toBeVisible();

    await memberPage.goto('/moje-rezervace');
    await expect(memberPage.getByRole('heading', { name: 'Moje rezervace' })).toBeVisible();

    const approvedRow = memberPage
      .locator('tr')
      .filter({ hasText: formattedReservationDate })
      .filter({ hasText: '10:00:00' })
      .filter({ hasText: '11:00:00' })
      .filter({ hasText: 'Kurt 1' });

    await expect(approvedRow).toHaveCount(1);
    await expect(approvedRow.getByText('Schváleno', { exact: true })).toBeVisible();
    await approvedRow.getByRole('button', { name: 'Zrušit' }).click();
    await expect(memberPage.getByText('Rezervace byla zrušena.')).toBeVisible();
    await expect(approvedRow.getByText('Zrušeno', { exact: true })).toBeVisible();

    await publicPage.reload();
    await expect(
      publicPage.getByRole('button', {
        name: /Kurt 1, 10:00 až 10:30, stav volno/i,
      }),
    ).toBeVisible();
  } finally {
    try {
      await cleanupReservationSlot(page, reservationDate);
    } finally {
      await Promise.all([
        closeContext(memberContext),
        closeContext(adminContext),
        closeContext(publicContext),
      ]);
    }
  }
});
