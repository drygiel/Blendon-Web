// The background plotter: a fixed canvas behind the page. A glowing pen travels down a rail in the margin as
// the page scrolls, writes each section title, and every section draws its own mathematical plate.
// The page marks up what the plotter uses with data attributes; see the DOM contract in PlotterLayer.tsx.

import {
  AMBER,
  HOT,
  Ink,
  MONO,
  MONO_S,
  NEUTRAL,
  SERIF_S,
  TAU,
  WHITE,
  clamp,
  easeOut,
  makeSprites,
  mix,
  rgba,
  smooth,
} from './draw.ts';
import {
  INTRO_END,
  JUMP,
  RING,
  UP,
  WRITE,
  bAtScroll,
  buildPath,
  introS,
  posAt,
  sAtB,
  scrollKeyframes,
  type Keyframe,
  type PlotPath,
  type Detour,
  type Run,
  type SegmentKind,
  type Station,
} from './path.ts';
import { HERO_ORIGIN_Y } from './plates/hero.ts';
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

/** Where the grid bends like space around a black hole, in screen coordinates, within its section. */
interface Field {
  x: number;
  y: number;
  r: number;
  w: number;
  top: number;
  bottom: number;
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
}

/** How far, in multiples of the station's radius, the black-hole field bends the grid. */
const FIELD_REACH = 4.2;
/** Brightness steps for grid lines that fade into a field. */
const LEVELS = 6;
const HOT_INK = 380;
const UP_WAKE = 620;
const MAX_SPARKS = 280;
const HERO_PLATE_SECONDS = 3.2;

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

const debounce = (fn: () => void, ms: number) => {
  let id = 0;
  return () => {
    window.clearTimeout(id);
    id = window.setTimeout(fn, ms);
  };
};

