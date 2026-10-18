// pnpm perf:frames [--url URL] [--profile desktop|touch|all] [--runs N] [--json FILE] - long frames at the Try It dock.
import {
  PROFILES,
  launch,
  median,
  openPage,
  openSite,
  pad,
  readArgs,
  scrollUntil,
  wait,
  writeJson,
  type Pace,
  type Profile,
} from './common.ts';

const USAGE = `Usage: pnpm perf:frames [--url URL] [--profile desktop|touch|all] [--runs N] [--json FILE]
Scrolls the landing like a reader into and through the Try It section (#try) and lists every animation frame
of 50 ms or more, classed by the time since the last scroll. Without --url it serves dist/ (pnpm build first).`;

/** A frame this soon after scroll input shows as a hitch mid-scroll. */
const SCROLLING_MS = 100;
/** calm.ts QUIET_MS: from here on a frame is a calm moment, where the dock means to mount. */
const CALM_MS = 400;

// Strokes with short gaps and a read every third: calm comes the way it does for a visitor, not on a timer.
const READER: Pace = { stroke: 0.5, speed: 1200, gap: 200, pause: 1200, every: 3 };

// Runs in the page before its own scripts. A string, since the scripts' config has no DOM types.
const PROBE = `(() => {
  const perf = (window.__perf = { frames: [], scrolls: [], mounts: {} });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      perf.frames.push({
        start: e.startTime,
        duration: e.duration,
        blocking: e.blockingDuration,
        scripts: e.scripts.map((s) => ({
          invoker: s.invoker,
          type: s.invokerType,
          url: s.sourceURL,
          fn: s.sourceFunctionName,
          duration: s.duration,
        })),
      });
  }).observe({ type: 'long-animation-frame', buffered: true });
  // Input timestamps, so a stroke that lands during a long frame still counts from when it came.
  const mark = (e) => perf.scrolls.push(e.timeStamp);
  for (const type of ['scroll', 'wheel', 'touchmove']) addEventListener(type, mark, { passive: true });
  // A mutation callback runs in the task that commits the mount, so its time falls inside the mount's frame.
  const watch = () => {
    const dock = document.querySelector('[data-playground]') || document.body;
    const seen = {};
    const check = () => {
      const now = performance.now();
      const placeholder = dock.querySelector('[aria-label="Loading the settings window"]');
      if (placeholder) seen.window = true;
      else if (seen.window && perf.mounts.window == null) perf.mounts.window = now;
      if (perf.mounts.scene == null && dock.querySelector('[role=application]')) perf.mounts.scene = now;
    };
    check();
    new MutationObserver(check).observe(dock, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', watch);
  else watch();
})();`;

interface RawFrame {
  start: number;
  duration: number;
  blocking: number;
  scripts: { invoker: string; type: string; url: string; fn: string; duration: number }[];
}
interface Probe {
  frames: RawFrame[];
  scrolls: number[];
  mounts: { window?: number; scene?: number };
}

type FrameClass = 'scroll' | 'settle' | 'calm';

interface Frame {
  /** Start, ms after the scenario began. */
  t: number;
  duration: number;
  blocking: number;
  class: FrameClass;
  /** Ms between the last scroll input and the frame's start. */
  sinceScroll: number;
  mount?: 'window' | 'scene';
  /** The longest script in the frame. */
  source: string;
}

interface Mount {
  /** Ms after the scenario began. */
  t: number;
  /** The frame the mount committed in, or null when that frame stayed under 50 ms. */
  frameMs: number | null;
  class: FrameClass;
}

interface Run {
  frames: Frame[];
  over50: number;
  over100: number;
  over100Scrolling: number;
  worstMs: number;
  window: Mount | null;
  scene: Mount | null;
}

const classOf = (gap: number): FrameClass => (gap < SCROLLING_MS ? 'scroll' : gap < CALM_MS ? 'settle' : 'calm');

function sinceScroll(scrolls: number[], t: number): number {
  let last = -Infinity;
  for (const s of scrolls) if (s <= t && s > last) last = s;
  return t - last;
}

function sourceOf(f: RawFrame): string {
  const top = [...f.scripts].sort((a, b) => b.duration - a.duration)[0];
  if (!top) return '(no script: style, layout, paint)';
  const file = top.url.split('/').pop() || '(inline)';
  // A script's own evaluation names its URL as the invoker, which the file already says.
  const invoker = /^https?:/.test(top.invoker) ? top.type : top.invoker;
  return `${invoker} ${file}${top.fn ? ` ${top.fn}` : ''} ${Math.round(top.duration)}ms`;
}

