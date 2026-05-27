import { expect, test } from '@playwright/test';

test('anonymous smoke: grid je viditelný a rezervace je blokovaná', async ({ page }) => {
  await page.goto('/rezervace');

  await expect(page.getByRole('heading', { name: 'Rezervace kurtů' })).toBeVisible();
  await expect(page.getByText('DEV upozornění: čtení ze Supabase selhalo a stránka používá mock fallback data.')).toHaveCount(0);

  const gridSection = page.locator('section').filter({ hasText: 'Tip: Pro rychlý výběr přetáhněte přes více volných slotů.' });
  await expect(gridSection).toBeVisible();

  const slotButton = page.getByRole('button', { name: /stav (volno|obsazeno|čeká na schválení)/ }).first();
  await expect(slotButton).toBeVisible();

  await expect(page.getByText('Pro vytvoření rezervace se musíte přihlásit.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Přejít na přihlášení' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rezervovat' })).toHaveCount(0);
});
