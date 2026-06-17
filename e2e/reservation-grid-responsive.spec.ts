import { expect, test } from '@playwright/test';

const courtNamesByOrder = ['Kurt 3', 'Kurt 4', 'Kurt 5'] as const;
const [firstCourtName, secondCourtName, thirdCourtName] = courtNamesByOrder;

test.describe('rezervační tabulka na desktopu', () => {
  test('zobrazuje všechny kurty vedle sebe', async ({ page }) => {
    await page.goto('/rezervace');

    const desktopGrid = page.locator('section').filter({ hasText: 'Tip: Pro rychlý výběr' }).locator('.md\\:block');
    await expect(desktopGrid).toBeVisible();
    await expect(desktopGrid.getByText(firstCourtName, { exact: true })).toBeVisible();
    await expect(desktopGrid.getByText(secondCourtName, { exact: true })).toBeVisible();
    await expect(desktopGrid.getByText(thirdCourtName, { exact: true })).toBeVisible();
  });
});

test.describe('rezervační tabulka na mobilu', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('přepne kurt před výběrem i po tapnutí jednoho slotu', async ({ page }) => {
    await page.goto('/rezervace');

    const courtTabs = page.getByRole('tablist', { name: 'Výběr kurtu' });
    await expect(courtTabs).toBeVisible();
    await expect(page.getByRole('tab', { name: firstCourtName })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: secondCourtName }).click();
    await expect(page.getByRole('tab', { name: secondCourtName })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: secondCourtName })).toBeVisible();

    await page.getByRole('tab', { name: firstCourtName }).click();
    const firstSlot = page.getByRole('tabpanel', { name: firstCourtName }).locator('[data-slot-time="19"]');
    await firstSlot.click();
    await expect(firstSlot).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('tab', { name: secondCourtName }).click();
    await expect(page.getByRole('tab', { name: secondCourtName })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: secondCourtName })).toBeVisible();

    const dateInput = page.getByLabel('Vyberte den');
    const selectedDate = await dateInput.inputValue();
    const nextDate = new Date(`${selectedDate}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    await dateInput.fill(nextDate.toISOString().slice(0, 10));

    await expect(page.getByRole('tab', { name: secondCourtName })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: secondCourtName })).toBeVisible();
  });

  test('po tažení přepne kurt a neposune stránku', async ({ page }) => {
    await page.goto('/rezervace');

    const mobilePanel = page.getByRole('tabpanel', { name: firstCourtName });
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

    await page.getByRole('tab', { name: secondCourtName }).click();
    await expect(page.getByRole('tab', { name: secondCourtName })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: secondCourtName })).toBeVisible();
  });
});