async function measure(url: string, profile: Profile): Promise<Run> {
  const browser = await launch();
  try {
    const { page, cdp } = await openPage(browser, profile);
    page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
    await page.addInitScript(PROBE);
    await page.goto(url, { waitUntil: 'load' });
    await wait(1500);
    // Far enough above the dock that nothing of it has started loading: 400% of the viewport and a bit.
    // Instant, since the page's CSS scrolls smoothly and the glide would run into the scenario.
    const dockTop = `document.querySelector('#try [data-playground]').getBoundingClientRect().top + scrollY`;
    await page.evaluate(`scrollTo({ top: Math.max(0, ${dockTop} - innerHeight * 5.5), behavior: 'instant' })`);
    await wait(3000);
    const t0 = await page.evaluate<number>('performance.now()');

    // Up to the section's title, as the pen underlines it, a read there, then on through the dock and out.
    await scrollUntil(
      page,
      cdp,
      profile,
      `document.getElementById('try').getBoundingClientRect().top - innerHeight * 0.15`,
      READER,
    );
    await wait(2000);
    await scrollUntil(
      page,
      cdp,
      profile,
      `document.getElementById('try').getBoundingClientRect().bottom - innerHeight * 0.25`,
      READER,
    );
    await wait(1500);

    const t1 = await page.evaluate<number>('performance.now()');
    const probe = await page.evaluate<Probe>('window.__perf');
    const scrolls = [...probe.scrolls].sort((a, b) => a - b);
    const inFrame = (f: RawFrame, t?: number) => t != null && t >= f.start && t <= f.start + f.duration;

    const frames: Frame[] = probe.frames
      .filter((f) => f.start >= t0 && f.start <= t1)
      .map((f) => {
        const gap = sinceScroll(scrolls, f.start);
        return {
          t: Math.round(f.start - t0),
          duration: Math.round(f.duration),
          blocking: Math.round(f.blocking),
          class: classOf(gap),
          sinceScroll: Math.round(Math.min(gap, 1e6)),
          mount: inFrame(f, probe.mounts.window) ? 'window' : inFrame(f, probe.mounts.scene) ? 'scene' : undefined,
          source: sourceOf(f),
        };
      });

    const mount = (t?: number): Mount | null => {
      if (t == null) return null;
      const f = probe.frames.find((x) => inFrame(x, t));
      return {
        t: Math.round(t - t0),
        frameMs: f ? Math.round(f.duration) : null,
        class: classOf(sinceScroll(scrolls, f ? f.start : t)),
      };
    };
    const over100 = frames.filter((f) => f.duration >= 100);
    return {
      frames,
      over50: frames.length,
      over100: over100.length,
      over100Scrolling: over100.filter((f) => f.class !== 'calm').length,
      worstMs: Math.max(0, ...frames.map((f) => f.duration)),
      window: mount(probe.mounts.window),
      scene: mount(probe.mounts.scene),
    };
  } finally {
    await browser.close();
  }
}

const mountText = (m: Mount | null) =>
  !m ? 'not seen' : `${m.frameMs == null ? '<50' : m.frameMs} ms at ${m.t} ms (${m.class})`;

function print(run: Run, label: string) {
  console.log(`\n${label}`);
  if (run.frames.length) console.log(`  ${pad('t ms', 7)} ${pad('dur', 5)} ${pad('block', 5)}  class   since  source`);
  for (const f of run.frames) {
    const since = pad(f.sinceScroll > 99999 ? '-' : f.sinceScroll, 6);
    const note = `${f.mount ? `[${f.mount} mount] ` : ''}${f.source}`;
    console.log(`  ${pad(f.t, 7)} ${pad(f.duration, 5)} ${pad(f.blocking, 5)}  ${f.class.padEnd(6)} ${since}  ${note}`);
  }
  const over100 = `${run.over100} (${run.over100Scrolling} not calm)`;
  console.log(`  frames >= 50 ms: ${run.over50}, >= 100 ms: ${over100}, worst ${run.worstMs} ms`);
  console.log(`  window mount: ${mountText(run.window)}; scene mount: ${mountText(run.scene)}`);
}

const args = readArgs(USAGE, true);
const names = args.profile === 'all' ? (['desktop', 'touch'] as const) : [args.profile];
const profiles = names.map((n) => {
  if (n !== 'desktop' && n !== 'touch') throw new Error(`--profile is desktop, touch or all, got ${n}`);
  return PROFILES[n];
});

const site = await openSite(args.url);
const report: Record<string, unknown> = { url: site.url, runs: args.runs, at: new Date().toISOString(), profiles: {} };
try {
  for (const profile of profiles) {
    const runs: Run[] = [];
    for (let i = 0; i < args.runs; i++) {
      const run = await measure(site.url, profile);
      runs.push(run);
      const { width, height } = profile.viewport;
      print(run, `${profile.name} ${width}x${height} cpu x${profile.cpu}, run ${i + 1}/${args.runs}`);
    }
    const mid = (pick: (r: Run) => number | null | undefined) =>
      median(runs.map(pick).filter((v): v is number => typeof v === 'number'));
    const summary = {
      over50: mid((r) => r.over50),
      over100: mid((r) => r.over100),
      over100Scrolling: mid((r) => r.over100Scrolling),
      worstMs: mid((r) => r.worstMs),
      windowMountMs: mid((r) => r.window?.frameMs),
      sceneMountMs: mid((r) => r.scene?.frameMs),
    };
    if (args.runs > 1) console.log(`\n${profile.name} median of ${args.runs}: ${JSON.stringify(summary)}`);
    (report.profiles as Record<string, unknown>)[profile.name] = { profile, median: summary, runs };
  }
} finally {
  await site.close();
}
writeJson(args.json, report);
