import type { Locator } from '@playwright/test';
import { expect, type Page, test } from './fixtures.ts';

// Settings Window section of the Overview: the theme, the reset bar and the sticky search bar. Values go in
// through the page's ?set= hook, the way the window stores them.
let errors: string[] = [];

async function openWindow(page: Page, sets: string[] = []) {
  const q = new URLSearchParams();
  for (const s of sets) q.append('set', s);
  await page.goto(sets.length ? '?' + q.toString() : '');
  await page.locator('#try').scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await expect(win).toBeVisible();
  return win;
}

// The e2e project has no DOM lib: the few members read in the page.
interface El {
  getBoundingClientRect(): { top: number; bottom: number };
  querySelector(s: string): El;
  scrollTop: number;
}
type Styles = (e: unknown) => { backgroundColor: string; color: string };

const bg = (l: Locator) =>
  l.evaluate((e) => (globalThis as unknown as { getComputedStyle: Styles }).getComputedStyle(e).backgroundColor);
const fg = (l: Locator) =>
  l.evaluate((e) => (globalThis as unknown as { getComputedStyle: Styles }).getComputedStyle(e).color);
/** Tops relative to the window, read in one go: the landing page may still be scrolling. */
const tops = (win: Locator, ...sel: string[]) =>
  win.evaluate((w, ss) => {
    const root = w as unknown as El;
    const y0 = root.getBoundingClientRect().top;
    return ss.map((s) => root.querySelector(s).getBoundingClientRect().top - y0);
  }, sel);

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('Unity is the default look, with the reset bar', async ({ page }) => {
  const win = await openWindow(page);
  await win.getByRole('button', { name: 'Zoom', exact: true }).click();
  expect(await bg(win.locator('.content'))).toBe('rgb(56, 56, 56)');
  expect(await bg(win.locator('.side'))).toBe('rgb(43, 43, 43)');
  expect(await bg(win.locator('.cell.boxed:not(.master)').first())).toBe('rgb(63, 63, 63)');
  await expect(win.locator('.ftr .rbtn')).toBeVisible();
});

test('Dark draws the zinc ladder and leaves native controls on the editor skin', async ({ page }) => {
  const win = await openWindow(page, ['GeneralSettings.SettingsTheme:Dark']);
  await win.getByRole('button', { name: 'Zoom', exact: true }).click();
  expect(await bg(win.locator('.side'))).toBe('rgb(18, 18, 20)');
  expect(await bg(win.locator('.content'))).toBe('rgb(22, 22, 25)');
  expect(await bg(win.locator('.cell.boxed:not(.master)').first())).toBe('rgb(33, 33, 37)');
  expect(await fg(win.locator('.htitle'))).toBe('rgb(242, 242, 244)');
  expect(await fg(win.locator('.lbl').first())).toBe('rgb(242, 242, 244)');
  expect(await bg(win.locator('.rbtn'))).toBe('rgb(54, 113, 201)');
  // Popup, checkbox and scrollbar keep Unity's dark chrome.
  expect(await bg(win.locator('.pp').first())).toBe('rgb(81, 81, 81)');
  expect(await bg(win.locator('.tg').first())).toBe('rgb(42, 42, 42)');
  expect(await bg(win.locator('.main-sb'))).toBe('rgb(50, 50, 50)');
});

test('Light draws white cards on a cool grey page, danger in red', async ({ page }) => {
  const win = await openWindow(page, ['GeneralSettings.SettingsTheme:Light']);
  await win.getByRole('button', { name: 'Blendon', exact: true }).click();
  expect(await bg(win.locator('.side'))).toBe('rgb(236, 236, 240)');
  expect(await bg(win.locator('.content'))).toBe('rgb(244, 244, 246)');
  expect(await bg(win.locator('.cell.boxed:not(.master)').first())).toBe('rgb(255, 255, 255)');
  expect(await fg(win.locator('.htitle'))).toBe('rgb(26, 26, 31)');
  const resetAll = win.locator('.rbtn.danger');
  expect(await bg(resetAll)).toBe('rgb(253, 234, 232)');
  expect(await fg(resetAll)).toBe('rgb(190, 59, 47)');
  expect(await bg(win.locator('.tg').first())).toBe('rgb(42, 42, 42)');
  // A page accent takes its light skin value.
  await win.getByRole('button', { name: 'Zoom', exact: true }).click();
  await expect(win.locator('.htitle')).toHaveText('Zoom');
  // Native one-line tooltips and menus stay the Editor's.
  await win.locator('.pp').first().click();
  expect(await bg(win.locator('.menu'))).toBe('rgb(43, 43, 43)');
});

