// Everything the plotter reads from the page, in page coordinates, and the pen's path built from it.
import { buildPath, ctaEllipse, posAt, scrollKeyframes, underlineEnd, type Detour, type Point } from '../path.ts';
import { HERO_ORIGIN_Y } from '../plates/hero.ts';
import { plateNamed } from '../plates/index.ts';
import { routeNamed, type LaidRoute } from '../routes/index.ts';
import { contentRect, pageRect } from './page.ts';
import { holdS, scrollTarget } from './pen.ts';
import type { PlotState, TitleState } from './state.ts';

/** The background is soft and faint; more canvas pixels than this per CSS pixel cost more than they show. */
const MAX_DPR = 1.5;
/** How far under a section a route crosses back to the rail. */
const ROUTE_RETURN = 60;

export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

/**
 * The canvas's own CSS box. On a phone or tablet it is taller than the root's client height, which stays at
 * the size with the URL bar shown. Before the stylesheet applies, the window stands in.
 */
export function canvasBox(canvas: HTMLCanvasElement): [number, number] {
  if (getComputedStyle(canvas).position !== 'fixed') return [window.innerWidth, window.innerHeight];
  const r = canvas.getBoundingClientRect();
  return [r.width || window.innerWidth, r.height || window.innerHeight];
}

export function measureAnchors(st: PlotState) {
  st.anchors.clear();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-plot-anchor]'))) {
    const name = el.dataset.plotAnchor;
    if (name) st.anchors.set(name, pageRect(el, st.sy));
  }
}

function measureTitles(st: PlotState): TitleState[] {
  const old = new Map(st.titles.map((s) => [s.el, s]));
  return Array.from(document.querySelectorAll<HTMLElement>('[data-pen]')).flatMap((el) => {
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
        top: top + st.sy,
        bottom: bottom + st.sy,
        blockLeft: ib.left,
        blockW: ib.width,
        rv: prev?.rv ?? -1,
        edge: prev?.edge ?? -1,
      },
    ];
  });
}

/** Stations: points the pen leaps into after their section's title, such as the pie menu's centre. */
function measureDetours(st: PlotState): Detour[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-plot-station]')).flatMap((el) => {
    const sec = el.closest('section');
    const title = st.titles.findIndex((s) => s.section === sec);
    const r = pageRect(el, st.sy);
    const name = el.dataset.plotStation ?? '';
    const radius = Number(el.dataset.plotRadius) || 120;
    // A stacked layout puts a whole column between the title and the point; there it leaps from the rail.
    const fromTitle = el.dataset.plotLeap === 'title' && st.railX > 34;
    return title < 0 || !name ? [] : [{ title, name, cx: r.cx, cy: r.cy, r: radius, fromTitle }];
  });
}

/** Routes need the margin the section numbers use; narrow layouts keep the plain rail. */
function layRoutes(st: PlotState): LaidRoute[] {
  if (st.railX <= 34) return [];
  const { titles, sy, W, H, railX } = st;
  let carry: Point | null = null;
  return titles.flatMap((s, i) => {
    const sec = s.section;
    const fn = sec?.dataset.plotRoute ? routeNamed(sec.dataset.plotRoute) : undefined;
    let route: LaidRoute | null = null;
    if (sec && fn) {
      const box = pageRect(sec, sy);
      const next = titles[i + 1];
      const content = contentRect(sec, sy);
      // The left rail mirrored about the content column.
      const right = content.right + (content.left - railX);
      if (right <= W - 6)
        route = fn({
          section: sec,
          box,
          title: s,
          index: i,
          next,
          end: underlineEnd(s),
          back: box.bottom + Math.min(ROUTE_RETURN, next ? (next.top - box.bottom) * 0.35 : ROUTE_RETURN),
          right,
          railX,
          W,
          H,
          from: carry,
          rect: (el) => pageRect(el, sy),
        });
    }
    carry = route?.continues ? (route.pts[route.pts.length - 1] ?? null) : null;
    return route ? [route] : [];
  });
}

