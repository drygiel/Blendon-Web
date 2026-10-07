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
/** The pen out of sight, as if gone into a drawing: nothing drawn, no glow, no sparks. */
export const GHOST = 6;
export type SegmentKind =
  typeof RAIL | typeof WRITE | typeof UP | typeof FINALE | typeof JUMP | typeof RING | typeof GHOST;

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
  /** Where the pen writes the title, if not along its underline: a line above the title, say. */
  lineY?: number;
  /**
   * The previous title's route runs on past this title instead of the rail branching under it: the title is
   * uncovered while the pen travels between these two named route points.
   */
  along?: [string, string];
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
  /** The underline's height, which times the writing even when the pen writes along another line. */
  ky: number;
  /** Uncovered by a stretch of a route rather than written along a branch of the rail. */
  along?: boolean;
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
  /** Leaps straight from the end of the title's line instead of from the rail. */
  fromTitle?: boolean;
}

/** A corner of a route. */
export interface RoutePoint extends Point {
  /** Corner radius; 0 for a sharp corner the pen passes exactly. */
  r?: number;
  /**
   * Keyframe of the leg ending here: the share of the screen height the point is at when the pen gets there,
   * or null for none. By default the pen holds its line down a vertical leg and hurries across a level one.
   */
  key?: number | null;
  /** Least scroll the leg ending here takes. */
  gap?: number;
  /** Names the point, so the page can tell when the pen has passed it. */
  mark?: string;
  /** The pen travels the leg ending here out of sight. */
  ghost?: boolean;
}

/**
 * A route after a title: instead of going back to the rail, the pen keeps drawing through these corners
 * and rejoins the rail at the height of the last one.
 */
export interface Route {
  title: number;
  pts: RoutePoint[];
  /** Goes back to the rail first, as without a route, and starts from there. */
  fromRail?: boolean;
  /** Names the route's start, where the title's line ends. */
  startMark?: string;
  /** Runs on into the next section instead of crossing back to the rail. */
  continues?: boolean;
}

/** One straight leg of a route, ending at path index `i`. */
export interface Leg {
  i: number;
  y: number;
  len: number;
  horizontal: boolean;
  key?: number | null;
  gap?: number;
}

