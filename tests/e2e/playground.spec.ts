import { expect, type Page, test } from '@playwright/test';

let errors: string[] = [];

async function openWindow(page: Page) {
  await page.locator('#try').scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await expect(win).toBeVisible();
  return win;
}

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('loads the settings window near its section', async ({ page }) => {
  await expect(page.locator('.uw')).toHaveCount(0);
  const win = await openWindow(page);
  await expect(win.locator('.htitle')).toHaveText('Blendon');
});

test('navigates pages and searches every page', async ({ page }) => {
  const win = await openWindow(page);
  await win.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(win.locator('.htitle')).toHaveText('Move');
  await expect(win.locator('canvas')).toBeVisible();
  await win.getByLabel('Search settings').fill('snap');
  await expect(win.locator('.htitle')).toHaveText('Results for "snap"');
  await expect(win.locator('.hsub')).toHaveText('49 settings across all pages');
});

test('edits values and resets them', async ({ page }) => {
  const win = await openWindow(page);
  await win.getByRole('button', { name: 'Zoom', exact: true }).click();
  const box = win.locator('.nbox').first();
  await box.fill('0.5');
  await box.press('Enter');
  await expect(box).toHaveValue('0.5');
  await win.locator('.rbtn').click();
  await win.locator('.dlg').getByRole('button', { name: 'Reset' }).click();
  await expect(box).not.toHaveValue('0.5');
});

test('answers window-only actions with the demo note', async ({ page }) => {
  const win = await openWindow(page);
  await win.getByText('Unity Preferences > Shortcuts').click();
  await expect(win.locator('.dlg .dtt')).toHaveText('Demo only');
});

test('opens the manual from the Overview', async ({ page }) => {
  const win = await openWindow(page);
  const popup = page.waitForEvent('popup');
  await win.getByText('Blendon manual (PDF)').click();
  expect((await popup).url()).toMatch(/Blendon_Manual\.pdf$/);
});
