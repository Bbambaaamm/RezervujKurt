import { existsSync } from 'node:fs';
import { expect, test, type APIRequestContext, type BrowserContext, type Locator, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MEMBER_STATE_PATH = 'e2e/.auth/member.json';
const ADMIN_STATE_PATH = 'e2e/.auth/admin.json';
function isLocalSupabaseUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '54321';
  } catch {
    return false;
  }
}

const usesLocalSupabase = isLocalSupabaseUrl(SUPABASE_URL);
const hasLifecycleEnvironment = Boolean(usesLocalSupabase && SUPABASE_SERVICE_ROLE_KEY && existsSync(MEMBER_STATE_PATH) && existsSync(ADMIN_STATE_PATH));

test.skip(!hasLifecycleEnvironment, 'Chybí lokální Supabase env nebo e2e/.auth storageState soubory pro lifecycle smoke. Použijte .env.test.local, npm run test:e2e:auth:bootstrap a lokální Supabase URL na portu 54321.');

const COURT_ID = 1;
const TIME_FROM = '10:00:00';
const TIME_TO = '10:30:00';
const RESERVATION_STATUS_LABELS = {
  pending: 'Čeká na schválení',
  approved: 'Schváleno',
  cancelled: 'Zrušeno',
} as const;
const E2E_RESERVATION_NOTE = 'E2E-LIFECYCLE';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

async function getCourtName(page: Page, courtId: number): Promise<string> {
  if (!usesLocalSupabase || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Lifecycle E2E načtení názvu kurtu smí běžet pouze proti lokální Supabase na portu 54321 a vyžaduje SUPABASE_SERVICE_ROLE_KEY.');
  }

  const response = await page.request.get(`${SUPABASE_URL}/rest/v1/courts`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    params: {
      select: 'name',
      id: `eq.${courtId}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Načtení názvu kurtu pro lifecycle E2E selhalo (${response.status()}): ${await response.text()}`);
  }

  const courts = await response.json() as Array<{ name?: unknown }>;
  const courtName = courts[0]?.name;

  if (typeof courtName !== 'string' || courtName.length === 0) {
    throw new Error(`Pro lifecycle E2E nebyl nalezen platný název kurtu s id ${courtId}.`);
  }

  return courtName;
}


type ReservationStatus = keyof typeof RESERVATION_STATUS_LABELS;

type ReservationStatusRow = {
  id?: unknown;
  status?: unknown;
};

async function getReservationStatusRows(request: APIRequestContext, reservationDate: string): Promise<ReservationStatusRow[]> {
  if (!usesLocalSupabase || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Lifecycle E2E ověření stavu smí běžet pouze proti lokální Supabase na portu 54321 a vyžaduje SUPABASE_SERVICE_ROLE_KEY.');
  }

  const response = await request.get(`${SUPABASE_URL}/rest/v1/reservations`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    params: {
      select: 'id,status',
      court_id: `eq.${COURT_ID}`,
      reservation_date: `eq.${reservationDate}`,
      time_from: `eq.${TIME_FROM}`,
      time_to: `eq.${TIME_TO}`,
      note: `eq.${E2E_RESERVATION_NOTE}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Načtení stavu E2E rezervace selhalo (${response.status()}): ${await response.text()}`);
  }

  return response.json() as Promise<ReservationStatusRow[]>;
}

async function waitForReservationStatus(request: APIRequestContext, reservationDate: string, expectedStatus: ReservationStatus) {
  await expect.poll(async () => {
    const rows = await getReservationStatusRows(request, reservationDate);

    if (rows.length !== 1) {
      return `count:${rows.length}`;
    }

    return typeof rows[0].status === 'string' ? rows[0].status : 'status:invalid';
  }, {
    message: `Rezervace ${reservationDate} ${TIME_FROM}-${TIME_TO} musí mít v lokální DB stav ${expectedStatus}.`,
    timeout: 10_000,
  }).toBe(expectedStatus);
}

