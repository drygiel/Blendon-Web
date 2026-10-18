// pnpm perf:reflow [--url URL] [--runs N] [--json FILE] - forced layouts while a phone loads and scrolls the landing.
import { basename } from 'node:path';
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
} from './common.ts';

const USAGE = `Usage: pnpm perf:reflow [--url URL] [--runs N] [--json FILE]
Traces a phone (412x823 @1.75, CPU x4) loading the landing and scrolling it to the end, and sums the Layout
events that ran inside script, i.e. layouts the page forced. Without --url it serves dist/ (pnpm build first).`;

const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline'];
const SCRIPT = new Set(['FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame']);
const MARK = 'perf:scroll-start';

// Faster than a reader: the whole page in reasonable time, with a stop now and then for the pen to settle.
const SKIM: Pace = { stroke: 0.8, speed: 2000, gap: 150, pause: 800, every: 4 };

interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: {
    data?: { functionName?: string; url?: string; lineNumber?: number; columnNumber?: number; message?: string };
  };
}

interface Span {
  name: string;
  start: number;
  end: number;
  data?: NonNullable<TraceEvent['args']>['data'];
}

interface Source {
  source: string;
  ms: number;
  count: number;
}

interface Run {
  forcedMs: number;
  forcedCount: number;
  loadMs: number;
  scrollMs: number;
  /** Every Layout in the trace, forced or not, to show the trace caught layouts at all. */
  allLayoutMs: number;
  top: Source[];
}

/** Complete events as they are, begin/end pairs matched per thread; ts in microseconds. */
function spans(events: TraceEvent[]): Map<string, Span[]> {
  const byThread = new Map<string, Span[]>();
  const open = new Map<string, TraceEvent[]>();
  const add = (key: string, s: Span) => (byThread.get(key) ?? byThread.set(key, []).get(key)!).push(s);
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    if (e.name !== 'Layout' && !SCRIPT.has(e.name)) continue;
    const key = `${e.pid}:${e.tid}`;
    if (e.ph === 'X') add(key, { name: e.name, start: e.ts, end: e.ts + (e.dur ?? 0), data: e.args?.data });
    else if (e.ph === 'B') {
      const k = `${key}:${e.name}`;
      (open.get(k) ?? open.set(k, []).get(k)!).push(e);
    } else if (e.ph === 'E') {
      const b = open.get(`${key}:${e.name}`)?.pop();
      if (b) add(key, { name: e.name, start: b.ts, end: e.ts, data: b.args?.data });
    }
  }
  return byThread;
}

function sourceOf(stack: Span[]): string {
  // The innermost script that names its code; the trace's stackTrace is empty in this build.
  for (let i = stack.length - 1; i >= 0; i--) {
    const d = stack[i].data;
    if (!d?.url && !d?.functionName) continue;
    // Line and column (1-based here), since a minified bundle is a line or two of one-letter function names.
    const at = d.lineNumber != null ? `:${d.lineNumber}:${d.columnNumber ?? 0}` : '';
    return `${d.functionName || '(anonymous)'} ${d.url ? basename(d.url.split('?')[0]) : ''}${at}`.trim();
  }
  return stack[0].name;
}

function analyse(events: TraceEvent[]): Run {
  const scrollStart = events.find((e) => e.name === 'TimeStamp' && e.args?.data?.message === MARK)?.ts ?? Infinity;
  const sources = new Map<string, Source>();
  let forced = 0;
  let count = 0;
  let load = 0;
  let all = 0;
  for (const list of spans(events).values()) {
    // Scripts before layouts at the same start, so a layout at a script's first tick still nests in it.
    list.sort((a, b) => a.start - b.start || (a.name === 'Layout' ? 1 : 0) - (b.name === 'Layout' ? 1 : 0));
    const stack: Span[] = [];
    for (const s of list) {
      while (stack.length && stack[stack.length - 1].end <= s.start) stack.pop();
      if (s.name !== 'Layout') {
        stack.push(s);
        continue;
      }
      const ms = (s.end - s.start) / 1000;
      all += ms;
      // Layout inside script on the same thread: the script asked for geometry while layout was dirty.
      if (!stack.length) continue;
      forced += ms;
      count++;
      if (s.start < scrollStart) load += ms;
      const key = sourceOf(stack);
      const src = sources.get(key) ?? sources.set(key, { source: key, ms: 0, count: 0 }).get(key)!;
      src.ms += ms;
      src.count++;
    }
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    forcedMs: round(forced),
    forcedCount: count,
    loadMs: round(load),
    scrollMs: round(forced - load),
    allLayoutMs: round(all),
    top: [...sources.values()]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
      .map((s) => ({ ...s, ms: round(s.ms) })),
  };
}

async function measure(url: string): Promise<Run> {
  const profile = PROFILES.phone;
  const browser = await launch();
  try {
    const { page, cdp } = await openPage(browser, profile);
    await browser.startTracing(page, { categories: CATEGORIES });
    await page.goto(url, { waitUntil: 'load' });
    await wait(2000);
    await page.evaluate(`console.timeStamp(${JSON.stringify(MARK)})`);
    await scrollUntil(page, cdp, profile, 'document.documentElement.scrollHeight - innerHeight - scrollY', SKIM);
    await wait(1000);
    const trace = JSON.parse((await browser.stopTracing()).toString('utf8')) as { traceEvents: TraceEvent[] };
    return analyse(trace.traceEvents);
  } finally {
    await browser.close();
  }
}

const args = readArgs(USAGE, false);
const site = await openSite(args.url);
const runs: Run[] = [];
try {
  for (let i = 0; i < args.runs; i++) {
    const run = await measure(site.url);
    runs.push(run);
    console.log(`\nphone 412x823 @1.75 cpu x4, run ${i + 1}/${args.runs}`);
    const split = `load ${run.loadMs} ms, scroll ${run.scrollMs} ms`;
    console.log(
      `  forced layout: ${run.forcedMs} ms in ${run.forcedCount} (${split}); all layout ${run.allLayoutMs} ms`,
    );
    for (const s of run.top) console.log(`  ${pad(s.ms.toFixed(1), 8)} ms ${pad(s.count, 5)}x  ${s.source}`);
  }
} finally {
  await site.close();
}
const summary = {
  forcedMs: median(runs.map((r) => r.forcedMs)),
  forcedCount: median(runs.map((r) => r.forcedCount)),
  loadMs: median(runs.map((r) => r.loadMs)),
  scrollMs: median(runs.map((r) => r.scrollMs)),
};
if (args.runs > 1) console.log(`\nmedian of ${args.runs}: ${JSON.stringify(summary)}`);
writeJson(args.json, {
  url: site.url,
  runs: args.runs,
  at: new Date().toISOString(),
  profile: PROFILES.phone,
  median: summary,
  results: runs,
});
