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

test('edits a built-in pie in the pie menu editor without saving it', async ({ page }) => {
  const win = await openWindow(page);
  await win.locator('.si[aria-label="Pie Menus"]').click();
  await win.locator('.pr .pt', { hasText: 'Draw Mode' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Pie Menu' });
  await expect(editor).toBeVisible();
  await expect(editor.getByText('BROWSER DEMO')).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Title' })).toHaveValue('Draw Mode');

  await editor.getByRole('button', { name: /^Slot 1:/ }).click();
  await page.getByRole('textbox', { name: 'Search actions' }).fill('cube');
  await page.keyboard.press('Enter');
  await expect(editor.getByRole('button', { name: 'Slot 1: Cube' })).toBeVisible();

  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.locator('.dlg .dtt')).toHaveText('Browser demo');
  await editor.getByRole('button', { name: 'Close Editor' }).click();
  await expect(editor).toHaveCount(0);
});

test('opens a new, empty pie menu from Add', async ({ page }) => {
  const win = await openWindow(page);
  await win.locator('.si[aria-label="Pie Menus"]').click();
  await win.locator('.nb.add').click();
  const editor = page.getByRole('dialog', { name: 'New Pie Menu' });
  await expect(editor.getByRole('button', { name: /^Slot \d: Empty$/ })).toHaveCount(8);
  await expect(editor.getByRole('button', { name: 'Create' })).toHaveClass(/off/);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
});

test('opens the manual from the Overview', async ({ page }) => {
  const win = await openWindow(page);
  const popup = page.waitForEvent('popup');
  await win.getByText('Blendon manual (PDF)').click();
  expect((await popup).url()).toMatch(/Blendon_Manual\.pdf$/);
});