test('Show Reset Bar off drops the strip and the list reaches the bottom', async ({ page }) => {
  const win = await openWindow(page, ['GeneralSettings.ShowResetBar:false']);
  await win.getByRole('button', { name: 'Zoom', exact: true }).click();
  await expect(win.locator('.ftr')).toHaveCount(0);
  const [view, content] = await win.evaluate((w) =>
    ['.view', '.content'].map((s) => (w as unknown as El).querySelector(s).getBoundingClientRect().bottom),
  );
  expect(view).toBeCloseTo(content, 0);
});

/** Wheel over the list, then waits for the slide to finish. */
async function wheel(page: Page, win: Locator, dy: number) {
  await win.locator('.scroll').hover();
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(500);
}

const headerShown = async (win: Locator) => {
  const [hdr, content] = await tops(win, '.hdr', '.content');
  return hdr - content;
};

test('the sticky bar slides away on scrolling down and back on any scroll up, without moving the rows', async ({
  page,
}) => {
  const win = await openWindow(page);
  await win.getByRole('button', { name: 'Blendon', exact: true }).click();
  expect(await headerShown(win)).toBe(0);

  const scroll = win.locator('.scroll');
  const row = '.pagebody > .row:nth-child(4)';
  const [rowBefore] = await tops(win, row);
  await win.locator('.scroll').hover();
  await page.mouse.wheel(0, 300);
  // Mid-slide and after it, the rows sit where the wheel alone put them.
  await page.waitForTimeout(60);
  const [rowMid, viewMid] = await tops(win, row, '.view');
  await page.waitForTimeout(500);
  const [rowAfter, view, content] = await tops(win, row, '.view', '.content');
  const scrolled = rowBefore - rowAfter;
  expect(scrolled).toBeGreaterThan(200);
  expect(Math.abs(rowMid - rowAfter)).toBeLessThanOrEqual(1);
  expect(viewMid).toBeGreaterThanOrEqual(view);
  expect(await headerShown(win)).toBeCloseTo(-60, 0);
  // The view grew by the bar and the scroll went back by as much.
  expect(view).toBeCloseTo(content, 0);
  expect(await scroll.evaluate((e) => (e as unknown as El).scrollTop)).toBeCloseTo(scrolled - 60, 0);

  await wheel(page, win, -40);
  expect(await headerShown(win)).toBe(0);
  const [rowBack] = await tops(win, row);
  expect(rowBack - rowAfter).toBeGreaterThan(0);

  // A page switch starts with the bar on screen.
  await wheel(page, win, 400);
  expect(await headerShown(win)).toBeCloseTo(-60, 0);
  await win.getByRole('button', { name: 'Keyboard', exact: true }).click();
  await page.waitForTimeout(200);
  expect(await headerShown(win)).toBe(0);
});

test('the sticky bar stays while searching and when switched off', async ({ page }) => {
  let win = await openWindow(page);
  await win.locator('.sin').fill('zoom');
  await wheel(page, win, 400);
  expect(await headerShown(win)).toBe(0);

  win = await openWindow(page, ['GeneralSettings.StickySearchBar:false']);
  await win.getByRole('button', { name: 'Blendon', exact: true }).click();
  await wheel(page, win, 400);
  expect(await headerShown(win)).toBe(0);
  expect(await win.locator('.scroll').evaluate((e) => (e as unknown as El).scrollTop)).toBeCloseTo(400, 0);
});