async function cleanupReservationSlot(page: Page, reservationDate: string) {
  if (!usesLocalSupabase || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Lifecycle E2E cleanup smí běžet pouze proti lokální Supabase na portu 54321 a vyžaduje SUPABASE_SERVICE_ROLE_KEY.');
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

function getReservationRow(page: Page, input: { date: string; courtName: string; includeNote?: boolean; sectionName?: string }): Locator {
  const container = input.sectionName
    ? page.locator('section:visible').filter({ has: page.getByRole('heading', { name: input.sectionName }) })
    : page;

  let reservationItem = container
    .locator('tr:visible, article:visible')
    .filter({ hasText: input.date })
    .filter({ hasText: TIME_FROM })
    .filter({ hasText: TIME_TO })
    .filter({ hasText: input.courtName });

  if (input.includeNote ?? true) {
    reservationItem = reservationItem.filter({ hasText: E2E_RESERVATION_NOTE });
  }

  return reservationItem;
}

async function waitForReservationRow(page: Page, input: { date: string; courtName: string; statusLabel: string; includeNote?: boolean; sectionName?: string }) {
  const row = getReservationRow(page, input).filter({ hasText: input.statusLabel });
  await expect(row).toHaveCount(1);
  return row;
}

test('reservation lifecycle smoke: pending -> approved -> cancelled uvolní slot', async ({ browser, page }) => {
  const reservationDate = getTargetDate(2);
  const formattedReservationDate = formatCzechDate(reservationDate);
  const courtName = await getCourtName(page, COURT_ID);
  const courtNamePattern = escapeRegExp(courtName);
  let memberContext: BrowserContext | null = null;
  let adminContext: BrowserContext | null = null;
  let publicContext: BrowserContext | null = null;

  await cleanupReservationSlot(page, reservationDate);

  try {
    memberContext = await browser.newContext({ storageState: MEMBER_STATE_PATH });
    const memberPage = await memberContext.newPage();

    await memberPage.goto('/rezervace');
    await memberPage.locator('#reservation-day').fill(reservationDate);

    const slotButton = memberPage.getByRole('button', {
      name: new RegExp(`${courtNamePattern}, 10:00 až 10:30, stav volno`, 'i'),
    });

    await expect(slotButton).toBeVisible();
    await slotButton.click();
    await memberPage.getByRole('textbox', { name: 'Poznámka' }).fill(E2E_RESERVATION_NOTE);

    await memberPage.getByRole('button', { name: /Rezervovat/i }).click();
    await expect(memberPage.getByText('Rezervace vytvořena.')).toBeVisible();
    await waitForReservationStatus(page.request, reservationDate, 'pending');
    await expect(
      memberPage.getByRole('button', {
        name: new RegExp(`${courtNamePattern}, 10:00 až 10:30, stav čeká na schválení`, 'i'),
      }),
    ).toBeVisible();

    adminContext = await browser.newContext({ storageState: ADMIN_STATE_PATH });
    const adminPage = await adminContext.newPage();

    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { name: 'Administrace rezervací' })).toBeVisible();

    const pendingRow = getReservationRow(adminPage, { date: formattedReservationDate, courtName })
      .filter({ has: adminPage.getByRole('button', { name: 'Schválit' }) })
      .filter({ hasText: RESERVATION_STATUS_LABELS.pending });

    await expect(pendingRow).toHaveCount(1);
    await pendingRow.getByRole('button', { name: 'Schválit' }).click();
    await waitForReservationStatus(page.request, reservationDate, 'approved');
    await expect(pendingRow).toHaveCount(0);
    await adminPage.reload();
    await waitForReservationRow(adminPage, { date: formattedReservationDate, courtName, statusLabel: RESERVATION_STATUS_LABELS.approved });

    publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto('/rezervace');
    await publicPage.locator('#reservation-day').fill(reservationDate);
    await publicPage.reload();
    await publicPage.locator('#reservation-day').fill(reservationDate);

    const publicSlotButton = publicPage.getByRole('button', {
      name: new RegExp(`${courtNamePattern}, 10:00 až 10:30, stav obsazeno`, 'i'),
    });
    await expect(publicSlotButton).toBeVisible();

    await memberPage.goto('/moje-rezervace');
    await memberPage.reload();
    await expect(memberPage.getByRole('heading', { name: 'Moje rezervace' })).toBeVisible();

    const approvedRow = await waitForReservationRow(memberPage, {
      date: formattedReservationDate,
      courtName,
      statusLabel: RESERVATION_STATUS_LABELS.approved,
      includeNote: false,
      sectionName: 'Nadcházející rezervace',
    });
    await expect(approvedRow.getByText(RESERVATION_STATUS_LABELS.approved, { exact: true })).toBeVisible();
    await approvedRow.getByRole('button', { name: 'Zrušit' }).click();
    await waitForReservationStatus(page.request, reservationDate, 'cancelled');
    await expect(memberPage.getByText('Rezervace byla zrušena.')).toBeVisible();

    const cancelledRow = await waitForReservationRow(memberPage, {
      date: formattedReservationDate,
      courtName,
      statusLabel: RESERVATION_STATUS_LABELS.cancelled,
      includeNote: false,
      sectionName: 'Historie rezervací',
    });
    await expect(cancelledRow.getByText(RESERVATION_STATUS_LABELS.cancelled, { exact: true })).toBeVisible();

    await publicPage.reload();
    await publicPage.locator('#reservation-day').fill(reservationDate);
    await expect(
      publicPage.getByRole('button', {
        name: new RegExp(`${courtNamePattern}, 10:00 až 10:30, stav volno`, 'i'),
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
