// The pen's route down the page and the mapping from scroll position to how far along it the pen is.
// Pure functions in page coordinates, so they run (and are tested) without a DOM.

/** Segment kinds: the rail in the margin, writing under a title, a pen-up move, the closing ellipse,
 *  a sparking leap into a station and the circle the pen draws there. */
export const RAIL = 0;
export const WRITE = 1;
export const UP = 2;
export const FINALE = 3;
export const JUMP = 4;
export const RING = 5;
export type SegmentKind = typeof RAIL | typeof WRITE | typeof UP | typeof FINALE | typeof JUMP | typeof RING;

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

/** A detour after a title: the pen leaps from the rail into a point, ignites there and circles it. */
export interface Detour {
  /** Index of the title it follows. */
  title: number;
  name: string;
  cx: number;
  cy: number;
  /** Radius of the circle drawn around the point. */
  r: number;
  /** Height on the rail where the leap starts; the point's own height by default. */
  from?: number;
}

/**
 * A route after a title: instead of going back to the rail, the pen keeps drawing through these corners
 * and rejoins the rail at the height of the last one.
 */
export interface Route {
  title: number;
  pts: Point[];
}

/** One straight leg of a route, ending at path index `i`. */
export interface Leg {
  i: number;
  y: number;
  len: number;
  horizontal: boolean;
}

export interface Station {
  name: string;
  title: number;
  cy: number;
  /** Height on the rail where the leap starts. */
  fromY: number;
  /** Arc length and budget where the leap starts, where the pen lands and where its circle closes. */
  sJump: number;
  bJump: number;
  s0: number;
  b0: number;
  s1: number;
  b1: number;
  iJump: number;
  i0: number;
  i1: number;
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
  stations: Station[];
  /** Legs of each title's route, by title index. */
  legs: Map<number, Leg[]>;
  total: number;
}

export interface PathInput {
  titles: TitleBox[];
  railX: number;
  /** Where the pen ignites, in the hero scene. */
  origin: Point;
  /** The button the pen circles at the end, if any. */
  cta: Box | null;
  detours?: Detour[];
  routes?: Route[];
}

