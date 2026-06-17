import { expect, test, type Page } from '@playwright/test';

const AUTH_SESSION_STORAGE_KEY = 'rezervujkurt.auth.session';
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://responsive-test.supabase.co').replace(/\/$/, '');

const courtNames = ['Kurt 3', 'Kurt 4', 'Kurt 5'] as const;

const courts = [
  { id: 1, name: 'Kurt 3' },
  { id: 2, name: 'Kurt 4' },
  { id: 3, name: 'Kurt 5' },
];

const reservations = [
  {
    id: 'reservation-1',
    reservation_date: '2026-06-18',
    time_from: '16:30:00',
    time_to: '18:30:00',
    created_at: '2026-06-15T08:58:00.000Z',
    status: 'pending',
    court_id: 1,
    user_id: 'responsive-user',
  },
  {
    id: 'reservation-2',
    reservation_date: '2026-06-19',
    time_from: '14:30:00',
    time_to: '15:30:00',
    created_at: '2026-06-12T09:58:00.000Z',
    status: 'approved',
    court_id: 2,
    user_id: 'responsive-user',
  },
];

function createAccessToken() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: 'responsive-user',
    email: 'velmi.dlouhy.testovaci.email.pro.responzivni.kontrolu@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.signature`;
}

async function openMyReservations(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(
    ({ storageKey, accessToken }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({
        access_token: accessToken,
        user: {
          id: 'responsive-user',
          email: 'velmi.dlouhy.testovaci.email.pro.responzivni.kontrolu@example.com',
        },
      }));
    },
    { storageKey: AUTH_SESSION_STORAGE_KEY, accessToken: createAccessToken() },
  );
  await page.route(`${SUPABASE_URL}/rest/v1/**`, async (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1);
    const body = resource === 'courts' ? courts : reservations;

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/moje-rezervace');
  await expect(page.getByRole('heading', { name: 'Moje rezervace' })).toBeVisible();
  await expect(page.getByText(new RegExp(`^(${courtNames.join('|')})$`)).first()).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    overflowingElements: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const bounds = element.getBoundingClientRect();
        return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5;
      })
      .map((element) => ({
        tag: element.tagName,
        text: element.textContent?.trim().slice(0, 80),
        bounds: element.getBoundingClientRect().toJSON(),
      })),
  }));

  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.overflowingElements).toEqual([]);
}

for (const viewport of [
  { name: 'mobil 320 px', width: 320, cardsVisible: true },
  { name: 'tablet 768 px', width: 768, cardsVisible: true },
  { name: 'tablet 1023 px', width: 1023, cardsVisible: true },
  { name: 'desktop 1024 px', width: 1024, cardsVisible: false },
]) {
  test(`${viewport.name}: přehled nepřesahuje viewport`, async ({ page }) => {
    await openMyReservations(page, viewport.width);

    const mobileCards = page.locator('article');
    const desktopTable = page.getByRole('table');

    if (viewport.cardsVisible) {
      await expect(mobileCards.first()).toBeVisible();
      await expect(desktopTable).toBeHidden();
      await expect(page.getByRole('button', { name: 'Zrušit rezervaci' })).toHaveCSS('min-height', '44px');
    } else {
      await expect(mobileCards.first()).toBeHidden();
      await expect(desktopTable).toBeVisible();
    }

    await expectNoHorizontalOverflow(page);
  });
}
