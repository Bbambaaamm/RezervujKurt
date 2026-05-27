import { expect, test } from '@playwright/test';

test('anonymous smoke: /rezervace je read-only a bez fallback banneru', async ({ page }) => {
  await page.goto('/rezervace');

  await expect(page.getByRole('heading', { name: 'Rezervace kurtů' })).toBeVisible();
  await expect(page.getByText('Čas')).toBeVisible();
  await expect(page.getByText('Kurt 1')).toBeVisible();

  await expect(page.getByText('Pro vytvoření rezervace se musíte přihlásit.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rezervovat' })).toHaveCount(0);

  await expect(page.getByText('DEV upozornění: čtení ze Supabase selhalo a stránka používá mock fallback data.')).toHaveCount(0);
});
