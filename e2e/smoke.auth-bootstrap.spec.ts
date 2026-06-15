import { expect, test } from '@playwright/test';

test.describe('auth bootstrap smoke', () => {
  test('member storageState: přístup na /ucet je autentizovaný', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/member.json' });
    const page = await context.newPage();

    await page.goto('/ucet');
    await expect(page.getByRole('heading', { name: 'Účet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odhlásit se' })).toBeVisible();

    await context.close();
  });

  test('member storageState: mobilní navigace nepřetéká a obsahuje členské odkazy', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/member.json',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();

    await page.goto('/rezervace');
    await expect(page.getByRole('button', { name: 'Otevřít menu' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeHidden();

    await page.getByRole('button', { name: 'Otevřít menu' }).click();

    const mobileNavigation = page.getByRole('navigation', { name: 'Mobilní navigace' });
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation.getByRole('link', { name: 'Domů', exact: true })).toBeVisible();
    await expect(mobileNavigation.getByRole('link', { name: 'Rezervace', exact: true })).toBeVisible();
    await expect(mobileNavigation.getByRole('link', { name: 'Moje rezervace', exact: true })).toBeVisible();
    await expect(mobileNavigation.getByRole('link', { name: 'Účet', exact: true })).toBeVisible();
    await expect(mobileNavigation.getByRole('button', { name: 'Odhlášení', exact: true })).toBeVisible();

    const viewportFitsDocument = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(viewportFitsDocument).toBe(true);

    await context.close();
  });

  test('admin storageState: přístup na /admin projde guardem', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await context.newPage();

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Administrace rezervací' })).toBeVisible();
    await expect(page.getByText('Nemáte oprávnění pro správu rezervací.')).toHaveCount(0);
    await expect(page.getByText('Pro zobrazení administrace se musíte přihlásit.')).toHaveCount(0);

    await context.close();
  });
});