/** Measures the page and lays the pen's path out again. The bitmap is resized last, so the page lays out once. */
export function layout(st: PlotState) {
  const { canvas } = st;
  st.sy = window.scrollY;
  [st.W, st.H] = canvasBox(canvas);
  st.mobile = st.W < 760;
  st.dpr = pixelRatio();
  st.intensity = st.mobile ? 0.75 : 1;
  // H is the viewport with the URL bar hidden, as it always is once the visitor has scrolled to the bottom.
  st.maxScroll = Math.max(0, st.root.scrollHeight - st.H);
  st.epoch++;
  measureAnchors(st);

  st.titles = measureTitles(st);
  const later = st.titles.slice(1).map((s) => s.left);
  st.railX = Math.max(6, (later.length ? Math.min(...later) : 40) - (st.W >= 900 ? 34 : 10));
  const stage = st.anchors.get('hero-stage');
  st.origin = stage ? { x: stage.cx, y: stage.top + stage.h * HERO_ORIGIN_Y } : { x: st.W / 2, y: st.H * 0.7 };
  st.heroBottom = stage ? stage.bottom : 0;
  const cta = st.anchors.get('cta-button');
  const detours = measureDetours(st);
  const routes = layRoutes(st);
  const lines = new Map(routes.map((r) => [r.title, r.lineY]));
  const alongs = new Map(routes.map((r) => [r.title, r.along]));
  const path = buildPath({
    titles: st.titles.map((s, i) => ({
      left: s.left,
      right: s.right,
      top: s.top,
      bottom: s.bottom,
      lineY: lines.get(i),
      along: alongs.get(i),
    })),
    railX: st.railX,
    origin: st.origin,
    cta: cta ? { cx: cta.cx, cy: cta.cy, w: cta.w, h: cta.h } : null,
    detours,
    routes,
  });
  st.path = path;
  st.stations = path.stations;
  st.titles.forEach((s, i) => (s.run = path.runs[i] ?? null));
  // A pixel short of the bottom, which a browser scrolling in fractions may never quite reach.
  st.kfs = scrollKeyframes(path, st.H, Math.max(0, st.maxScroll - 1));

  st.ctaEl = document.querySelector<HTMLElement>('[data-plot-anchor="cta-button"]');
  st.ell = cta ? ctaEllipse({ cx: cta.cx, cy: cta.cy, w: cta.w, h: cta.h }) : null;
  const key = (el: HTMLElement, name: string) => `${el.id}|${name}`;
  const oldPlates = new Map(st.plates.map((p) => [key(p.el, p.name), p.p]));
  // A section may name several plates, separated by spaces.
  st.plates = Array.from(document.querySelectorAll<HTMLElement>('[data-plate]')).flatMap((sec) =>
    (sec.dataset.plate ?? '').split(' ').flatMap((name) => {
      const plate = plateNamed(name);
      if (!plate) return [];
      const section = pageRect(sec, st.sy);
      const titleEl = sec.querySelector('[data-pen]');
      const trigger = (plate.at ? st.anchors.get(plate.at)?.top : undefined) ?? section.top;
      return [
        {
          el: sec,
          name,
          plate,
          section,
          content: contentRect(sec, st.sy),
          title: titleEl ? pageRect(titleEl, st.sy) : null,
          trigger,
          p: st.reduce ? 1 : (oldPlates.get(key(sec, name)) ?? 0),
        },
      ];
    }),
  );

  st.reveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-in])')).map((el) => {
    const sec = el.closest('section');
    return {
      el,
      kind: el.dataset.reveal ?? '',
      title: st.titles.find((s) => s.section === sec) ?? null,
      at: el.dataset.revealAt ?? null,
      top: el.getBoundingClientRect().top + st.sy,
    };
  });

  if (st.introDone) {
    // A pen holding at a hovered element stays there; a question opening below must not move it.
    const free = scrollTarget(st);
    const pen = st.pen;
    pen.s = holdS(st) ?? free;
    const q = posAt(path, pen.s);
    pen.x = pen.px = q.x;
    pen.y = pen.py = q.y;
    st.inkS = Math.max(pen.s, st.hold ? free : pen.s);
  }
  // Setting the size clears the bitmap.
  const bw = Math.round(st.W * st.dpr);
  const bh = Math.round(st.H * st.dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  st.dirty = true;
}
