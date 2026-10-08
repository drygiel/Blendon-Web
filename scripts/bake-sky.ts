// pnpm bake:sky - prefilters the Scene view's sky in a browser and saves it as public/scene/sky-env.png.
// Run it again after changing the sky in src/scene/render/sky.ts.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const out = fileURLToPath(new URL('../public/scene/sky-env.png', import.meta.url));

const server = await createServer({ logLevel: 'error', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e));
  await page.goto(new URL('scripts/bake-sky.html', server.resolvedUrls?.local[0]).href);
  // A string, since the scripts' config has no DOM types.
  const png = await page.waitForFunction('window.skyPng');
  const data = String(await png.jsonValue());
  writeFileSync(out, Buffer.from(data.replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
  await server.close();
}
