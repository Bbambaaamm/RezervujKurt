import { expect, test } from '@playwright/test';

test.describe('rezervační tabulka na desktopu', () => {
  test('zobrazuje všechny kurty vedle sebe', async ({ page }) => {
    await page.goto('/rezervace');

    const desktopGrid = page.locator('section').filter({ hasText: 'Tip: Pro rychlý výběr' }).locator('.md\\:block');
    await expect(desktopGrid).toBeVisible();
    await expect(desktopGrid.getByText('Kurt 1', { exact: true })).toBeVisible();
    await expect(desktopGrid.getByText('Kurt 2', { exact: true })).toBeVisible();
    await expect(desktopGrid.getByText('Kurt 3', { exact: true })).toBeVisible();
  });
});

test.describe('rezervační tabulka na mobilu', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('přepíná kurty a tažením vybere souvislý rozsah bez posunu stránky', async ({ page }) => {
    await page.goto('/rezervace');

    const courtTabs = page.getByRole('tablist', { name: 'Výběr kurtu' });
    await expect(courtTabs).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Kurt 1' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Kurt 2' }).click();
    await expect(page.getByRole('tab', { name: 'Kurt 2' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Kurt 2' })).toBeVisible();

    const mobilePanel = page.getByRole('tabpanel', { name: 'Kurt 2' });
    const firstSlot = mobilePanel.locator('[data-slot-time="19"]');
    const middleSlot = mobilePanel.locator('[data-slot-time="19.5"]');
    const lastSlot = mobilePanel.locator('[data-slot-time="20"]');
    await firstSlot.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const firstBox = await firstSlot.boundingBox();
    const lastBox = await lastSlot.boundingBox();
    expect(firstBox).not.toBeNull();
    expect(lastBox).not.toBeNull();

    await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(lastBox!.x + lastBox!.width / 2, lastBox!.y + lastBox!.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect(firstSlot).toHaveAttribute('aria-pressed', 'true');
    await expect(middleSlot).toHaveAttribute('aria-pressed', 'true');
    await expect(lastSlot).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });
});
