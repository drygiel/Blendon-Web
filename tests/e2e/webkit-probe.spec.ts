// Temporary: bisects the WebKit hang on CI.
import { expect, test } from '@playwright/test';

test.skip(({ browserName }) => browserName !== 'webkit');
test.setTimeout(30_000);

const NO_WEBGL = `const g = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (id, ...r) { return id.startsWith('webgl') ? null : g.call(this, id, ...r); };`;
const HB = `let raf = 0; const loop = () => { raf++; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
setInterval(() => { console.log('hb raf=' + raf); raf = 0; }, 1000);`;

const CSS: Record<string, string> = {
  norise: "[data-reveal='rise']{filter:none!important}",
  nofade: "[data-reveal='fade']{transition:none!important}",
  notryfilter: '#try *{filter:none!important}',
  notrytransition: '#try,#try *{transition:none!important}',
};

for (const variant of Object.keys(CSS))
  for (const n of [1, 2, 3])
    test(`${variant} ${n}`, async ({ page }) => {
      await page.addInitScript({ content: NO_WEBGL });
      await page.addInitScript({ content: HB });
      const hb: string[] = [];
      page.on('console', (m) => hb.push(m.text()));
      await page.goto('');
      await page.addStyleTag({ content: CSS[variant] });
      await page.locator('#try').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      const before = hb.slice(-2).join(' ');
      try {
        await page.getByRole('tab', { name: 'Blendon', exact: true }).click({ timeout: 10_000 });
        await expect(page.locator('#try .uw')).toBeVisible({ timeout: 10_000 });
        await page.locator('#try .uw').getByRole('button', { name: 'Zoom', exact: true }).click({ timeout: 5_000 });
        console.log(`PROBE ${variant} ${n} ok before=[${before}] after=[${hb.slice(-2).join(' ')}]`);
      } catch (e) {
        console.log(`PROBE ${variant} ${n} HANG before=[${before}] after=[${hb.slice(-2).join(' ')}]`);
        throw e;
      }
    });
