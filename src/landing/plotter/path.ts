// The pen's route down the page and the mapping from scroll position to how far along it the pen is.
// Pure functions in page coordinates, so they run (and are tested) without a DOM.

/** Segment kinds: the rail in the margin, writing under a title, a pen-up move, the closing ellipse. */
export const RAIL = 0;
export const WRITE = 1;
export const UP = 2;
export const FINALE = 3;
export type SegmentKind = typeof RAIL | typeof WRITE | typeof UP | typeof FINALE;

export interface Point {
  x: number;
  y: number;
}

/** A title's text extent in page coordinates. */
export interface TitleBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** One title's stretch of the path, where the pen writes under it. */
export interface Run {
  i0: number;
  i1: number;
  /** Arc length at the start and end of the stretch. */
  s0: number;
  s1: number;
  /** Scroll budget at the start and end of the stretch. */
  b0: number;
  b1: number;
  /** x where writing starts and ends, and the underline's y. */
  sx: number;
  ex: number;
  uy: number;
  /** Height of the title's text. */
  th: number;
}

export interface PlotPath {
  n: number;
  x: Float32Array;
  y: Float32Array;
  /** Arc length up to each point. */
  s: Float64Array;
  /** Scroll budget up to each point; pen-up moves cost less than drawing. */
  b: Float64Array;
  /** Kind of the segment that ends at each point. */
  kind: Uint8Array;
  /** Running maximum of y, for finding the first visible point. */
  maxY: Float32Array;
  runs: Run[];
  total: number;
}

export interface PathInput {
  titles: TitleBox[];
  railX: number;
  /** Where the pen ignites, in the hero scene. */
  origin: Point;
  /** The button the pen circles at the end, if any. */
  cta: Box | null;
}

const STEP = 4;
const UP_COST = 0.3;
const UNDERLINE_GAP = 6;

function sampler() {
  const xs: number[] = [];
  const ys: number[] = [];
  const ks: SegmentKind[] = [];
  let lx = 0;
  let ly = 0;
  const push = (x: number, y: number, k: SegmentKind) => {
    xs.push(x);
    ys.push(y);
    ks.push(k);
    lx = x;
    ly = y;
  };
  return {
    xs,
    ys,
    ks,
    last: (): Point => ({ x: lx, y: ly }),
    count: () => xs.length,
    move: (x: number, y: number) => push(x, y, UP),
    line(x: number, y: number, k: SegmentKind) {
      const x0 = lx;
      const y0 = ly;
      const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / STEP));
      for (let i = 1; i <= n; i++) push(x0 + ((x - x0) * i) / n, y0 + ((y - y0) * i) / n, k);
    },
    cubic(x1: number, y1: number, x2: number, y2: number, x: number, y: number, k: SegmentKind) {
      const x0 = lx;
      const y0 = ly;
      const est = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x - x2, y - y2);
      const n = Math.max(2, Math.ceil(est / STEP));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const m = 1 - t;
        push(
          m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x,
          m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y,
          k,
        );
      }
    },
    ellipse(cx: number, cy: number, rx: number, ry: number, a0: number, sweep: number, k: SegmentKind) {
      const n = Math.ceil((Math.abs(sweep) * Math.max(rx, ry)) / STEP);
      for (let i = 1; i <= n; i++) {
        const a = a0 + (sweep * i) / n;
        push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, k);
      }
    },
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * The route: from the hero origin up to the first title, then down the rail with a branch under every
 * later title, ending in an ellipse around the call to action.
 */
export function buildPath({ titles, railX: rx, origin, cta }: PathInput): PlotPath {
  const pb = sampler();
  const runs: Run[] = [];
  pb.move(origin.x, origin.y);
  titles.forEach((t, i) => {
    const uy = t.bottom + UNDERLINE_GAP;
    const sx = t.left - 14;
    const ex = t.right + 16;
    const r = clamp((t.left - rx) * 0.5, 6, 26);
    if (i === 0) pb.cubic(origin.x - 40, origin.y - 170, sx - 130, uy + 70, sx, uy, UP);
    else {
      pb.line(rx, uy - r, RAIL);
      pb.cubic(rx, uy - r * 0.45, rx + r * 0.45, uy, rx + r, uy, RAIL);
      if (sx > rx + r + 1) pb.line(sx, uy, RAIL);
    }
    const i0 = pb.count() - 1;
    pb.line(ex, uy, WRITE);
    runs.push({ i0, i1: pb.count() - 1, s0: 0, s1: 0, b0: 0, b1: 0, sx, ex, uy, th: t.bottom - t.top });
    if (i < titles.length - 1) {
      // Back along the underline with the pen up, then down the rail again.
      pb.line(rx + r, uy, UP);
      pb.cubic(rx + r * 0.45, uy, rx, uy + r * 0.45, rx, uy + r, RAIL);
    }
  });
  if (cta) {
    const l = pb.last();
    const erx = cta.w / 2 + 30;
    const ery = cta.h / 2 + 22;
    const a0 = -0.35;
    const ex0 = cta.cx + Math.cos(a0) * erx;
    const ey0 = cta.cy + Math.sin(a0) * ery;
    pb.cubic(l.x + 50, l.y + 30, ex0 + 80, ey0 - 30, ex0, ey0, FINALE);
    pb.ellipse(cta.cx, cta.cy, erx, ery, a0, Math.PI * 2 * 1.06, FINALE);
  }

  const n = pb.xs.length;
  const path: PlotPath = {
    n,
    x: new Float32Array(pb.xs),
    y: new Float32Array(pb.ys),
    s: new Float64Array(n),
    b: new Float64Array(n),
    kind: new Uint8Array(pb.ks),
    maxY: new Float32Array(n),
    runs,
    total: 0,
  };
  const { x, y, s, b, kind, maxY } = path;
  maxY[0] = y[0] ?? 0;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    s[i] = s[i - 1] + d;
    b[i] = b[i - 1] + d * (kind[i] === UP ? UP_COST : 1);
    maxY[i] = Math.max(maxY[i - 1], y[i]);
  }
  path.total = n ? s[n - 1] : 0;
  for (const r of runs) {
    r.s0 = s[r.i0];
    r.s1 = s[r.i1];
    r.b0 = b[r.i0];
    r.b1 = b[r.i1];
  }
  return path;
}

