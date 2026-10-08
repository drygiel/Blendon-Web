// The background plotter: a fixed canvas behind the page. A glowing pen travels down a rail in the margin as
// the page scrolls, writes each section title, and every section draws its own mathematical plate.
// The page marks up what the plotter uses with data attributes; see the DOM contract in PlotterLayer.tsx.

import {
  AMBER,
  HOT,
  Ink,
  LIME,
  LIME_HOT,
  MONO,
  MONO_S,
  NEUTRAL,
  SERIF_S,
  TAU,
  WHITE,
  clamp,
  easeInOut,
  easeOut,
  greenSprites,
  sprites as sharedSprites,
  mix,
  rgba,
} from './draw.ts';
import {
  FINALE,
  GHOST,
  INTRO_END,
  JUMP,
  RING,
  UP,
  WRITE,
  bAtScroll,
  buildPath,
  ctaEllipse,
  introS,
  posAt,
  sAtB,
  sAtY,
  scrollKeyframes,
  underlineEnd,
  type Keyframe,
  type PlotPath,
  type Detour,
  type Point,
  type RoutePoint,
  type Route,
  type Run,
  type SegmentKind,
  type Station,
} from './path.ts';
import { curveGeometry } from './plates/curve.ts';
import { frustumEye } from './plates/frustum.ts';
import { HERO_ORIGIN_Y } from './plates/hero.ts';
import { rulerOrigin } from './plates/ruler.ts';
import { PLATES, type Plate, type PlateCtx, type Rect } from './plates/index.ts';
import { REVEAL_EVENT, plotStore } from './store.ts';

export interface HudParts {
  state: HTMLElement;
  section: HTMLElement;
  progress: HTMLElement;
}

export interface PlotterOptions {
  /** Draw a still background only: no pen, no trail, plates complete. */
  reduce: boolean;
  hud: HudParts | null;
  /** Exposes the plotter on `window.__plot` for profiling. */
  debug?: boolean;
}

interface TitleState {
  el: HTMLElement;
  ink: HTMLElement;
  section: HTMLElement | null;
  run: Run | null;
  left: number;
  right: number;
  top: number;
  bottom: number;
  blockLeft: number;
  blockW: number;
  rv: number;
  edge: number;
}

interface PlateState {
  el: HTMLElement;
  name: string;
  plate: Plate;
  section: Rect;
  content: Rect;
  title: Rect | null;
  trigger: number;
  p: number;
}

interface RevealState {
  el: HTMLElement;
  kind: string;
  title: TitleState | null;
  /** A station the pen must reach first, if any. */
  at: string | null;
  top: number;
}

/** A ring of light spreading from a point the pen ignites, in page coordinates. */
interface Flash {
  x: number;
  y: number;
  t: number;
  size: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  /** Pull downward, in px/s^2. */
  g: number;
}

const HOT_INK = 380;
const UP_WAKE = 620;
const MAX_SPARKS = 280;
const HERO_PLATE_SECONDS = 3.2;
/** Ambient motion alone, such as a slow spin or a flicker, redraws at about 30 fps. */
const AMBIENT_FRAME_MS = 30;
/** Ambient motion stops once the visitor has neither scrolled nor pointed nor typed for this long. */
const AMBIENT_IDLE_MS = 8000;
/** The background is soft and faint; more canvas pixels than this per CSS pixel cost more than they show. */
const MAX_DPR = 1.5;
/** Heat steps of the fresh ink behind the pen. */
const HEAT_BANDS = 16;
/** How hard the grid bends toward the pen, and the reach of the bend in pixels. */
const WARP_STRENGTH = 30;
const WARP_RADIUS = 130;
/** Seconds the pen takes to circle a station once it lands, and a station's plate to draw and undraw. */
const RING_SECONDS = 1.2;
const STATION_PLATE_SECONDS = 2.6;
const STATION_UNDO_SECONDS = 1;
/** Once its journey is over, the pen circles the final button this many radians a second, a comet's tail behind. */
const ORBIT_SPEED = TAU / 14;
const ORBIT_TAIL = 2.2;
/** How far above a section's eyebrow a route that passes over its title runs. */
const OVER_TITLE = 100;
/** How far under a section a route crosses back to the rail. */
const ROUTE_RETURN = 60;

function pageRect(el: Element, sy: number): Rect {
  const r = el.getBoundingClientRect();
  const top = r.top + sy;
  return {
    left: r.left,
    right: r.right,
    top,
    bottom: top + r.height,
    w: r.width,
    h: r.height,
    cx: r.left + r.width / 2,
    cy: top + r.height / 2,
  };
}

function contentRect(el: Element, sy: number): Rect {
  const r = pageRect(el, sy);
  const cs = getComputedStyle(el);
  r.left += parseFloat(cs.paddingLeft) || 0;
  r.right -= parseFloat(cs.paddingRight) || 0;
  r.w = r.right - r.left;
  r.cx = (r.left + r.right) / 2;
  return r;
}

/** A section's number and name, from its eyebrow ("01 / VIDEO") or its data-hud attribute. */
function sectionLabel(sec: HTMLElement | null | undefined): [string, string] {
  const text = sec?.dataset.hud ?? sec?.querySelector('[data-eyebrow]')?.textContent ?? '';
  const [num = '', name = ''] = text.split(' / ');
  return [num.trim(), name.trim()];
}

/** Right edge of an element's text, which may stop well short of its box. */
function textRight(el: Element | null | undefined): number {
  if (!el) return -Infinity;
  const rg = document.createRange();
  rg.selectNodeContents(el);
  let right = -Infinity;
  for (const q of Array.from(rg.getClientRects())) if (q.width > 1) right = Math.max(right, q.right);
  return right;
}

const debounce = (fn: () => void, ms: number) => {
  let id = 0;
  return () => {
    window.clearTimeout(id);
    id = window.setTimeout(fn, ms);
  };
};

/** A route as the page lays it out: also the line its title is written along, or the stretch that uncovers it. */
type LaidRoute = Route & { lineY?: number; along?: [string, string] };

