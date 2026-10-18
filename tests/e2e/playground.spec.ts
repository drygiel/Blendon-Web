import { readFileSync } from 'node:fs';
import type { Locator } from '@playwright/test';
import type { TutorialData } from '../../src/plugin/tutorial.ts';
import { expect, type Page, test } from './fixtures.ts';

// The plugin's own tutorial texts and keys, so the checks follow its wording.
const readJson = <T>(file: string) =>
  JSON.parse(readFileSync(new URL('../../src/plugin/generated/' + file, import.meta.url), 'utf8')) as T;
const TASKS = readJson<TutorialData>('tutorial.json').chapters.flatMap((c) => c.tasks);
const KEYMAP = readJson<{ keymap: Record<string, { b: string }> }>('window-data.json').keymap;
const taskData = (id: string) => TASKS.find((t) => t.id === id)!;

let errors: string[] = [];

async function openWindow(page: Page) {
  await page.locator('#try').scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await expect(win).toBeVisible();
  return win;
}

test.beforeEach(async ({ page, browserName }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Off Chromium, CI's WebGL is missing (Firefox) or software-rendered slow enough to stall the page (WebKit).
  // These tests are about the settings window, so the Scene view falls back to its poster there.
  if (browserName !== 'chromium')
    await page.addInitScript(() => {
      type Canvas = { prototype: { getContext: (this: unknown, id: string, ...rest: unknown[]) => unknown } };
      const proto = (globalThis as unknown as { HTMLCanvasElement: Canvas }).HTMLCanvasElement.prototype;
      const getContext = proto.getContext;
      proto.getContext = function (id, ...rest) {
        return id.startsWith('webgl') ? null : getContext.call(this, id, ...rest);
      };
    });
  await page.goto('');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('loads the settings window near its section, on the Tutorial page', async ({ page }) => {
  await expect(page.locator('.uw')).toHaveCount(0);
  const win = await openWindow(page);
  await expect(win.locator('.htitle')).toHaveText('Tutorial');
  await expect(win.locator('.si.sel')).toHaveAttribute('aria-label', 'Tutorial');
  await expect(win.getByText('FIRST SCENE')).toBeVisible();
  await expect(win.locator('.tutstat')).toContainText(/0 of \d+ tasks done\./);
});

test('picks a tutorial task by clicking it', async ({ page }) => {
  const win = await openWindow(page);
  const zoom = win.locator('.tutr', { hasText: 'Zoom toward a corner of the floor' });
  await expect(zoom.locator('.tuthint')).toHaveCount(0);
  await zoom.locator('.tutt').click();
  await expect(zoom.locator('.tuthint')).toBeVisible();
  // A task's gear opens the page that owns its keys, with that row lit.
  await win.locator('.tutr', { hasText: 'Slide the camera sideways' }).locator('.tutgear').click();
  await expect(win.locator('.htitle')).toHaveText('Pan');
  await expect(win.locator('[data-hl="true"]')).toBeVisible();
});

/** A task's row on the Tutorial page. */
const taskRow = (win: Locator, id: string) =>
  win.locator('.tutr').filter({ has: win.page().locator('.tutname').getByText(taskData(id).title, { exact: true }) });

const openPage = (win: Locator, label: string) => win.locator(`.si[aria-label="${label}"]`).click();

/** The row's hover card says `text`. Hovered again while the page still scrolls to its current task. */
async function expectCard(win: Locator, row: Locator, text: string) {
  await expect(async () => {
    // From outside, so the row sees the pointer come in again.
    await win.page().mouse.move(0, 0);
    await row.locator('.tutt').hover();
    await expect(win.locator('.rtip')).toContainText(text, { timeout: 1500 });
  }).toPass();
}

test('with the Tools pie off, picking the Move tool takes the other way, on its own keys', async ({ page }) => {
  const win = await openWindow(page);
  const way = taskData('handles.move-tool').otherwise![0];
  await openPage(win, 'Pie Menus');
  await win.getByRole('button', { name: 'Enable Tools', exact: true }).click();
  await openPage(win, 'Tutorial');
  const row = taskRow(win, 'handles.move-tool');
  await expect(row.locator('.tuttag')).toHaveCount(0);
  await expect(row.locator('.tutkeys')).toHaveText(KEYMAP[way.keys].b);
  await row.locator('.tutt').click();
  await expect(row.locator('.tuthint')).toHaveText(way.text);
});

test('stepping up to the parent builds on the group or the kept pivot, and is skipped once both are', async ({
  page,
}) => {
  const win = await openWindow(page);
  await openPage(win, 'Context Menu');
  await win.getByRole('button', { name: 'Show Group & Unparent' }).click();
  await openPage(win, 'Tutorial');
  await expect(taskRow(win, 'select.group').locator('.tuttag')).toHaveText('OFF');
  await expect(taskRow(win, 'select.parent').locator('.tuttag')).toHaveCount(0);

  await openPage(win, 'Rotate');
  await win.getByRole('button', { name: 'Enable Rotate', exact: true }).click();
  await openPage(win, 'Tutorial');
  const parent = taskRow(win, 'select.parent');
  await expect(parent.locator('.tuttag')).toHaveText('OFF');
  const titles = taskData('select.parent').after!.map((id) => `"${taskData(id).title}"`);
  await expectCard(win, parent, `Skipped while ${titles.join(' and ')} are skipped. This task builds on one of them`);
});

test('with Precision Mode off, fine-tuning is skipped for the reason the plugin gives', async ({ page }) => {
  const win = await openWindow(page);
  await openPage(win, 'All Tools');
  const precision = win.locator('.cell', { has: page.locator('.ctx', { hasText: 'PRECISION MODE' }) });
  await precision.getByRole('button', { name: 'Enable', exact: true }).click();
  await openPage(win, 'Tutorial');
  const row = taskRow(win, 'grab.slow');
  await expect(row.locator('.tuttag')).toHaveText('OFF');
  await expectCard(
    win,
    row,
    `Skipped while ${taskData('grab.slow').availableWhen!.reason}. Change that to do this task`,
  );
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
  await win.locator('.si[aria-label="Blendon"]').click();
  const popup = page.waitForEvent('popup');
  // The popup's URL is still blank when it opens, and a PDF may become a download that never commits it.
  const request = page.context().waitForEvent('request', (r) => /Blendon_Manual\.pdf$/.test(r.url()));
  await win.getByText('Blendon manual (PDF)').click();
  await Promise.all([popup, request]);
});