export interface Keyframe {
  /** Scroll position. */
  sc: number;
  /** Scroll budget along the path. */
  b: number;
}

/** Where on screen, as a share of its height, a one-line title is underlined once written. */
export const WRITE_LINE = 0.42;

/**
 * Scroll keyframes: each title gets written while it passes through the reading zone, the pen finishes the
 * page exactly at the bottom, and the last stretch keeps enough scroll to draw the closing ellipse.
 */
export function scrollKeyframes(path: PlotPath, viewportH: number, maxScroll: number): Keyframe[] {
  const first = path.runs[0];
  if (!first || path.n < 2) return [{ sc: 0, b: 0 }];
  const kf: Keyframe[] = [{ sc: 0, b: first.b1 }];
  for (const r of path.runs.slice(1)) {
    // A taller title is finished lower down, so its middle, not its underline, passes the line.
    const anchor = viewportH * WRITE_LINE + Math.min(r.th * 0.5, viewportH * 0.2);
    const lead = clamp((r.s1 - r.s0) * 0.4, 90, viewportH * 0.3);
    kf.push({ sc: r.uy - anchor - lead, b: r.b0 }, { sc: r.uy - anchor, b: r.b1 });
  }
  kf.push({ sc: Math.max(maxScroll, 1), b: path.b[path.n - 1] });
  for (let j = kf.length - 2; j >= 1; j--) {
    const gap = j === kf.length - 2 ? Math.min(viewportH * 0.35, 280) : 24;
    kf[j].sc = Math.min(kf[j].sc, kf[j + 1].sc - gap);
  }
  for (let j = 1; j < kf.length; j++) kf[j].sc = Math.max(kf[j].sc, kf[j - 1].sc + 1);
  return kf;
}

export function bAtScroll(kf: Keyframe[], sc: number): number {
  const head = kf[0];
  if (!head) return 0;
  if (sc <= head.sc) return head.b;
  for (let j = 1; j < kf.length; j++) {
    const a = kf[j - 1];
    const c = kf[j];
    if (sc <= c.sc) return a.b + (c.b - a.b) * ((sc - a.sc) / (c.sc - a.sc || 1));
  }
  return kf[kf.length - 1].b;
}

/** First index from 1 whose value is at least `v` (arrays ascend). */
function firstAtLeast(arr: Float64Array, n: number, v: number): number {
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export function sAtB(path: PlotPath, b: number): number {
  if (path.n < 2 || b <= 0) return 0;
  const i = firstAtLeast(path.b, path.n, b);
  const f = clamp((b - path.b[i - 1]) / (path.b[i] - path.b[i - 1] || 1), 0, 1);
  return path.s[i - 1] + (path.s[i] - path.s[i - 1]) * f;
}

export interface PenPoint extends Point {
  kind: SegmentKind;
  /** Index of the segment end the pen is on. */
  i: number;
}

export function posAt(path: PlotPath, s: number): PenPoint {
  if (path.n < 2) return { x: path.x[0] ?? 0, y: path.y[0] ?? 0, kind: UP, i: 1 };
  const i = firstAtLeast(path.s, path.n, s);
  const f = clamp((s - path.s[i - 1]) / (path.s[i] - path.s[i - 1] || 1), 0, 1);
  return {
    x: path.x[i - 1] + (path.x[i] - path.x[i - 1]) * f,
    y: path.y[i - 1] + (path.y[i] - path.y[i - 1]) * f,
    kind: path.kind[i] as SegmentKind,
    i,
  };
}

/** How long the opening takes: ignition, the flight up to the headline, writing it. */
export const INTRO_END = 2.1;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Arc length during the opening, by time since load. */
export function introS(path: PlotPath, t: number): number {
  const r = path.runs[0];
  if (!r) return 0;
  if (t < 0.45) return 0;
  if (t < 0.95) return easeInOut((t - 0.45) / 0.5) * r.s0;
  if (t < INTRO_END) return r.s0 + easeSine((t - 0.95) / (INTRO_END - 0.95)) * (r.s1 - r.s0);
  return r.s1;
}
