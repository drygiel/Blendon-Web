import { expect, test } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('renders every section', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('rewired for Blender hands.');
  for (const id of ['video', 'features', 'precision', 'pies', 'tutorial', 'setup', 'try', 'shortcuts', 'hood', 'get']) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
});

test('feature explorer switches groups and items', async ({ page }) => {
  const features = page.locator('#features');
  await features.getByRole('tab', { name: /Transform gizmos/ }).click();
  await features.getByRole('button', { name: /Rotate/ }).click();
  await expect(features.getByRole('heading', { level: 3 })).toHaveText('Rotate');
  await expect(features.locator('video')).toHaveAttribute('poster', /Rotate/);
});

test('pie demo switches menus', async ({ page }) => {
  const pies = page.locator('#pies');
  await pies.getByRole('button', { name: /Add Object/ }).click();
  await expect(pies.getByText('New objects land where the pie was opened')).toBeVisible();
  await expect(pies.getByRole('button', { name: /^Camera/ })).toBeVisible();
});

test('settings carousel steps and wraps', async ({ page }) => {
  const setup = page.locator('#setup');
  await setup.getByRole('button', { name: 'Previous settings page' }).click({ force: true });
  await expect(setup.getByRole('button', { name: 'Show the Navigation History settings page' })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('manual links open the PDF in a new tab', async ({ page, request }) => {
  const links = page.getByRole('link', { name: /manual \(PDF\)/i });
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', /Blendon_Manual\.pdf$/);
  }
  const href = await links.first().getAttribute('href');
  const res = await request.get(href ?? '');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('pdf');
});

test('promo video loads the player only when asked', async ({ page }) => {
  // The tests stay offline: YouTube answers with blanks.
  await page.route(/youtube-nocookie\.com|ytimg\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  const video = page.locator('#video');
  await expect(video.locator('iframe')).toHaveCount(0);
  await video.getByRole('button', { name: /Play Blendon/ }).click();
  await expect(video.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/hrjcGZ32UHI\?autoplay=1/);
});
