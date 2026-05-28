import { expect, test } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COURT_ID = 1;
const TIME_FROM = '10:00:00';
const TIME_TO = '11:00:00';

function getTargetDate(daysAhead: number): string {
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead);
  return new Date(utc).toISOString().slice(0, 10);
}

async function cleanupReservationSlot(page: Parameters<typeof test>[0]['page'], reservationDate: string) {
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
      note: 'eq.E2E-LIFECYCLE',
    },
  });

  if (!response.ok()) {
    throw new Error(`Cleanup E2E rezervace selhal (${response.status()}): ${await response.text()}`);
  }
}

test('reservation lifecycle smoke: member pending -> admin approve -> grid obsazeno', async ({ browser, page }) => {
  const reservationDate = getTargetDate(2);

  await cleanupReservationSlot(page, reservationDate);

  const memberContext = await browser.newContext({ storageState: 'e2e/.auth/member.json' });
  const memberPage = await memberContext.newPage();

  await memberPage.goto('/rezervace');
  await memberPage.locator('#reservation-day').fill(reservationDate);

  const slotButton = memberPage.getByRole('button', {
    name: /Kurt 1, 10:00 až 10:30, stav volno/i,
  });

  await expect(slotButton).toBeVisible();
  await slotButton.click();

  await memberPage.getByRole('button', { name: /Rezervovat/i }).click();
  await expect(memberPage.getByText('Rezervace vytvořena.')).toBeVisible();

  await memberContext.close();

  const adminContext = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const adminPage = await adminContext.newPage();

  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('heading', { name: 'Administrace rezervací' })).toBeVisible();

  const pendingRow = adminPage
    .locator('tr')
    .filter({ hasText: reservationDate })
    .filter({ hasText: '10:00:00' })
    .filter({ hasText: '11:00:00' });

  await expect(pendingRow).toHaveCount(1);
  await pendingRow.getByRole('button', { name: 'Schválit' }).click();

  await expect(pendingRow).toHaveCount(0);

  await adminContext.close();

  const publicPage = await browser.newPage();
  await publicPage.goto('/rezervace');
  await publicPage.locator('#reservation-day').fill(reservationDate);

  await expect(
    publicPage.getByRole('button', {
      name: /Kurt 1, 10:00 až 10:30, stav obsazeno/i,
    }),
  ).toBeVisible();

  await cleanupReservationSlot(publicPage, reservationDate);
  await publicPage.close();
});
