import { expect, test } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // React reports a prerender that doesn't match the client on the console, then renders anew.
  page.on('console', (m) => m.type() === 'error' && /hydrat/i.test(m.text()) && errors.push(m.text()));
  await page.goto('');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('renders every section', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('rewired for Blender hands.');
  for (const id of [
    'video',
    'compare',
    'features',
    'precision',
    'pies',
    'tutorial',
    'setup',
    'pace',
    'try',
    'shortcuts',
    'hood',
    'faq',
    'get',
  ]) {
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
  // Playing brings the player to the middle of the screen.
  const player = page.locator('[data-plot-anchor="video-player"]');
  const offset = async () => {
    const r = await player.boundingBox();
    const h = page.viewportSize()?.height ?? 0;
    return r ? Math.abs(r.y + r.height / 2 - h / 2) : Infinity;
  };
  await expect.poll(offset).toBeLessThan(4);
});

test('faq answers open on click', async ({ page }) => {
  const faq = page.locator('#faq');
  const answer = faq.getByText(/^Per seat, under the Unity Asset Store/);
  await expect(answer).toBeHidden();
  await faq.getByText('How is it licensed?').click();
  await expect(answer).toBeVisible();
});

test('ships the landing prerendered, with its structured data', async ({ page, request }) => {
  const html = await (await request.get('')).text();
  expect(html).toContain('rewired for');
  expect(html).toContain('before you buy.');

  const data = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1] ?? '') as { '@type': string; offers?: { price: string }; mainEntity?: unknown[] },
  );
  expect(data.find((d) => d['@type'] === 'SoftwareApplication')?.offers?.price).toBe('40.00');
  const faq = data.find((d) => d['@type'] === 'FAQPage');
  await expect(page.locator('#faq details')).toHaveCount(faq?.mainEntity?.length ?? -1);
});

test('the pen writes a title as it scrolls into view, then its lead appears', async ({ page }) => {
  const title = page.locator('#compare [data-pen]');
  await expect(title).not.toHaveAttribute('data-pen-p', '1');
  // Scroll a notch at a time, as a reader would, until the pen has finished the title.
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, 120);
        return title.getAttribute('data-pen-p');
      },
      { timeout: 20_000, intervals: [150] },
    )
    .toBe('1');
  await expect(page.locator('#compare [data-reveal="rise"]').first()).toHaveAttribute('data-in', '');
});

test('with reduced motion everything shows at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('');
  await expect(page.locator('html')).not.toHaveClass(/\bplot\b/);
  const lead = page.locator('#faq [data-reveal]').first();
  await expect(lead).toHaveCSS('opacity', '1');
  await expect(page.locator('#compare .plot-ghost')).toBeHidden();
});

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('');
  // A string, since this project's test config has no DOM types.
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the plotter keeps its drawing unstretched when its box outgrows the root, as under a hiding URL bar', async ({
  page,
}) => {
  // Bitmap pixels per CSS pixel down, over those across; 1 when the drawing is not stretched.
  const stretch = () =>
    page.evaluate<number>(`(() => {
      const c = document.querySelector('.plot-canvas');
      const r = c.getBoundingClientRect();
      return c.height / r.height / (c.width / r.width);
    })()`);
  await expect.poll(stretch).toBeCloseTo(1, 2);
  await page.evaluate(`document.querySelector('.plot-canvas').style.height =
    document.documentElement.clientHeight + 64 + 'px'`);
  await expect.poll(stretch).toBeCloseTo(1, 2);
});

test('without scripts the prerendered page shows all its content', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL ?? '');
  await expect(page.locator('#compare [data-reveal="rise"]').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('#compare .plot-ink')).toHaveCSS('clip-path', 'none');
  await context.close();
});