export interface Station {
  name: string;
  title: number;
  cy: number;
  /** Height on the rail where the leap starts. */
  fromY: number;
  /** The leap starts where the title's line ends. */
  fromTitle: boolean;
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
  /** Arc length of each named route point. */
  marks: Map<string, number>;
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
    polyline(pts: RoutePoint[], radius: number, k: SegmentKind): number[] {
      const ends: number[] = [];
      for (let j = 0; j < pts.length; j++) {
        const c = pts[j];
        const n = pts[j + 1];
        const ax = c.x - lx;
        const ay = c.y - ly;
        const la = Math.hypot(ax, ay);
        const kc = c.ghost ? GHOST : k;
        if (!n) {
          this.line(c.x, c.y, kc);
          ends.push(xs.length - 1);
          break;
        }
        const bx = n.x - c.x;
        const by = n.y - c.y;
        const lb = Math.hypot(bx, by);
        const r = Math.min(c.r ?? radius, la / 2, lb / 2);
        this.line(c.x - (ax / (la || 1)) * r, c.y - (ay / (la || 1)) * r, kc);
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
            n.ghost ? GHOST : k,
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

/** The ellipse the pen closes round the call to action: centre, radii, start angle and sweep. */
export function ctaEllipse(cta: Box) {
  return { cx: cta.cx, cy: cta.cy, rx: cta.w / 2 + 30, ry: cta.h / 2 + 22, a0: -0.35, sweep: Math.PI * 2 * 1.06 };
}

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
  const named = new Map<string, number>();
  const marks: { d: Detour; jy: number; iJump: number; i0: number; i1: number }[] = [];
  pb.move(origin.x, origin.y);
  titles.forEach((t, i) => {
    const { x: ex, y: ky } = underlineEnd(t);
    const uy = t.lineY ?? ky;
    const sx = t.left - 14;
    const r = clamp((t.left - rx) * 0.5, 6, 26);
    const th = t.bottom - t.top;
    if (t.along) {
      // Filled in from the named points once the route through this section is laid.
      const at = pb.count() - 1;
      runs.push({ i0: at, i1: at, s0: 0, s1: 0, b0: 0, b1: 0, sx, ex, uy: ky, th, ky, along: true });
    } else {
      if (i === 0) pb.cubic(origin.x - 40, origin.y - 170, sx - 130, uy + 70, sx, uy, UP);
      else {
        pb.line(rx, uy - r, RAIL);
        pb.cubic(rx, uy - r * 0.45, rx + r * 0.45, uy, rx + r, uy, RAIL);
        if (sx > rx + r + 1) pb.line(sx, uy, RAIL);
      }
      const i0 = pb.count() - 1;
      pb.line(ex, uy, WRITE);
      runs.push({ i0, i1: pb.count() - 1, s0: 0, s1: 0, b0: 0, b1: 0, sx, ex, uy, th, ky });
    }
    const last = i === titles.length - 1;
    const route = last ? undefined : routes.find((x) => x.title === i && x.pts.length);
    const d = last ? undefined : detours.find((x) => x.title === i);
    const back = () => {
      // Back along the underline with the pen up, then down the rail again.
      pb.line(rx + r, uy, UP);
      pb.cubic(rx + r * 0.45, uy, rx, uy + r * 0.45, rx, uy + r, RAIL);
    };
    if (route) {
      if (route.startMark) named.set(route.startMark, pb.count() - 1);
      if (route.fromRail) back();
      const end = route.pts[route.pts.length - 1];
      const pts: RoutePoint[] = [];
      let prev: Point = pb.last();
      const start = prev;
      const home = route.continues
        ? []
        : [
            { x: rx, y: end.y },
            { x: rx, y: end.y + r },
          ];
      for (const p of [...route.pts, ...home]) {
        if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1) continue;
        pts.push(p);
        prev = p;
      }
      const ends = pb.polyline(pts, ROUTE_RADIUS, RAIL);
      pts.forEach((p, k) => p.mark && named.set(p.mark, ends[k]));
      // The last leg only turns down onto the rail; the rail's own keyframes take it from there.
      legs.set(
        i,
        (route.continues ? ends : ends.slice(0, -1)).map((ix, k) => {
          const a = k ? pts[k - 1] : start;
          const c = pts[k];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          return {
            i: ix,
            y: c.y,
            len: Math.hypot(dx, dy),
            horizontal: Math.abs(dx) > Math.abs(dy),
            key: c.key,
            gap: c.gap,
          };
        }),
      );
    } else if (!last && !d?.fromTitle && !t.along) back();
    if (d && (d.fromTitle || d.cy > pb.last().y)) {
      const from = pb.last();
      let jy = from.y;
      if (!d.fromTitle) {
        jy = clamp(d.from ?? d.cy, from.y, d.cy);
        pb.line(rx, jy, RAIL);
      }
      const jx = pb.last().x;
      const iJump = pb.count() - 1;
      // An arcing leap, higher the farther it goes.
      const dx = d.cx - jx;
      const lift = clamp(Math.abs(dx) * 0.32, 80, 260);
      pb.cubic(jx + dx * 0.3, jy - lift, d.cx - dx * 0.25, Math.min(jy, d.cy) - lift, d.cx, d.cy, JUMP);
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
    const e = ctaEllipse(cta);
    const ex0 = e.cx + Math.cos(e.a0) * e.rx;
    const ey0 = e.cy + Math.sin(e.a0) * e.ry;
    pb.cubic(l.x + 50, l.y + 30, ex0 + 80, ey0 - 30, ex0, ey0, FINALE);
    pb.ellipse(e.cx, e.cy, e.rx, e.ry, e.a0, e.sweep, FINALE);
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
    marks: new Map(),
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
  titles.forEach((t, k) => {
    const run = runs[k];
    const a = t.along ? named.get(t.along[0]) : undefined;
    const b = t.along ? named.get(t.along[1]) : undefined;
    if (run && a !== undefined && b !== undefined) {
      run.i0 = a;
      run.i1 = b;
    }
  });
  for (const r of runs) {
    r.s0 = s[r.i0];
    r.s1 = s[r.i1];
    r.b0 = b[r.i0];
    r.b1 = b[r.i1];
  }
  for (const [name, i] of named) path.marks.set(name, s[i]);
  path.stations = marks.map(({ d, jy, iJump, i0, i1 }) => ({
    name: d.name,
    title: d.title,
    cy: d.cy,
    fromY: jy,
    fromTitle: d.fromTitle === true,
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
    // A title along a route is timed by the route's own keyframes.
    if (i > 0 && !r.along) {
      // A taller title is finished lower down, so its middle, not its underline, passes the line.
      const anchor = viewportH * WRITE_LINE + Math.min(r.th * 0.5, viewportH * 0.2);
      const lead = clamp((r.s1 - r.s0) * 0.4, 90, viewportH * 0.3);
      // When a later point pulls the writing earlier, it keeps its length of scroll.
      kf.push({ sc: r.ky - anchor - lead, b: r.b0 }, { sc: r.ky - anchor, b: r.b1, gap: lead });
    }
    // Down a route the pen holds its line on screen; across, it hurries over in a short stretch of scroll.
    let prev = kf[kf.length - 1].sc;
    for (const leg of path.legs.get(i) ?? []) {
      if (leg.key === null) continue;
      const gap = leg.gap ?? (leg.horizontal && leg.key === undefined ? clamp(leg.len * 0.15, 80, 180) : MIN_GAP);
      // A point given its own line is reached exactly there: the keyframes before it give way, and the pen
      // hurries to make it. By default the pen only holds its line while it can.
      const sc =
        typeof leg.key === 'number'
          ? leg.y - viewportH * leg.key
          : leg.horizontal
            ? prev + gap
            : Math.max(prev + gap, leg.y - viewportH * ROUTE_LINE);
      kf.push({ sc, b: path.b[leg.i], gap });
      prev = sc;
    }
    // The leap starts as its rail point passes the route line and lands with the point low on screen.
    for (const st of path.stations) {
      if (st.title !== i) continue;
      const land = st.cy - viewportH * STATION_LINE;
      // From the title's line the leap follows straight on from the writing.
      if (!st.fromTitle) kf.push({ sc: Math.min(land - JUMP_SCROLL, st.fromY - viewportH * ROUTE_LINE), b: st.bJump });
      kf.push(
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

/** Arc length where a downward vertical stretch between path indices `i0` and `i1` reaches height `y`. */
export function sAtY(path: PlotPath, y: number, i0: number, i1: number): number | null {
  let best: number | null = null;
  for (let i = Math.max(1, i0); i <= Math.min(i1, path.n - 1); i++) {
    if (path.kind[i] !== RAIL || Math.abs(path.x[i] - path.x[i - 1]) > 0.5 || path.y[i] <= path.y[i - 1]) continue;
    best ??= path.s[i];
    if (path.y[i] >= y) return path.s[i];
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