export function startPlotter(canvas: HTMLCanvasElement, opts: PlotterOptions): () => void {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) return () => {};
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const { reduce, hud } = opts;
  const sprites = sharedSprites();
  const ink = new Ink(ctx, sprites);
  const root = document.documentElement;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let sy = window.scrollY;
  // Reading scrollY forces a layout whenever the page changed since the last one, so frames read it only after a scroll.
  let scrolled = false;
  let maxScroll = 0;
  let mobile = false;
  let intensity = 1;
  const t0 = performance.now();
  let t = 0;
  /** Ambient time: as `t`, but it stands still while the visitor is idle. */
  let at = 0;
  let lastActivity = t0;
  let idle = false;
  let epoch = 0;
  let introDone = reduce;
  let ignited = false;
  let emitAcc = 0;
  let lastMove = 0;
  let path: PlotPath | null = null;
  let kfs: Keyframe[] = [];
  let titles: TitleState[] = [];
  let plates: PlateState[] = [];
  let reveals: RevealState[] = [];
  let railX = 6;
  let origin = { x: 0, y: 0 };
  let heroBottom = 0;
  let stations: Station[] = [];
  /** The station the pen circles by time since `t0`, ignoring the scroll meanwhile. */
  let ring: { name: string; t0: number } | null = null;
  /** After its circle the pen stays at this station's end until the visitor scrolls back above its leap. */
  let ringFloor: string | null = null;
  /** The element under the pointer whose height the pen holds; `s` is cached per layout epoch. */
  let hold: { el: HTMLElement; s: number | null; epoch: number } | null = null;
  /** How far the drawn line reaches; ahead of the pen while it holds. */
  let inkS = 0;
  /** Where a route that runs on into the next section left off, while routes are laid out. */
  let carry: Point | null = null;
  /** The final button, pulsed once when the pen has finished its journey. */
  let ctaEl: HTMLElement | null = null;
  let ctaDone = false;
  /** The ellipse round the final button, and the angle the pen has reached circling it, once it is there. */
  let ell: ReturnType<typeof ctaEllipse> | null = null;
  let orbit: { from: number; angle: number } | null = null;
  const flashes: Flash[] = [];
  const anchors = new Map<string, Rect>();
  const sparks: Spark[] = [];
  const pen = { s: 0, x: 0, y: 0, px: 0, py: 0, v: 0, kind: UP as SegmentKind };
  let dirty = true;
  let lastSy = -1;
  let lastSlide = -1;
  let lastHover = false;
  /** How green the pen is, easing with the pointer on the final button. */
  let tint = 0;
  const green = greenSprites();
  let lastRender = 0;
  /** A plate asked for the next frame while it eases toward a target. */
  let easing = false;
  let hudAt = 0;
  let hudText = '';
  let raf = 0;
  let alive = true;

  // ---------- layout: everything the plotter reads from the page, in page coordinates

  /**
   * The canvas's own CSS box. On a phone or tablet it is taller than the root's client height, which stays at
   * the size with the URL bar shown. Before the stylesheet applies, the window stands in.
   */
  function canvasBox(): [number, number] {
    if (getComputedStyle(canvas).position !== 'fixed') return [window.innerWidth, window.innerHeight];
    const r = canvas.getBoundingClientRect();
    return [r.width || window.innerWidth, r.height || window.innerHeight];
  }

  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

  function layout() {
    sy = window.scrollY;
    [W, H] = canvasBox();
    mobile = W < 760;
    dpr = pixelRatio();
    intensity = mobile ? 0.75 : 1;
    // H is the viewport with the URL bar hidden, as it always is once the visitor has scrolled to the bottom.
    maxScroll = Math.max(0, root.scrollHeight - H);
    epoch++;
    measureAnchors();

    const old = new Map(titles.map((s) => [s.el, s]));
    titles = Array.from(document.querySelectorAll<HTMLElement>('[data-pen]')).flatMap((el) => {
      const inkEl = el.querySelector<HTMLElement>('.plot-ink');
      if (!inkEl) return [];
      const rg = document.createRange();
      rg.selectNodeContents(inkEl);
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const q of Array.from(rg.getClientRects())) {
        if (q.width < 2 || q.height < 2) continue;
        left = Math.min(left, q.left);
        right = Math.max(right, q.right);
        top = Math.min(top, q.top);
        bottom = Math.max(bottom, q.bottom);
      }
      if (!isFinite(left)) return [];
      const ib = inkEl.getBoundingClientRect();
      const prev = old.get(el);
      return [
        {
          el,
          ink: inkEl,
          section: el.closest('section'),
          run: null,
          left,
          right,
          top: top + sy,
          bottom: bottom + sy,
          blockLeft: ib.left,
          blockW: ib.width,
          rv: prev?.rv ?? -1,
          edge: prev?.edge ?? -1,
        },
      ];
    });

    const later = titles.slice(1).map((s) => s.left);
    railX = Math.max(6, (later.length ? Math.min(...later) : 40) - (W >= 900 ? 34 : 10));
    const stage = anchors.get('hero-stage');
    origin = stage ? { x: stage.cx, y: stage.top + stage.h * HERO_ORIGIN_Y } : { x: W / 2, y: H * 0.7 };
    heroBottom = stage ? stage.bottom : 0;
    const cta = anchors.get('cta-button');
    // Stations: points the pen leaps into after their section's title, such as the pie menu's centre.
    const detours: Detour[] = Array.from(document.querySelectorAll<HTMLElement>('[data-plot-station]')).flatMap(
      (el) => {
        const sec = el.closest('section');
        const title = titles.findIndex((s) => s.section === sec);
        const r = pageRect(el, sy);
        const name = el.dataset.plotStation ?? '';
        const radius = Number(el.dataset.plotRadius) || 120;
        // A stacked layout puts a whole column between the title and the point; there it leaps from the rail.
        const fromTitle = el.dataset.plotLeap === 'title' && railX > 34;
        return title < 0 || !name ? [] : [{ title, name, cx: r.cx, cy: r.cy, r: radius, fromTitle }];
      },
    );
    // Routes need the margin the section numbers use; narrow layouts keep the plain rail.
    carry = null;
    const routes: LaidRoute[] =
      railX > 34
        ? titles.flatMap((s, i) => {
            const route = s.section?.dataset.plotRoute ? routeFor(s, i) : null;
            carry = route?.continues ? (route.pts[route.pts.length - 1] ?? null) : null;
            return route ? [route] : [];
          })
        : [];
    const lines = new Map(routes.map((r) => [r.title, r.lineY]));
    const alongs = new Map(routes.map((r) => [r.title, r.along]));
    path = buildPath({
      titles: titles.map((s, i) => ({
        left: s.left,
        right: s.right,
        top: s.top,
        bottom: s.bottom,
        lineY: lines.get(i),
        along: alongs.get(i),
      })),
      railX,
      origin,
      cta: cta ? { cx: cta.cx, cy: cta.cy, w: cta.w, h: cta.h } : null,
      detours,
      routes,
    });
    stations = path.stations;
    titles.forEach((s, i) => (s.run = path?.runs[i] ?? null));
    // A pixel short of the bottom, which a browser scrolling in fractions may never quite reach.
    kfs = scrollKeyframes(path, H, Math.max(0, maxScroll - 1));

    ctaEl = document.querySelector<HTMLElement>('[data-plot-anchor="cta-button"]');
    ell = cta ? ctaEllipse({ cx: cta.cx, cy: cta.cy, w: cta.w, h: cta.h }) : null;
    const key = (el: HTMLElement, name: string) => `${el.id}|${name}`;
    const oldPlates = new Map(plates.map((p) => [key(p.el, p.name), p.p]));
    // A section may name several plates, separated by spaces.
    plates = Array.from(document.querySelectorAll<HTMLElement>('[data-plate]')).flatMap((sec) =>
      (sec.dataset.plate ?? '').split(' ').flatMap((name) => {
        const plate = PLATES[name];
        if (!plate) return [];
        const section = pageRect(sec, sy);
        const titleEl = sec.querySelector('[data-pen]');
        const trigger = (plate.at ? anchors.get(plate.at)?.top : undefined) ?? section.top;
        return [
          {
            el: sec,
            name,
            plate,
            section,
            content: contentRect(sec, sy),
            title: titleEl ? pageRect(titleEl, sy) : null,
            trigger,
            p: reduce ? 1 : (oldPlates.get(key(sec, name)) ?? 0),
          },
        ];
      }),
    );

    reveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-in])')).map((el) => {
      const sec = el.closest('section');
      return {
        el,
        kind: el.dataset.reveal ?? '',
        title: titles.find((s) => s.section === sec) ?? null,
        at: el.dataset.revealAt ?? null,
        top: el.getBoundingClientRect().top + sy,
      };
    });

    if (introDone && path) {
      // A pen holding at a hovered element stays there; a question opening below must not move it.
      const free = scrollTarget();
      pen.s = holdS() ?? free;
      const q = posAt(path, pen.s);
      pen.x = pen.px = q.x;
      pen.y = pen.py = q.y;
      inkS = Math.max(pen.s, hold ? free : pen.s);
    }
    // Resized only after every measurement, so the page is laid out once. Setting the size clears the bitmap.
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    dirty = true;
  }

  /**
   * A section's route. `right` passes the section down the right margin. `camera` writes the title from a
   * line above it, drops onto the video camera's eye, follows its ray out to the right margin and goes down
   * there. `split` drops from the underline to just above the right column, turns left and runs down between
   * the two columns. `chart` runs down the rail ahead of the scroll, draws the learning curve and comes back
   * round its right side. `touch` taps the point its plate starts from. `tiles` comes down the right margin,
   * turns left over the last tile and runs on between the last two into the next section, which takes it
   * over (`net`, then `right`) without writing its title along an underline. The rest cross back to the rail
   * under the section.
   */
  function routeFor(s: TitleState, i: number): LaidRoute | null {
    const sec = s.section;
    if (!sec) return null;
    const box = pageRect(sec, sy);
    const end = underlineEnd(s);
    const next = titles[i + 1];
    const back = box.bottom + Math.min(ROUTE_RETURN, next ? (next.top - box.bottom) * 0.35 : ROUTE_RETURN);
    const content = contentRect(sec, sy);
    // The left rail mirrored about the content column.
    const right = content.right + (content.left - railX);
    if (right > W - 6) return null;
    const kind = sec.dataset.plotRoute;
    const from = carry;
    if (kind === 'net' && from) {
      const dock = sec.querySelector('[data-plot-anchor="try-dock"]');
      if (!dock) return null;
      const d = pageRect(dock, sy);
      const mid = (s.top + s.bottom) / 2;
      // Out from under the playground in the middle, clear of the next title's words.
      const cx = Math.max(W / 2, (next?.right ?? 0) + 48);
      return {
        title: i,
        continues: true,
        // The title is uncovered as the pen comes down beside it, whole by the time it flashes.
        along: ['try-0', 'net'],
        pts: [
          { x: from.x, y: s.top - 60, r: 0, key: null, mark: 'try-0' },
          // Flashes while the section's top is still in the middle of the screen.
          { x: from.x, y: mid, r: 0, key: 0.5 + (mid - box.top) / H, mark: 'net' },
          // Gone into the network, then out of sight behind the playground, until it comes out underneath.
          { x: from.x, y: d.top + 60, ghost: true },
          { x: cx, y: d.top + 200, ghost: true },
          { x: cx, y: d.bottom + 24, key: 0.55, ghost: true },
        ],
      };
    }
    if (kind === 'right' && from)
      return {
        title: i,
        along: ['keys-0', 'keys-1'],
        pts: [
          { x: from.x, y: s.top, r: 0, key: null, mark: 'keys-0' },
          { x: from.x, y: end.y, mark: 'keys-1' },
          { x: right, y: end.y },
          { x: right, y: back },
        ],
      };
    if (kind === 'tiles') {
      const row = sec.querySelector('[data-plot-tiles]');
      const tiles = row ? Array.from(row.children).map((c) => pageRect(c, sy)) : [];
      const a = tiles[tiles.length - 2];
      const b = tiles[tiles.length - 1];
      // Only while the tiles sit in one row.
      if (row && a && b && Math.abs(a.top - b.top) < 2 && b.left > a.right) {
        const above = row.previousElementSibling;
        const y = above ? (pageRect(above, sy).bottom + b.top) / 2 : b.top - 12;
        return {
          title: i,
          continues: true,
          pts: [
            { x: right, y: end.y },
            { x: right, y },
            { x: (a.right + b.left) / 2, y },
          ],
        };
      }
      return {
        title: i,
        pts: [
          { x: right, y: end.y },
          { x: right, y: back },
        ],
      };
    }
    if (kind === 'touch') {
      const spot = sec.querySelector('[data-plot-anchor="ruler-space"]');
      if (!spot) return null;
      const [ox, oy] = rulerOrigin(pageRect(spot, sy));
      const keys = spot.previousElementSibling;
      const panel = spot.nextElementSibling;
      const mods = panel?.nextElementSibling;
      const cols = mods ? Array.from(mods.children).map((c) => pageRect(c, sy)) : [];
      // Taps the ruler's zero while the keys above it are still a third of the screen from the bottom.
      const ky = keys ? pageRect(keys, sy).cy : oy;
      const tap: RoutePoint[] = [
        { x: railX, y: oy },
        { x: ox, y: oy, r: 0, key: 0.66 + (oy - ky) / H, mark: 'ruler' },
      ];
      const [m0, m1] = cols;
      if (!panel || !m0 || !m1 || Math.abs(m0.top - m1.top) > 2 || m1.left < m0.right)
        return { title: i, fromRail: true, pts: tap };
      // Then along the ruler, down past the panel's right side, under it and down between the two columns.
      const p = pageRect(panel, sy);
      const x = p.right + 28;
      const y = (p.bottom + m0.top) / 2;
      const gap = (m0.right + m1.left) / 2;
      return {
        title: i,
        fromRail: true,
        pts: [...tap, { x, y: oy }, { x, y }, { x: gap, y }, { x: gap, y: back }],
      };
    }
    if (kind === 'camera') {
      const player = sec.querySelector('[data-plot-anchor="video-player"]');
      const eyebrow = sec.querySelector('[data-eyebrow]');
      const v = player ? pageRect(player, sy) : null;
      const eye = v ? frustumEye(v, pageRect(s.el, sy), W) : null;
      if (v && eye && eyebrow && v.right > eye[0]) {
        const [ex, ey] = eye;
        // Out along the ray to the player's top right corner, as far as the margin.
        const yd = ey + ((v.top - ey) * (right - ex)) / (v.right - ex);
        return {
          title: i,
          lineY: pageRect(eyebrow, sy).top - OVER_TITLE,
          pts: [
            { x: ex, y: pageRect(eyebrow, sy).top - OVER_TITLE },
            // Reached while the section is only halfway up the screen, so a quick scroll still sees it set off.
            { x: ex, y: ey, r: 0, key: 0.65, mark: 'camera' },
            { x: right, y: yd },
            { x: right, y: back },
          ],
        };
      }
    }
    if (kind === 'right' || kind === 'camera')
      return {
        title: i,
        pts: [
          { x: right, y: end.y },
          { x: right, y: back },
        ],
      };
    if (kind === 'chart') {
      const plot = sec.querySelector('[data-plot-anchor="tutorial-plot"]');
      if (!plot) return null;
      const { pts } = curveGeometry(pageRect(plot, sy));
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (!first || !last) return null;
      return {
        title: i,
        fromRail: true,
        startMark: 'chart-in',
        pts: [
          // Down the rail ahead of the scroll, to reach the curve's start as it comes into view.
          { x: railX, y: first[1], key: 0.88, gap: 160 },
          { x: first[0], y: first[1], r: 0, key: null, mark: 'chart-0' },
          ...pts.slice(1, -1).map(([x, y]) => ({ x, y, r: 0, key: null })),
          { x: last[0], y: last[1], r: 0, key: 0.2, mark: 'chart-1' },
          { x: right, y: last[1], mark: 'chart-out' },
          { x: right, y: back },
        ],
      };
    }
    if (kind === 'middle') {
      const row = sec.querySelector('[data-plot-gap]');
      const a = row?.children[0];
      const b = row?.children[1];
      if (!a || !b) return null;
      const l = pageRect(a, sy);
      const r = pageRect(b, sy);
      if (r.left < l.right || Math.abs(l.top - r.top) > 2) return null;
      // Halfway across, down between the tiles and the columns under them.
      const x = (l.right + r.left) / 2;
      return {
        title: i,
        pts: [
          { x, y: end.y },
          { x, y: back },
        ],
      };
    }
    if (kind === 'split') {
      const a = sec.querySelector('[data-plot-col="left"]');
      const b = sec.querySelector('[data-plot-col="right"]');
      if (!a || !b) return null;
      const l = pageRect(a, sy);
      const r = pageRect(b, sy);
      if (r.left < l.right + 8) return null;
      // Down past the lead's last word, then left halfway between the columns and what comes before them.
      const lead = textRight(sec.querySelector('p'));
      const x = clamp(Math.max(end.x, lead + 24), r.left + 40, r.right - 40);
      const before = a.parentElement?.previousElementSibling;
      const top = before ? (pageRect(before, sy).bottom + Math.min(l.top, r.top)) / 2 : r.top - 12;
      const gap = (l.right + r.left) / 2;
      return {
        title: i,
        pts: [
          { x, y: end.y },
          { x, y: top },
          { x: gap, y: top },
          { x: gap, y: back },
        ],
      };
    }
    return null;
  }

  function measureAnchors() {
    anchors.clear();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-plot-anchor]'))) {
      const name = el.dataset.plotAnchor;
      if (name) anchors.set(name, pageRect(el, sy));
    }
  }

  const scrollTarget = () => (path ? sAtB(path, bAtScroll(kfs, sy)) : 0);

  // ---------- per-frame state

  function updatePen(dt: number) {
    if (!path || reduce) return;
    let target: number;
    let follow = introDone;
    if (!introDone) {
      target = introS(path, t);
      if (t >= INTRO_END) introDone = true;
    } else {
      target = penTarget();
      // The circle is already paced by time, so the pen takes it as given.
      if (ring) follow = false;
    }
    const prev = pen.s;
    const diff = target - prev;
    pen.s = follow ? prev + diff * (1 - Math.exp(-dt * (6 + Math.min(24, Math.abs(diff) / 250)))) : target;
    pen.v = (pen.s - prev) / Math.max(dt, 1e-3);
    const q = posAt(path, pen.s);
    pen.px = pen.x;
    pen.py = pen.y;
    pen.x = q.x;
    pen.y = q.y;
    pen.kind = q.kind;
    if (Math.abs(pen.s - prev) > 0.05) lastMove = t;

    if (!ignited && t > 0.28) {
      ignited = true;
      emit(origin.x, origin.y, 46, 330, -Math.PI / 2, TAU, 40);
    }
    // Landing in a station going forward ignites it: a burst of sparks and a spreading ring of light. From
    // then on its plate draws by time, and the pen circles it by time while it is on screen.
    for (const st of stations) {
      if (prev < st.s0 && pen.s >= st.s0) {
        const p = posAt(path, st.s0);
        emit(p.x, p.y, 70, 420, 0, TAU, 30);
        flashes.push({ x: p.x, y: p.y, t, size: 260 });
        if (onScreenY(st.cy)) ring = { name: st.name, t0: t };
      }
    }
    // Touching a plate's named point sets the plate off with a smaller burst.
    for (const ps of plates) {
      const at = ps.plate.station ? path.marks.get(ps.plate.station) : undefined;
      if (at === undefined || prev >= at || pen.s < at) continue;
      const p = posAt(path, at);
      emit(p.x, p.y, 40, 300, 0, TAU, 20);
      flashes.push({ x: p.x, y: p.y, t, size: 150 });
    }
    // At the end of its journey the pen keeps going round the button, slowly, on ambient time.
    if (ell && introDone && pen.s >= path.total - 8) {
      orbit ??= { from: at, angle: 0 };
      orbit.angle = ell.a0 + ell.sweep + ORBIT_SPEED * (at - orbit.from);
      pen.x = ell.cx + Math.cos(orbit.angle) * ell.rx;
      pen.y = ell.cy + Math.sin(orbit.angle) * ell.ry;
      pen.kind = FINALE;
      lastMove = t;
    } else orbit = null;
    if (pen.kind !== UP && pen.kind !== GHOST && t - lastMove < 1.5) {
      const speed = Math.abs(pen.v);
      const extra = pen.kind === WRITE ? 26 : pen.kind === JUMP ? 110 : 4;
      emitAcc += (Math.min(140, speed * 0.08) + extra) * dt;
      const n = emitAcc | 0;
      if (n) {
        emitAcc -= n;
        const dir = Math.atan2(pen.y - pen.py, pen.x - pen.px);
        emit(pen.x, pen.y, n, 120 + Math.min(speed, 2000) * 0.12, dir + Math.PI, 2.3, 70);
      }
    }
  }

  const onScreenY = (y: number) => y - sy > 0 && y - sy < H;

  /** Where the pen heads: along the scroll, unless it circles a station or holds at a hovered element. */
  function penTarget(): number {
    if (!path) return 0;
    let target = scrollTarget();
    if (ring) {
      const name = ring.name;
      const st = stations.find((x) => x.name === name);
      const q = clamp((t - ring.t0) / RING_SECONDS);
      if (st && q < 1 && onScreenY(st.cy)) return st.s0 + (st.s1 - st.s0) * easeInOut(q);
      ring = null;
      ringFloor = st ? name : null;
    }
    if (ringFloor) {
      const st = stations.find((x) => x.name === ringFloor);
      if (!st || target < st.sJump) ringFloor = null;
      else target = Math.max(target, st.s1);
    }
    return holdS() ?? target;
  }

  /** Arc length on the rail level with the hovered element's first row, within its section's stretch. */
  function holdS(): number | null {
    if (!hold || !path) return null;
    if (hold.epoch !== epoch) {
      hold.epoch = epoch;
      hold.s = null;
      const sec = hold.el.closest('section');
      const k = titles.findIndex((s) => s.section === sec);
      const run = titles[k]?.run;
      if (run) {
        const r = (hold.el.querySelector(':scope > summary') ?? hold.el).getBoundingClientRect();
        const end = titles[k + 1]?.run?.i0 ?? path.n - 1;
        hold.s = sAtY(path, r.top + sy + r.height / 2, run.i1, end);
      }
    }
    return hold.s;
  }

  // Titles keep the furthest reveal they reached, so text never disappears again.
  function updateTitles() {
    for (const s of titles) {
      const run = s.run;
      if (!run) continue;
      const p = clamp((pen.s - run.s0) / (run.s1 - run.s0 || 1));
      const maxP = Math.max(Number(s.el.dataset.penP ?? 0), p);
      if (maxP > Number(s.el.dataset.penP ?? 0)) s.el.dataset.penP = maxP >= 1 ? '1' : maxP.toFixed(3);
      const rv = maxP >= 1 ? s.blockW + 60 : Math.max(0, run.sx + maxP * (run.ex - run.sx) - s.blockLeft);
      if (Math.abs(rv - s.rv) > 0.4) {
        s.el.style.setProperty('--rv', `${rv.toFixed(1)}px`);
        s.rv = rv;
      }
      const edge = maxP > 0.002 && maxP < 0.995 ? 1 : 0;
      if (edge !== s.edge) {
        s.el.style.setProperty('--edge', String(edge));
        s.edge = edge;
      }
    }
  }

  const titleP = (s: TitleState | null) => (s ? Number(s.el.dataset.penP ?? 0) : 1);

  function reveal(el: HTMLElement, delay: number) {
    el.style.setProperty('--d', `${delay.toFixed(2)}s`);
    el.setAttribute('data-in', '');
    el.dispatchEvent(new CustomEvent(REVEAL_EVENT));
  }

  function updateReveals() {
    let order = 0;
    let fired = false;
    reveals = reveals.filter((r) => {
      if (r.top - sy > H * 0.9) return true;
      if (titleP(r.title) < (r.kind === 'type' ? 0.01 : 0.55)) return true;
      if (r.at) {
        const st = stations.find((x) => x.name === r.at);
        if (st && pen.s < st.s0) return true;
      }
      reveal(r.el, order++ * 0.09);
      fired = true;
      return false;
    });
    // Revealed elements may have moved while hidden; measure again once they settle.
    if (fired) remeasureSoon();
  }

  // Keyboard focus never lands on something still hidden: whatever it enters shows at once.
  const onFocus = (e: FocusEvent) => {
    const host = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-reveal]:not([data-in])') : null;
    if (!host) return;
    reveal(host, 0);
    reveals = reveals.filter((r) => r.el !== host);
  };
  // Pressing the final button sprays sparks from its edge that fall away down the page.
  const onPress = (e: PointerEvent) => {
    const el = e.target instanceof Element ? e.target.closest('[data-plot-anchor="cta-button"]') : null;
    if (!el) return;
    const r = pageRect(el, sy);
    for (let i = 0; i < 110; i++) {
      if (sparks.length > MAX_SPARKS) sparks.shift();
      // From a point on the button's outline, mostly up and out, a few straight sideways.
      const u = Math.random();
      const x = r.left + u * r.w;
      const y = r.top + Math.random() * r.h * 0.4;
      const a = -Math.PI / 2 + (u - 0.5) * 2.2 + (Math.random() - 0.5) * 0.6;
      const v = 260 + Math.random() * 520;
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 1.1 + Math.random() * 0.9,
        age: 0,
        g: 1100,
      });
    }
    dirty = true;
  };
  // The pen follows the mouse over elements marked to hold it, such as the FAQ's questions.
  const onPointerOver = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-plot-hold]') : null;
    if (el !== (hold?.el ?? null)) hold = el ? { el, s: null, epoch: -1 } : null;
  };
  const onPointerLeave = () => (hold = null);
  const remeasureSoon = debounce(() => {
    measureAnchors();
    for (const p of plates) if (p.plate.at) p.trigger = anchors.get(p.plate.at)?.top ?? p.trigger;
    dirty = true;
  }, 1100);

  function emit(x: number, y: number, n: number, spd: number, ang: number, spread: number, up: number) {
    for (let i = 0; i < n; i++) {
      if (sparks.length > MAX_SPARKS) sparks.shift();
      const a = ang + (Math.random() - 0.5) * spread;
      const v = spd * (0.3 + Math.random() * 0.9);
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - up * Math.random(),
        life: 0.3 + Math.random() * 0.6,
        age: 0,
        g: 520,
      });
    }
  }

  function stepSparks(dt: number) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        sparks.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  const visible = (r: Rect) => r.top - sy < H + 240 && r.bottom - sy > -420;
  const onScreen = (r: Rect) => r.top - sy < H && r.bottom - sy > 0;

  /** A plate's progress from where the pen is between named route points, or null if any is missing. */
  function trackP(track: [string, number][] | undefined): number | null {
    if (!track || !path) return null;
    let prev: [number, number] | null = null;
    for (const [name, p] of track) {
      const s = path.marks.get(name);
      if (s === undefined) return null;
      if (pen.s <= s) return prev ? prev[1] + (p - prev[1]) * clamp((pen.s - prev[0]) / (s - prev[0] || 1)) : p;
      prev = [s, p];
    }
    return prev ? prev[1] : null;
  }

  function stepPlates(dt: number): boolean {
    let moving = false;
    for (const ps of plates) {
      const hero = ps.plate.intro === true;
      // A station's plate is set off by the pen landing there, a named point's by the pen passing it.
      const st = ps.plate.station ? stations.find((x) => x.name === ps.plate.station) : undefined;
      const mark = st?.s0 ?? (ps.plate.station ? path?.marks.get(ps.plate.station) : undefined);
      const tracked = trackP(ps.plate.track);
      let next: number;
      if (reduce) next = 1;
      else if (tracked !== null) next = tracked;
      else if (mark !== undefined) {
        // Draws by time once the pen is past its point, and undraws by time when the pen goes back.
        const on = pen.s >= mark;
        const step = dt / (on ? (ps.plate.seconds ?? STATION_PLATE_SECONDS) : STATION_UNDO_SECONDS);
        next = on ? Math.min(1, ps.p + step) : Math.max(0, ps.p - step);
      } else {
        const target = hero
          ? clamp(t / HERO_PLATE_SECONDS)
          : clamp((sy + H * 0.9 - ps.trigger) / (H * (ps.plate.span ?? 0.62)));
        next = ps.p + (target - ps.p) * (1 - Math.exp(-dt * (hero ? 60 : 5)));
      }
      if (Math.abs(next - ps.p) > 0.0005 && visible(ps.section)) moving = true;
      ps.p = next;
    }
    return moving;
  }

  // ---------- drawing

  function drawGrid() {
    const cell = mobile ? 34 : 44;
    const par = sy * 0.3;
    const base = Math.floor(par / cell);
    const y0 = -(par - base * cell);
    const px = pen.x;
    const py = pen.y - sy;
    const sig = WARP_RADIUS;
    const str = reduce || pen.kind === GHOST ? 0 : WARP_STRENGTH;
    const reach = sig * 3;
    const penNear = str > 0 && py > -reach && py < H + reach;
    // Straight stretches are filled as rects, far cheaper to raster than strokes; only the stretch near the pen
    // bends, sampled every ~8px into one polyline. Index 0 is minor, 1 major.
    const rects = [new Path2D(), new Path2D()];
    const bent = [new Path2D(), new Path2D()];
    const pt = [0, 0];
    // Lines bend toward the pen like a gravity well.
    const warp = (x: number, y: number) => {
      const dx = x - px;
      const dy = y - py;
      const r2 = dx * dx + dy * dy;
      if (r2 < reach * reach) {
        const k = (str * Math.exp(-r2 / (2 * sig * sig))) / (Math.sqrt(r2) + sig * 0.5);
        x -= dx * k;
        y -= dy * k;
      }
      pt[0] = x;
      pt[1] = y;
    };
    // One grid line at `c` (x of a vertical line, y of a horizontal one).
    const line = (set: number, vertical: boolean, c: number, len: number) => {
      const fill = (a0: number, a1: number) => {
        if (a1 <= a0) return;
        if (vertical) rects[set].rect(c - 0.5, a0, 1, a1 - a0);
        else rects[set].rect(a0, c - 0.5, a1 - a0, 1);
      };
      const n = Math.max(2, Math.ceil(len / 8));
      const step = len / n;
      const along = vertical ? py : px;
      const i0 = Math.max(0, Math.floor((along - reach) / step));
      const i1 = Math.min(n, Math.ceil((along + reach) / step));
      if (!penNear || Math.abs(c - (vertical ? px : py)) >= reach || i1 <= i0) {
        fill(0, len);
        return;
      }
      const at = (i: number) => (vertical ? warp(c, i * step) : warp(i * step, c));
      fill(0, i0 * step);
      at(i0);
      bent[set].moveTo(pt[0], pt[1]);
      for (let i = i0 + 1; i <= i1; i++) {
        at(i);
        bent[set].lineTo(pt[0], pt[1]);
      }
      fill(i1 * step, len);
    };
    for (let x = ((W / 2) % cell) - cell + 0.5; x < W + cell; x += cell)
      line(Math.round((x - W / 2) / cell) % 4 === 0 ? 1 : 0, true, x, H);
    for (let k = -1; ; k++) {
      const y = Math.round(y0 + k * cell) + 0.5;
      if (y > H + cell) break;
      line((base + k) % 4 === 0 ? 1 : 0, false, y, W);
    }
    const alpha = [0.034 * intensity, 0.062 * intensity];
    ctx.lineWidth = 1;
    for (let set = 0; set < 2; set++) {
      const col = rgba(NEUTRAL, alpha[set]);
      ctx.fillStyle = col;
      ctx.fill(rects[set]);
      ctx.strokeStyle = col;
      ctx.stroke(bent[set]);
    }

    // No grid over the hero, where it would fight the scene's own floor; it fades in below.
    const fadeTop = heroBottom - sy;
    if (fadeTop > -260) {
      const g = ctx.createLinearGradient(0, fadeTop, 0, fadeTop + 260);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      if (fadeTop > 0) ctx.fillRect(0, 0, W, fadeTop);
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.max(0, fadeTop), W, 260);
      ctx.restore();
    }
  }

  function drawTrail() {
    if (reduce || !path || path.n < 2) return;
    const c = ctx;
    const { x: X, y: Y, s: S, kind: K, maxY } = path;
    const top = sy - 60;
    const bot = sy + H + 60;
    // The line reaches `e`; the pen, and the hot ink behind it, may be further back while it holds.
    const e = posAt(path, inkS);
    const ie = e.i;
    const p = posAt(path, pen.s);
    const ip = p.i;
    let lo = 0;
    let hi = path.n - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (maxY[m] < top) lo = m + 1;
      else hi = m;
    }
    const down = new Path2D();
    const run = new Path2D();
    const ticks = new Path2D();
    let last = -1;
    for (let i = Math.max(1, lo); i < ie; i++) {
      if ((Y[i] > bot && Y[i - 1] > bot) || K[i] === UP || K[i] === JUMP || K[i] === GHOST) {
        last = -1;
        continue;
      }
      const k = K[i];
      const pa = k === WRITE ? run : down;
      if (k !== last) pa.moveTo(X[i - 1], Y[i - 1] - sy);
      pa.lineTo(X[i], Y[i] - sy);
      last = k;
      // Ruler ticks on the rail, a long one every fifth; routes have none.
      if (k === 0 && X[i] === railX && X[i - 1] === railX && Math.floor(S[i] / 30) !== Math.floor(S[i - 1] / 30)) {
        const len = Math.floor(S[i] / 30) % 5 === 0 ? 9 : 4;
        ticks.moveTo(X[i] - 3 - len, Y[i] - sy);
        ticks.lineTo(X[i] - 3, Y[i] - sy);
      }
    }
    if (K[ie] !== UP && K[ie] !== JUMP && K[ie] !== GHOST) {
      const pa = K[ie] === WRITE ? run : down;
      if (K[ie] !== last) pa.moveTo(X[ie - 1], Y[ie - 1] - sy);
      pa.lineTo(e.x, e.y - sy);
    }
    c.lineWidth = 1;
    c.strokeStyle = rgba(NEUTRAL, 0.18 * intensity);
    c.stroke(down);
    c.strokeStyle = rgba(NEUTRAL, 0.3 * intensity);
    c.stroke(run);
    c.strokeStyle = rgba(NEUTRAL, 0.14 * intensity);
    c.stroke(ticks);

    // Section numbers at each branch, once the pen has passed them.
    if (railX > 34) {
      c.font = MONO_S;
      c.textAlign = 'right';
      c.fillStyle = rgba(NEUTRAL, 0.4 * intensity);
      for (const s of titles.slice(1)) {
        const r = s.run;
        if (!r || inkS < r.s0) continue;
        const y = r.uy - sy;
        if (y < -20 || y > H + 20) continue;
        const [num] = sectionLabel(s.section);
        if (num) c.fillText(num, railX - 9, y - 6);
      }
    }

    // Fresh ink near the pen is hot and cools to grey, stroked in heat bands to keep stroke calls few; a pen-up
    // move leaves only a short dotted wake, amber where the pen leapt.
    const hot = Array.from({ length: HEAT_BANDS }, () => new Path2D());
    let open = -1;
    let x2 = p.x;
    let y2 = p.y;
    // Circling the button, the hot ink is a tail along the ellipse behind the pen.
    if (orbit && ell) {
      const n = 64;
      let px = pen.x;
      let py = pen.y - sy;
      for (let k = 1; k <= n; k++) {
        const a = orbit.angle - (ORBIT_TAIL * k) / n;
        const x = ell.cx + Math.cos(a) * ell.rx;
        const y = ell.cy + Math.sin(a) * ell.ry - sy;
        const band = Math.min(HEAT_BANDS - 1, ((1 - k / n) * HEAT_BANDS) | 0);
        hot[band].moveTo(px, py);
        hot[band].lineTo(x, y);
        px = x;
        py = y;
      }
    }
    for (let i = orbit ? 0 : ip; i >= 1; i--) {
      const d = pen.s - S[i - 1];
      if (d - (S[i] - S[i - 1]) > UP_WAKE) break;
      const x1 = X[i - 1];
      const y1 = Y[i - 1];
      if (K[i] === GHOST) open = -1;
      else if (K[i] === UP || K[i] === JUMP) {
        open = -1;
        const leap = K[i] === JUMP;
        if (Math.floor(S[i] / 7) !== Math.floor(S[i - 1] / 7))
          ink.dot(
            x1,
            y1 - sy,
            leap ? 1.2 : 0.9,
            leap ? AMBER : NEUTRAL,
            (leap ? 0.7 : 0.4) * clamp(1 - d / UP_WAKE) * intensity,
          );
      } else if (d < HOT_INK) {
        const band = Math.min(HEAT_BANDS - 1, (clamp(1 - d / HOT_INK) * HEAT_BANDS) | 0);
        if (band !== open) hot[band].moveTo(x2, y2 - sy);
        hot[band].lineTo(x1, y1 - sy);
        open = band;
      } else open = -1;
      x2 = x1;
      y2 = y1;
    }
    for (let band = 0; band < HEAT_BANDS; band++) {
      const h = (band + 0.5) / HEAT_BANDS;
      c.globalCompositeOperation = 'lighter';
      c.lineWidth = 4;
      c.strokeStyle = rgba(mix(AMBER, LIME, tint), 0.1 * h * intensity);
      c.stroke(hot[band]);
      c.globalCompositeOperation = 'source-over';
      c.lineWidth = 1 + h * 0.5;
      c.strokeStyle = rgba(
        mix(NEUTRAL, mix(h > 0.8 ? HOT : AMBER, h > 0.8 ? LIME_HOT : LIME, tint), Math.pow(h, 0.7)),
        (0.2 + 0.75 * h) * Math.min(1.2, intensity),
      );
      c.stroke(hot[band]);
    }
  }

  function drawSparks() {
    if (!sparks.length) return;
    const c = ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineWidth = 1;
    for (const p of sparks) {
      const k = 1 - p.age / p.life;
      const y = p.y - sy;
      if (y < -40 || y > H + 40) continue;
      c.strokeStyle = rgba(mix(mix(AMBER, LIME, tint), mix(HOT, LIME_HOT, tint), k * k), k * 0.9);
      c.beginPath();
      c.moveTo(p.x, y);
      c.lineTo(p.x - p.vx * 0.025, y - p.vy * 0.025);
      c.stroke();
    }
    c.restore();
  }

  function drawPen() {
    if (reduce || !path) return;
    const c = ctx;
    const x = pen.x;
    const y = pen.y - sy;
    if ((y < -150 || y > H + 150) && !flashes.length) return;
    const up = pen.kind === UP ? 0.5 : 1;
    const flick = 0.84 + 0.16 * Math.sin(t * 41) * Math.sin(t * 17.3);
    c.save();
    c.globalCompositeOperation = 'lighter';
    if (t > 0.28 && t < 1.1) {
      const q = (t - 0.28) / 0.82;
      c.strokeStyle = rgba(AMBER, (1 - q) * 0.6);
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(origin.x, origin.y - sy, easeOut(q) * 170, 0, TAU);
      c.stroke();
    }
    for (const fl of flashes) {
      const q = (t - fl.t) / 0.9;
      if (q < 0 || q > 1) continue;
      c.strokeStyle = rgba(AMBER, (1 - q) * 0.7);
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(fl.x, fl.y - sy, easeOut(q) * fl.size, 0, TAU);
      c.stroke();
      ink.sprite(sprites.glowL, fl.x, fl.y - sy, 320 * (1 - q * 0.5), 0.5 * (1 - q));
    }
    // Gone into a drawing, the pen shows nothing of itself.
    if (pen.kind !== GHOST) {
      // Orange fading into green while the final button is pointed at.
      for (const [set, k] of [
        [sprites, 1 - tint],
        [green, tint],
      ] as const) {
        if (k <= 0.001) continue;
        ink.sprite(set.glowL, x, y, 230, 0.3 * up * flick * k);
        ink.sprite(set.glowS, x, y, 36 * flick, 0.95 * up * k);
        c.globalAlpha = 0.24 * up * flick * k;
        c.drawImage(set.streak, x - 130, y - 1.5, 260, 3);
      }
      c.globalAlpha = 1;
    }
    c.restore();
    if (pen.kind !== GHOST) ink.dot(x, y, 1.8, WHITE, 0.95 * up);
  }

  function plateCtx(ps: PlateState): PlateCtx {
    return {
      ink,
      ctx: ctx,
      sy,
      t: at,
      dpr,
      epoch,
      W,
      H,
      mobile,
      reduce,
      section: ps.section,
      content: ps.content,
      title: ps.title,
      anchor: (name) => anchors.get(name) ?? null,
      markAt: (name) => {
        const s = path?.marks.get(name);
        return path && s !== undefined ? posAt(path, s) : null;
      },
      progressAt: (r) => (reduce ? 1 : clamp((sy + H * 0.92 - r.top) / (H * 0.5))),
      scrub: clamp((sy + H * 0.6 - ps.section.top) / Math.max(1, ps.section.h)),
      store: plotStore,
    };
  }

  function render() {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    drawGrid();
    ink.I = intensity;
    easing = false;
    for (const ps of plates) {
      if (!visible(ps.section)) continue;
      ink.p = ps.p;
      c.save();
      if (ps.plate.draw(plateCtx(ps)) === true) easing = true;
      c.restore();
    }
    drawTrail();
    drawSparks();
    drawPen();
  }

  function updateHud(now: number) {
    if (!hud || reduce || now - hudAt < 120 || !path) return;
    hudAt = now;
    let cur: TitleState | undefined = titles[0];
    for (const s of titles) if (s.run && pen.s >= s.run.s0 - 1) cur = s;
    const [num, name] = sectionLabel(cur?.section);
    const state =
      pen.kind === WRITE
        ? 'writing'
        : pen.kind === JUMP
          ? 'leap'
          : pen.kind === RING
            ? 'circling'
            : pen.kind === UP || pen.kind === GHOST
              ? 'pen up'
              : 'pen down';
    const progress = `s ${Math.round(pen.s).toLocaleString('en-US')} px · ${Math.round((pen.s / (path.total || 1)) * 100)} %`;
    const text = `${state}|${num}|${name}|${progress}`;
    if (text === hudText) return;
    hudText = text;
    hud.state.textContent = `Plot · ${state}`;
    hud.section.textContent = `§ ${num || '--'} · ${name}`;
    hud.progress.textContent = progress;
  }

  // ---------- loop: draws only when something on screen changes

  const near = (y: number, m: number) => y - sy > -m && y - sy < H + m;
  const onActivity = () => (lastActivity = performance.now());

  let last = performance.now();
  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t = (now - t0) / 1000;
    if (scrolled) {
      scrolled = false;
      sy = window.scrollY;
    }
    if (sy !== lastSy) lastActivity = now;
    const wasIdle = idle;
    idle = !reduce && now - lastActivity > AMBIENT_IDLE_MS;
    if (idle !== wasIdle) root.toggleAttribute('data-plot-idle', idle);
    if (!idle) at += dt;
    const before = pen.s;
    updatePen(dt);
    inkS = hold ? Math.max(inkS, pen.s) : Math.max(pen.s, Math.min(inkS, scrollTarget()));
    // The final button pulses once as the pen closes its ellipse, and again after the pen has left and come back.
    if (ctaEl && path && !reduce) {
      const done = ctaDone ? pen.s > path.total - 60 : pen.s >= path.total - 8;
      if (done !== ctaDone) ctaEl.toggleAttribute('data-plot-done', (ctaDone = done));
    }
    if (!reduce) {
      updateTitles();
      updateReveals();
    }
    stepSparks(dt);
    const platesMoving = stepPlates(dt);
    while (flashes.length && t - flashes[0].t > 0.9) flashes.shift();
    // Ambient motion redraws at the pace its slowest-needing part asks for, the orbit included.
    let ambientMs = Infinity;
    if (!reduce && !idle) {
      for (const ps of plates)
        if (ps.plate.animated && onScreen(ps.section))
          ambientMs = Math.min(ambientMs, ps.plate.ambientMs ?? AMBIENT_FRAME_MS);
      if (orbit && near(pen.y, 200)) ambientMs = Math.min(ambientMs, AMBIENT_FRAME_MS);
    }
    const slide = plotStore.setup.slide;
    const hover = plotStore.cta.hover;
    const tintWas = tint;
    tint += ((hover ? 1 : 0) - tint) * (1 - Math.exp(-dt * 14));
    if (Math.abs(tint - (hover ? 1 : 0)) < 0.004) tint = hover ? 1 : 0;
    // Motion off screen draws nothing: the pen and its hot ink, sparks and flashes count only near the view.
    const changed =
      dirty ||
      sy !== lastSy ||
      (Math.abs(pen.s - before) > 0.05 && near(pen.y, HOT_INK + 80)) ||
      sparks.some((p) => near(p.y, 40)) ||
      flashes.some((fl) => near(fl.y, fl.size)) ||
      platesMoving ||
      easing ||
      slide !== lastSlide ||
      hover !== lastHover ||
      (tint !== tintWas && near(pen.y, 200)) ||
      !introDone;
    if (changed || now - lastRender >= ambientMs) {
      render();
      dirty = false;
      lastSy = sy;
      lastSlide = slide;
      lastHover = hover;
      lastRender = now;
    }
    updateHud(now);
  }

  function frame(now: number) {
    if (!alive) return;
    tick(now);
    raf = requestAnimationFrame(frame);
  }

  // A URL bar sliding in or out resizes the window on every scroll turn, but not the canvas; that needs no layout.
  const onResize = debounce(() => {
    const [w, h] = canvasBox();
    if (Math.abs(w - W) > 0.5 || Math.abs(h - H) > 0.5 || pixelRatio() !== dpr) layout();
  }, 120);
  // The observer's first call comes after the browser's own layout, so measuring there forces none.
  const relayout = debounce(layout, 150);
  let measured = false;
  const ro = new ResizeObserver(() => {
    if (measured) relayout();
    else {
      measured = true;
      layout();
    }
  });
  ro.observe(document.body);
  ro.observe(canvas);
  window.addEventListener('resize', onResize);
  const onScroll = () => (scrolled = true);
  window.addEventListener('scroll', onScroll, { passive: true });
  // A font arriving late rewraps titles without changing the page's height, which the observer would miss.
  const onFonts = debounce(() => alive && layout(), 150);
  document.fonts.addEventListener('loadingdone', onFonts);
  if (!reduce) {
    document.addEventListener('focusin', onFocus);
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerdown', onPress);
    root.addEventListener('pointerleave', onPointerLeave);
  }
  const activity = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'] as const;
  for (const type of activity) window.addEventListener(type, onActivity, { passive: true });
  // Before the observer's first call, that call measures with the fonts in place.
  void document.fonts.ready.then(() => alive && measured && layout());
  void Promise.all([document.fonts.load(SERIF_S), document.fonts.load(MONO)]).then(() => {
    epoch++;
    dirty = true;
  });
  // Tells the page's failsafe in index.html that the hidden reveal states will be uncovered.
  if (!reduce) root.setAttribute('data-plot-ready', '');
  raf = requestAnimationFrame(frame);
  if (opts.debug)
    (window as unknown as { __plot?: object }).__plot = {
      render,
      layout,
      /** Where along its path the pen heads at a scroll position. */
      sAtScroll: (sc: number) => (path ? sAtB(path, bAtScroll(kfs, sc)) : 0),
      /** Runs one loop iteration at a given time, for a page whose animation frames are paused. */
      step: (now: number) => tick(now),
      get pen() {
        return { ...pen };
      },
      get state() {
        return { W, H, sy, introDone, reveals: reveals.map((r) => [r.kind, Math.round(r.top), titleP(r.title)]) };
      },
      get path() {
        return path;
      },
    };

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll);
    document.fonts.removeEventListener('loadingdone', onFonts);
    document.removeEventListener('focusin', onFocus);
    document.removeEventListener('pointerover', onPointerOver);
    document.removeEventListener('pointerdown', onPress);
    root.removeEventListener('pointerleave', onPointerLeave);
    for (const type of activity) window.removeEventListener(type, onActivity);
    root.removeAttribute('data-plot-idle');
  };
}