const STEP = 4;
const UP_COST = 0.3;
const UNDERLINE_GAP = 6;
/** Corner radius of a route. */
const ROUTE_RADIUS = 26;

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
    /** Straight legs through `pts`, each corner rounded; returns the index where each leg's straight part ends. */
    polyline(pts: Point[], radius: number, k: SegmentKind): number[] {
      const ends: number[] = [];
      for (let j = 0; j < pts.length; j++) {
        const c = pts[j];
        const n = pts[j + 1];
        const ax = c.x - lx;
        const ay = c.y - ly;
        const la = Math.hypot(ax, ay);
        if (!n) {
          this.line(c.x, c.y, k);
          ends.push(xs.length - 1);
          break;
        }
        const bx = n.x - c.x;
        const by = n.y - c.y;
        const lb = Math.hypot(bx, by);
        const r = Math.min(radius, la / 2, lb / 2);
        this.line(c.x - (ax / (la || 1)) * r, c.y - (ay / (la || 1)) * r, k);
        ends.push(xs.length - 1);
        if (r > 0.5) {
          const ux = bx / lb;
          const uy = by / lb;
          this.cubic(
            c.x - (ax / la) * r * 0.45,
            c.y - (ay / la) * r * 0.45,
            c.x + ux * r * 0.45,
            c.y + uy * r * 0.45,
            c.x + ux * r,
            c.y + uy * r,
            k,
          );
        }
      }
      return ends;
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

/** Where writing under a title ends, and the underline's height. */
export const underlineEnd = (t: TitleBox): Point => ({ x: t.right + 16, y: t.bottom + UNDERLINE_GAP });

/**
 * The route: from the hero origin up to the first title, then down the rail with a branch under every
 * later title, ending in an ellipse around the call to action. A title with a route draws on past its
 * underline and rejoins the rail lower down. A detour after a title leaps from the rail into its point,
 * circles it and drops back onto the rail.
 */
export function buildPath({ titles, railX: rx, origin, cta, detours = [], routes = [] }: PathInput): PlotPath {
  const pb = sampler();
  const runs: Run[] = [];
  const legs = new Map<number, Leg[]>();
  const marks: { d: Detour; jy: number; iJump: number; i0: number; i1: number }[] = [];
  pb.move(origin.x, origin.y);
  titles.forEach((t, i) => {
    const { x: ex, y: uy } = underlineEnd(t);
    const sx = t.left - 14;
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
    const route = i < titles.length - 1 ? routes.find((x) => x.title === i && x.pts.length) : undefined;
    if (route) {
      const end = route.pts[route.pts.length - 1];
      const pts: Point[] = [];
      let prev: Point = { x: ex, y: uy };
      for (const p of [...route.pts, { x: rx, y: end.y }, { x: rx, y: end.y + r }]) {
        if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1) continue;
        pts.push(p);
        prev = p;
      }
      const ends = pb.polyline(pts, ROUTE_RADIUS, RAIL);
      // The last leg only turns down onto the rail; the rail's own keyframes take it from there.
      legs.set(
        i,
        ends.slice(0, -1).map((ix, k) => {
          const a = k ? pts[k - 1] : { x: ex, y: uy };
          const c = pts[k];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          return { i: ix, y: c.y, len: Math.hypot(dx, dy), horizontal: Math.abs(dx) > Math.abs(dy) };
        }),
      );
    } else if (i < titles.length - 1) {
      // Back along the underline with the pen up, then down the rail again.
      pb.line(rx + r, uy, UP);
      pb.cubic(rx + r * 0.45, uy, rx, uy + r * 0.45, rx, uy + r, RAIL);
    }
    const d = detours.find((x) => x.title === i);
    if (d && i < titles.length - 1 && d.cy > pb.last().y) {
      const jy = clamp(d.from ?? d.cy, pb.last().y, d.cy);
      pb.line(rx, jy, RAIL);
      const iJump = pb.count() - 1;
      // An arcing leap, higher the farther it goes.
      const dx = d.cx - rx;
      const lift = Math.min(260, dx * 0.32);
      pb.cubic(rx + dx * 0.3, jy - lift, d.cx - dx * 0.25, Math.min(jy, d.cy) - lift, d.cx, d.cy, JUMP);
      const i0 = pb.count() - 1;
      // A radius out to the circle, then the circle itself, counterclockwise as angles are measured.
      pb.line(d.cx + d.r, d.cy, RING);
      pb.ellipse(d.cx, d.cy, d.r, d.r, 0, -Math.PI * 2, RING);
      const i1 = pb.count() - 1;
      pb.cubic(d.cx + d.r * 0.4, d.cy + d.r * 1.1, rx + 80, d.cy + d.r * 1.1, rx, d.cy + d.r + 40, UP);
      marks.push({ d, jy, iJump, i0, i1 });
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
    stations: [],
    legs,
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
  path.stations = marks.map(({ d, jy, iJump, i0, i1 }) => ({
    name: d.name,
    title: d.title,
    cy: d.cy,
    fromY: jy,
    sJump: s[iJump],
    bJump: b[iJump],
    s0: s[i0],
    b0: b[i0],
    s1: s[i1],
    b1: b[i1],
    iJump,
    i0,
    i1,
  }));
  return path;
}

export interface Keyframe {
  /** Scroll position. */
  sc: number;
  /** Scroll budget along the path. */
  b: number;
  /** Least scroll between the previous keyframe and this one. */
  gap?: number;
}

/** Where on screen, as a share of its height, a one-line title is underlined once written. */
export const WRITE_LINE = 0.42;
/** Where on screen a station's point is when the pen lands in it: low enough that it lands early. */
export const STATION_LINE = 0.6;
/** Where on screen the pen stays while it runs down a route. */
export const ROUTE_LINE = 0.5;
/** Least scroll the leap into a station takes, in pixels. */
const JUMP_SCROLL = 120;
/** Scroll the circle after a landing takes: the plotter draws it by time instead. */
export const RING_SCROLL = 24;
/** Scroll the pen then rests on the closed circle before it heads back to the rail. */
const RING_REST = 140;
const MIN_GAP = 24;

/**
 * Scroll keyframes: each title gets written while it passes through the reading zone, the pen finishes the
 * page exactly at the bottom, and the last stretch keeps enough scroll to draw the closing ellipse.
 */
export function scrollKeyframes(path: PlotPath, viewportH: number, maxScroll: number): Keyframe[] {
  const first = path.runs[0];
  if (!first || path.n < 2) return [{ sc: 0, b: 0 }];
  const kf: Keyframe[] = [{ sc: 0, b: first.b1 }];
  path.runs.forEach((r, i) => {
    if (i > 0) {
      // A taller title is finished lower down, so its middle, not its underline, passes the line.
      const anchor = viewportH * WRITE_LINE + Math.min(r.th * 0.5, viewportH * 0.2);
      const lead = clamp((r.s1 - r.s0) * 0.4, 90, viewportH * 0.3);
      kf.push({ sc: r.uy - anchor - lead, b: r.b0 }, { sc: r.uy - anchor, b: r.b1 });
    }
    // Down a route the pen holds its line on screen; across, it hurries over in a short stretch of scroll.
    let prev = kf[kf.length - 1].sc;
    for (const leg of path.legs.get(i) ?? []) {
      const gap = leg.horizontal ? clamp(leg.len * 0.15, 80, 180) : MIN_GAP;
      const sc = leg.horizontal ? prev + gap : Math.max(prev + gap, leg.y - viewportH * ROUTE_LINE);
      kf.push({ sc, b: path.b[leg.i], gap });
      prev = sc;
    }
    // The leap starts as its rail point passes the route line and lands with the point low on screen.
    for (const st of path.stations) {
      if (st.title !== i) continue;
      const land = st.cy - viewportH * STATION_LINE;
      kf.push(
        { sc: Math.min(land - JUMP_SCROLL, st.fromY - viewportH * ROUTE_LINE), b: st.bJump },
        { sc: land, b: st.b0, gap: JUMP_SCROLL },
        { sc: land + RING_SCROLL, b: st.b1 },
        { sc: land + RING_SCROLL + RING_REST, b: st.b1, gap: RING_REST },
      );
    }
  });
  kf.push({ sc: Math.max(maxScroll, 1), b: path.b[path.n - 1] });
  for (let j = kf.length - 2; j >= 1; j--) {
    const gap = j === kf.length - 2 ? Math.min(viewportH * 0.35, 280) : (kf[j + 1].gap ?? MIN_GAP);
    kf[j].sc = Math.min(kf[j].sc, kf[j + 1].sc - gap);
  }
  for (let j = 1; j < kf.length; j++) kf[j].sc = Math.max(kf[j].sc, kf[j - 1].sc + 1);
  return kf;
}

/** Arc length where the rail, between path indices `i0` and `i1`, first reaches height `y`. */
export function sAtRailY(path: PlotPath, y: number, i0: number, i1: number, railX: number): number | null {
  let best: number | null = null;
  for (let i = Math.max(1, i0); i <= Math.min(i1, path.n - 1); i++) {
    if (path.kind[i] !== RAIL || Math.abs(path.x[i] - railX) > 0.5) continue;
    best = path.s[i];
    if (path.y[i] >= y) break;
  }
  return best;
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
