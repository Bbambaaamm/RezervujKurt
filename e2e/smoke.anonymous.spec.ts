import { expect, test } from '@playwright/test';

test.describe('E2E smoke: anonymní read-only guard', () => {
  test('anonymní uživatel vidí dostupnost a nemůže vytvořit rezervaci', async ({ page }) => {
    await page.goto('/rezervace');

    await expect(page.getByRole('heading', { name: 'Rezervace kurtů' })).toBeVisible();
    await expect(page.getByText('Denní přehled všech 3 kurtů na jednom místě.')).toBeVisible();
    await page.getByLabel('Vyberte den').fill('2026-05-14');

    await expect(
      page.getByRole('button', {
        name: /stav (obsazeno|čeká na schválení)/i,
      }).first(),
    ).toBeVisible();

    const authGuard = page.getByText('Pro vytvoření rezervace se musíte přihlásit.');
    await expect(authGuard).toBeVisible();

    const loginCta = page.getByRole('link', { name: 'Přejít na přihlášení' });
    await expect(loginCta).toBeVisible();
    await expect(loginCta).toHaveAttribute('href', '/prihlaseni');
  });
});
