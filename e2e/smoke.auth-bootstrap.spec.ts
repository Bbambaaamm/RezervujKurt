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
