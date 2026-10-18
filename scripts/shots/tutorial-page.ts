// pnpm exec tsx scripts/shots/tutorial-page.ts [--url URL] [--out FILE] - redraws the landing's Tutorial page picture.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { launch, openSite, wait } from '../perf/common.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_OUT = join(root, 'src/assets/landing/tutorial-page.png');

// Two of the First Scene's seven tasks done, so the third is the open one, as the picture has always shown.
const PROGRESS = JSON.stringify({ done: ['nav.orbit', 'nav.pan'], chosen: '', started: true });
const STORAGE_KEY = 'blendon.tutorial';

// The picture's size in the landing (the img's width and height), with the card centred in it.
const WIDTH = 678;
const HEIGHT = 461;
const SCALE = 2;
// Under the split-screen breakpoint the window fills the page and its card is the viewport less 240 px, 653 here.
const VIEWPORT_WIDTH = 893;

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--')),
  options: { url: { type: 'string' }, out: { type: 'string', default: DEFAULT_OUT } },
});

const site = await openSite(values.url);
const browser = await launch();
try {
  // Tall enough to show the card without the window's scroll. Reduced motion lands the open task at once.
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: 1400 },
    deviceScaleFactor: SCALE,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, PROGRESS]);
  await page.goto(site.url);
  await page.locator('#try').scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();

  const win = page.locator('#try .uw');
  const card = win.locator('.tutc').first();
  await card.waitFor();
  await win.locator('.tutr.cur .tutpic img').waitFor();
  await page.waitForFunction(
    "[...document.querySelectorAll('#try .uw img')].every((img) => img.complete && img.naturalWidth > 0)",
  );
  // Lets the open task's picture settle after it has loaded.
  await wait(500);

  // The neighbouring cards would show in the margin around this one.
  await page.evaluate(`(() => {
    const card = document.querySelector('#try .uw .tutc');
    for (const el of card.parentElement.children) if (el !== card) el.style.visibility = 'hidden';
  })()`);

  const box = await card.boundingBox();
  if (!box) throw new Error('The First Scene card has no box');
  const x = Math.round((box.x - (WIDTH - box.width) / 2) * SCALE) / SCALE;
  const y = Math.round((box.y - (HEIGHT - box.height) / 2) * SCALE) / SCALE;
  const out = values.out;
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, clip: { x, y, width: WIDTH, height: HEIGHT } });
  console.log(`Wrote ${out} (${WIDTH * SCALE}x${HEIGHT * SCALE}, card ${box.width}x${box.height})`);
} finally {
  await browser.close();
  await site.close();
}