export function startPlotter(canvas: HTMLCanvasElement, opts: PlotterOptions): () => void {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) return () => {};
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const { reduce, hud } = opts;
  const sprites = makeSprites();
  const ink = new Ink(ctx, sprites);
  const root = document.documentElement;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let sy = window.scrollY;
  let maxScroll = 0;
  let mobile = false;
  let intensity = 1;
  const t0 = performance.now();
  let t = 0;
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
  let field: Field | null = null;
  const flashes: Flash[] = [];
  const anchors = new Map<string, Rect>();
  const sparks: Spark[] = [];
  const pen = { s: 0, x: 0, y: 0, px: 0, py: 0, v: 0, kind: UP as SegmentKind };
  let dirty = true;
  let lastSy = -1;
  let lastAngle: number | null = null;
  let hudAt = 0;
  let raf = 0;
  let alive = true;

  // ---------- layout: everything the plotter reads from the page, in page coordinates

  function layout() {
    sy = window.scrollY;
    // The viewport, not the canvas: its stylesheet may not apply yet on the first layout.
    W = root.clientWidth || window.innerWidth;
    H = root.clientHeight || window.innerHeight;
    mobile = W < 760;
    dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    intensity = mobile ? 0.75 : 1;
    maxScroll = Math.max(0, root.scrollHeight - H);
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
        return title < 0 || !name ? [] : [{ title, name, cx: r.cx, cy: r.cy, r: Number(el.dataset.plotRadius) || 120 }];
      },
    );
    path = buildPath({
      titles: titles.map((s) => ({ left: s.left, right: s.right, top: s.top, bottom: s.bottom })),
      railX,
      origin,
      cta: cta ? { cx: cta.cx, cy: cta.cy, w: cta.w, h: cta.h } : null,
      detours,
    });
    stations = path.stations;
    titles.forEach((s, i) => (s.run = path?.runs[i] ?? null));
    kfs = scrollKeyframes(path, H, maxScroll);

    const oldPlates = new Map(plates.map((p) => [p.el, p.p]));
    plates = Array.from(document.querySelectorAll<HTMLElement>('[data-plate]')).flatMap((sec) => {
      const plate = PLATES[sec.dataset.plate ?? ''];
      if (!plate) return [];
      const section = pageRect(sec, sy);
      const titleEl = sec.querySelector('[data-pen]');
      const trigger = (plate.at ? anchors.get(plate.at)?.top : undefined) ?? section.top;
      return [
        {
          el: sec,
          plate,
          section,
          content: contentRect(sec, sy),
          title: titleEl ? pageRect(titleEl, sy) : null,
          trigger,
          p: reduce ? 1 : (oldPlates.get(sec) ?? 0),
        },
      ];
    });

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
      pen.s = scrollTarget();
      const q = posAt(path, pen.s);
      pen.x = pen.px = q.x;
      pen.y = pen.py = q.y;
    }
    dirty = true;
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
    if (!introDone) {
      target = introS(path, t);
      if (t >= INTRO_END) introDone = true;
    } else target = scrollTarget();
    const prev = pen.s;
    const diff = target - prev;
    pen.s = introDone ? prev + diff * (1 - Math.exp(-dt * (6 + Math.min(24, Math.abs(diff) / 250)))) : target;
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
    // Landing in a station going forward ignites it: a burst of sparks and a spreading ring of light.
    for (const st of stations) {
      if (prev < st.s0 && pen.s >= st.s0) {
        const p = posAt(path, st.s0);
        emit(p.x, p.y, 70, 420, 0, TAU, 30);
        flashes.push({ x: p.x, y: p.y, t, size: 260 });
      }
    }
    if (pen.kind !== UP && t - lastMove < 1.5) {
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
      p.vy += 520 * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  const visible = (r: Rect) => r.top - sy < H + 240 && r.bottom - sy > -420;

  function stepPlates(dt: number): boolean {
    let moving = false;
    for (const ps of plates) {
      const hero = ps.plate.intro === true;
      // A station's plate draws as the pen circles the station, so the pen itself sets it off.
      const st = ps.plate.station ? stations.find((x) => x.name === ps.plate.station) : undefined;
      const target = reduce
        ? 1
        : hero
          ? clamp(t / HERO_PLATE_SECONDS)
          : st
            ? clamp((pen.s - st.s0) / (st.s1 - st.s0 || 1))
            : clamp((sy + H * 0.9 - ps.trigger) / (H * 0.62));
      const next = ps.p + (target - ps.p) * (1 - Math.exp(-dt * (hero ? 60 : 5)));
      if (Math.abs(next - ps.p) > 0.0005 && visible(ps.section)) moving = true;
      ps.p = next;
    }
    return moving;
  }

  // The black-hole field follows a warping plate's station, as strong as the plate is drawn.
  function updateField() {
    field = null;
    if (!path) return;
    for (const ps of plates) {
      const st = ps.plate.warp ? stations.find((x) => x.name === ps.plate.station) : undefined;
      if (!st || ps.p < 0.001) continue;
      const c = posAt(path, st.s0);
      const r = plotStore.pie.radius || 120;
      const y = c.y - sy;
      if (y < -r * FIELD_REACH || y > H + r * FIELD_REACH) continue;
      field = { x: c.x, y, r, w: easeOut(ps.p), top: ps.section.top - sy, bottom: ps.section.bottom - sy };
    }
  }

  // ---------- drawing

  function drawGrid() {
    const cell = mobile ? 34 : 44;
    const par = sy * 0.3;
    const base = Math.floor(par / cell);
    const y0 = -(par - base * cell);
    const px = pen.x;
    const py = pen.y - sy;
    const sig = 85;
    const str = reduce ? 0 : 15;
    const reach = sig * 3;
    const f = field;
    const fReach = f ? f.r * FIELD_REACH : 0;
    // Strokes grouped by brightness, so a bent line can fade without a stroke call per segment.
    const minor = Array.from({ length: LEVELS }, () => new Path2D());
    const major = Array.from({ length: LEVELS }, () => new Path2D());
    const pt = [0, 0, 1];
    // Where a grid point lands: pulled in and twisted around the field's centre, then into the pen's well.
    const warp = (x: number, y: number) => {
      let a = 1;
      if (f) {
        const dx = x - f.x;
        const dy = y - f.y;
        const r = Math.hypot(dx, dy);
        // The bend eases off toward the section's edges, so the grid above and below stays straight.
        const w = f.w * smooth(f.top - 40, f.top + 160, y) * (1 - smooth(f.bottom - 220, f.bottom + 20, y));
        if (r < fReach && w > 0) {
          const u = r / f.r;
          const pull = 0.55 * w * Math.exp(-((u / 2.3) ** 2));
          const twist = 1.15 * w * Math.exp(-((u / 1.9) ** 2));
          const rr = r * (1 - pull);
          const ang = Math.atan2(dy, dx) + twist;
          x = f.x + Math.cos(ang) * rr;
          y = f.y + Math.sin(ang) * rr;
          // Near the centre the grid gives way to the polar paper drawn there.
          a = 1 - w * (1 - smooth(0.5, 1.35, rr / f.r));
        }
      }
      const dx = x - px;
      const dy = y - py;
      const r2 = dx * dx + dy * dy;
      if (str > 0 && r2 < reach * reach) {
        const k = (str * Math.exp(-r2 / (2 * sig * sig))) / (Math.sqrt(r2) + sig * 0.5);
        x -= dx * k;
        y -= dy * k;
      }
      pt[0] = x;
      pt[1] = y;
      pt[2] = a;
    };
    // One grid line: straight where nothing bends it, sampled where the pen or the field does.
    const line = (set: Path2D[], ax: number, ay: number, bx: number, by: number, bent: boolean) => {
      if (!bent) {
        set[LEVELS - 1].moveTo(ax, ay);
        set[LEVELS - 1].lineTo(bx, by);
        return;
      }
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 8));
      warp(ax, ay);
      let lx = pt[0];
      let ly = pt[1];
      let la = pt[2];
      for (let i = 1; i <= n; i++) {
        warp(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
        const lv = Math.round(((la + pt[2]) / 2) * (LEVELS - 1));
        if (lv > 0) {
          set[lv].moveTo(lx, ly);
          set[lv].lineTo(pt[0], pt[1]);
        }
        lx = pt[0];
        ly = pt[1];
        la = pt[2];
      }
    };
    const penNear = str > 0 && py > -reach && py < H + reach;
    for (let x = ((W / 2) % cell) - cell + 0.5; x < W + cell; x += cell) {
      const set = Math.round((x - W / 2) / cell) % 4 === 0 ? major : minor;
      const bent = (penNear && Math.abs(x - px) < reach) || (f !== null && Math.abs(x - f.x) < fReach);
      line(set, x, 0, x, H, bent);
    }
    for (let k = -1; ; k++) {
      const y = Math.round(y0 + k * cell) + 0.5;
      if (y > H + cell) break;
      const set = (base + k) % 4 === 0 ? major : minor;
      const bent = (penNear && Math.abs(y - py) < reach) || (f !== null && Math.abs(y - f.y) < fReach);
      line(set, 0, y, W, y, bent);
    }
    ctx.lineWidth = 1;
    for (let lv = 1; lv < LEVELS; lv++) {
      const a = lv / (LEVELS - 1);
      ctx.strokeStyle = rgba(NEUTRAL, 0.034 * intensity * a);
      ctx.stroke(minor[lv]);
      ctx.strokeStyle = rgba(NEUTRAL, 0.062 * intensity * a);
      ctx.stroke(major[lv]);
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
    for (let i = Math.max(1, lo); i < ip; i++) {
      if ((Y[i] > bot && Y[i - 1] > bot) || K[i] === UP || K[i] === JUMP) {
        last = -1;
        continue;
      }
      const k = K[i];
      const pa = k === WRITE ? run : down;
      if (k !== last) pa.moveTo(X[i - 1], Y[i - 1] - sy);
      pa.lineTo(X[i], Y[i] - sy);
      last = k;
      // Ruler ticks on the rail, a long one every fifth.
      if (k === 0 && X[i] === X[i - 1] && Math.floor(S[i] / 30) !== Math.floor(S[i - 1] / 30)) {
        const len = Math.floor(S[i] / 30) % 5 === 0 ? 9 : 4;
        ticks.moveTo(X[i] - 3 - len, Y[i] - sy);
        ticks.lineTo(X[i] - 3, Y[i] - sy);
      }
    }
    if (K[ip] !== UP && K[ip] !== JUMP) {
      const pa = K[ip] === WRITE ? run : down;
      if (K[ip] !== last) pa.moveTo(X[ip - 1], Y[ip - 1] - sy);
      pa.lineTo(p.x, p.y - sy);
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
        if (!r || pen.s < r.s0) continue;
        const y = r.uy - sy;
        if (y < -20 || y > H + 20) continue;
        const [num] = sectionLabel(s.section);
        if (num) c.fillText(num, railX - 9, y - 6);
      }
    }

    // Fresh ink near the pen is hot and cools to grey; a pen-up move leaves only a short dotted wake,
    // amber where the pen leapt.
    let x2 = p.x;
    let y2 = p.y;
    c.save();
    for (let i = ip; i >= 1; i--) {
      const d = pen.s - S[i - 1];
      if (d - (S[i] - S[i - 1]) > UP_WAKE) break;
      const x1 = X[i - 1];
      const y1 = Y[i - 1];
      if (K[i] === UP || K[i] === JUMP) {
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
        const h = clamp(1 - d / HOT_INK);
        c.globalCompositeOperation = 'lighter';
        c.lineWidth = 4;
        c.strokeStyle = rgba(AMBER, 0.1 * h * intensity);
        c.beginPath();
        c.moveTo(x1, y1 - sy);
        c.lineTo(x2, y2 - sy);
        c.stroke();
        c.globalCompositeOperation = 'source-over';
        c.lineWidth = 1 + h * 0.5;
        c.strokeStyle = rgba(
          mix(NEUTRAL, h > 0.8 ? HOT : AMBER, Math.pow(h, 0.7)),
          (0.2 + 0.75 * h) * Math.min(1.2, intensity),
        );
        c.beginPath();
        c.moveTo(x1, y1 - sy);
        c.lineTo(x2, y2 - sy);
        c.stroke();
      }
      x2 = x1;
      y2 = y1;
    }
    c.restore();
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
      c.strokeStyle = rgba(mix(AMBER, HOT, k * k), k * 0.9);
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
    if (y < -150 || y > H + 150) return;
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
    ink.sprite(sprites.glowL, x, y, 230, 0.3 * up * flick);
    ink.sprite(sprites.glowS, x, y, 36 * flick, 0.95 * up);
    c.globalAlpha = 0.24 * up * flick;
    c.drawImage(sprites.streak, x - 130, y - 1.5, 260, 3);
    c.globalAlpha = 1;
    c.restore();
    ink.dot(x, y, 1.8, WHITE, 0.95 * up);
  }

  function plateCtx(ps: PlateState): PlateCtx {
    return {
      ink,
      ctx: ctx,
      sy,
      t,
      W,
      H,
      mobile,
      reduce,
      section: ps.section,
      content: ps.content,
      title: ps.title,
      anchor: (name) => anchors.get(name) ?? null,
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
    for (const ps of plates) {
      if (!visible(ps.section)) continue;
      ink.p = ps.p;
      c.save();
      ps.plate.draw(plateCtx(ps));
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
            : pen.kind === UP
              ? 'pen up'
              : 'pen down';
    hud.state.textContent = `Plot · ${state}`;
    hud.section.textContent = `§ ${num || '--'} · ${name}`;
    hud.progress.textContent = `s ${Math.round(pen.s).toLocaleString('en-US')} px · ${Math.round((pen.s / (path.total || 1)) * 100)} %`;
  }

  // ---------- loop: draws only when something on screen changes

  let last = performance.now();
  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t = (now - t0) / 1000;
    sy = window.scrollY;
    const before = pen.s;
    updatePen(dt);
    if (!reduce) {
      updateTitles();
      updateReveals();
    }
    stepSparks(dt);
    const platesMoving = stepPlates(dt);
    updateField();
    while (flashes.length && t - flashes[0].t > 0.9) flashes.shift();
    const animated = plates.some((ps) => ps.plate.animated && visible(ps.section));
    const angle = plotStore.pie.angle;
    const changed =
      dirty ||
      sy !== lastSy ||
      Math.abs(pen.s - before) > 0.05 ||
      sparks.length > 0 ||
      flashes.length > 0 ||
      platesMoving ||
      (animated && !reduce) ||
      angle !== lastAngle ||
      !introDone;
    if (changed) {
      render();
      dirty = false;
      lastSy = sy;
      lastAngle = angle;
    }
    updateHud(now);
  }

  function frame(now: number) {
    if (!alive) return;
    tick(now);
    raf = requestAnimationFrame(frame);
  }

  const onResize = debounce(layout, 120);
  const ro = new ResizeObserver(debounce(layout, 150));
  ro.observe(document.body);
  window.addEventListener('resize', onResize);
  if (!reduce) document.addEventListener('focusin', onFocus);
  layout();
  void document.fonts.ready.then(() => alive && layout());
  void Promise.all([document.fonts.load(SERIF_S), document.fonts.load(MONO)]).then(() => (dirty = true));
  // Tells the page's failsafe in index.html that the hidden reveal states will be uncovered.
  if (!reduce) root.setAttribute('data-plot-ready', '');
  raf = requestAnimationFrame(frame);
  if (opts.debug)
    (window as unknown as { __plot?: object }).__plot = {
      render,
      layout,
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
    document.removeEventListener('focusin', onFocus);
  };
}
