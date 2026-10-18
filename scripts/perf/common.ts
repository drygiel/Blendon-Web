// Shared plumbing of the perf scripts: arguments, the browser, the site under test and a reader's scroll.
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));

export interface Profile {
  name: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  /** Emulation.setCPUThrottlingRate; a tablet or a phone is about this much slower than this desk. */
  cpu: number;
}

export const PROFILES = {
  desktop: {
    name: 'desktop',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpu: 1,
  },
  // A tablet rather than a phone: the dock keeps its side margins there, so a swipe at the edge scrolls the page.
  touch: {
    name: 'touch',
    viewport: { width: 800, height: 1280 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    cpu: 4,
  },
  phone: {
    name: 'phone',
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    cpu: 4,
  },
} satisfies Record<string, Profile>;

export interface Args {
  url?: string;
  runs: number;
  json?: string;
  profile: string;
}

export function readArgs(usage: string, withProfile: boolean): Args {
  // `pnpm perf:x -- --runs 3` hands the separator on; drop it so the flags still parse.
  const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string' },
      runs: { type: 'string', default: '1' },
      json: { type: 'string' },
      ...(withProfile ? { profile: { type: 'string', default: 'all' } } : {}),
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(usage);
    process.exit(0);
  }
  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs needs a whole number above 0, got ${values.runs}`);
  const profile = typeof values.profile === 'string' ? values.profile : 'all';
  return { url: values.url, runs, json: values.json, profile };
}

/** The site to measure: `--url` as given, or the production build in dist/ served on a free port. */
export async function openSite(url?: string): Promise<{ url: string; close: () => Promise<void> }> {
  if (url) return { url, close: async () => {} };
  if (!existsSync(`${root}/dist/index.html`))
    throw new Error('No dist/index.html: run pnpm build first, or pass --url.');
  const server = await preview({ root, logLevel: 'error', preview: { port: 0, strictPort: true, open: false } });
  const local = server.resolvedUrls?.local[0];
  if (!local) {
    await server.close();
    throw new Error('vite preview did not report a URL');
  }
  return { url: local, close: () => server.close() };
}

// Headless still draws WebGL on the GPU, so the Scene view costs what it costs in a window.
export const launch = (): Promise<Browser> => chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });

export async function openPage(browser: Browser, profile: Profile): Promise<{ page: Page; cdp: CDPSession }> {
  const { viewport, deviceScaleFactor, isMobile, hasTouch } = profile;
  const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  return { page, cdp };
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How a visitor scrolls: strokes of `stroke` viewports at `speed` px/s, `gap` ms apart, a longer pause every few. */
export interface Pace {
  stroke: number;
  speed: number;
  gap: number;
  pause: number;
  every: number;
}

// At the page's edge: the dock leaves a margin there on desktop and tablet, so a stroke never lands on the
// Scene view, whose wheel zooms the view and centres the dock instead of scrolling the page.
const EDGE_X = 8;

/** One stroke of real input, which scrolls on the compositor while the main thread is busy, as on a device. */
async function stroke(cdp: CDPSession, profile: Profile, distance: number, speed: number) {
  const mid = profile.viewport.height / 2;
  if (!profile.hasTouch) {
    await cdp.send('Input.synthesizeScrollGesture', {
      x: EDGE_X,
      y: Math.round(mid),
      yDistance: -Math.round(distance),
      speed,
      gestureSourceType: 'mouse',
    });
    return;
  }
  // A drag of touch events: synthesizeScrollGesture's touch source scrolls nothing in this headless build.
  const from = mid + distance / 2;
  const t0 = performance.now();
  const total = (distance / speed) * 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: EDGE_X, y: from }] });
  for (let t = 0; t < total; t = performance.now() - t0) {
    await wait(16);
    const y = from - distance * Math.min(1, (performance.now() - t0) / total);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: EDGE_X, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Scrolls in strokes until `remaining` (a page expression, in px) drops under a few pixels or the page ends. */
export async function scrollUntil(page: Page, cdp: CDPSession, profile: Profile, remaining: string, pace: Pace) {
  for (let n = 1; ; n++) {
    const left = await page.evaluate<number>(remaining);
    if (left < 8) return;
    const before = await page.evaluate<number>('scrollY');
    await stroke(cdp, profile, Math.min(left, pace.stroke * profile.viewport.height), pace.speed);
    if ((await page.evaluate<number>('scrollY')) <= before) return;
    await wait(n % pace.every === 0 ? pace.pause : pace.gap);
  }
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function writeJson(path: string | undefined, data: unknown) {
  if (!path) return;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${path}`);
}

export const pad = (v: string | number, n: number) => String(v).padStart(n);
