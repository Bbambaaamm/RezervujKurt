import { expect, test } from '@playwright/test';

test('anonymous smoke: grid je viditelný a rezervace je blokovaná', async ({ page }) => {
  await page.goto('/rezervace');

  await expect(page.getByRole('heading', { name: 'Rezervace kurtů' })).toBeVisible();
  await expect(page.getByText('DEV upozornění: čtení ze Supabase selhalo a stránka používá mock fallback data.')).toHaveCount(0);

  const gridSection = page.locator('section').filter({ hasText: 'Tip: Pro rychlý výběr přetáhněte přes více volných slotů.' });
  await expect(gridSection).toBeVisible();

  const slotButton = page.getByRole('button', { name: /stav (volno|obsazeno|čeká na schválení)/ }).first();
  await expect(slotButton).toBeVisible();

  await expect(page.getByText('Pro dokončení rezervace se nejdřív přihlaste. Vybraný termín uvidíte dál v souhrnu.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Přihlásit se a rezervovat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rezervovat' })).toHaveCount(0);
});

test('anonymous mobile: navigace je kompaktní a stránka nepřetéká', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  await page.goto('/');
  await page.getByRole('button', { name: 'Otevřít menu' }).click();

  const mobileNavigation = page.getByRole('navigation', { name: 'Mobilní navigace' });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole('link', { name: 'Domů', exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole('link', { name: 'Rezervace', exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole('link', { name: 'Přihlášení', exact: true })).toBeVisible();

  const viewportFitsDocument = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(viewportFitsDocument).toBe(true);

  await context.close();
});

test('anonymous desktop: horizontální navigace zůstává zobrazená', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Otevřít menu' })).toBeHidden();
});
