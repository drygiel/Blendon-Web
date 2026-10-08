// The background plotter: a fixed canvas behind the page. A glowing pen travels down a rail in the margin as
// the page scrolls, writes each section title, and every section draws its own mathematical plate.
// The page marks up what the plotter uses through plotter/contract.ts.
import { MONO, SERIF_S } from '../draw.ts';
import { bAtScroll, sAtB } from '../path.ts';
import { plotStore } from '../store.ts';
import { hudUpdater, reveal, titleP, updateCta, updateReveals, updateTitles, type HudParts } from './dom.ts';
import { drawGrid } from './grid.ts';
import { canvasBox, layout, measureAnchors, pixelRatio } from './measure.ts';
import { burstFrom, drawSparks, stepParticles } from './particles.ts';
import { drawPen, scrollTarget, updatePen } from './pen.ts';
import { drawPlates, onScreen, stepPlates } from './plate-runner.ts';
import { createState, near } from './state.ts';
import { HOT_INK, drawTrail } from './trail.ts';

export type { HudParts } from './dom.ts';

export interface PlotterOptions {
  /** Draw a still background only: no pen, no trail, plates complete. */
  reduce: boolean;
  hud: HudParts | null;
  /** Exposes the plotter on `window.__plot` for profiling. */
  debug?: boolean;
}

/** Ambient motion alone, such as a slow spin or a flicker, redraws at about 30 fps. */
const AMBIENT_FRAME_MS = 30;
/** Ambient motion stops once the visitor has neither scrolled nor pointed nor typed for this long. */
const AMBIENT_IDLE_MS = 8000;

const debounce = (fn: () => void, ms: number) => {
  let id = 0;
  return () => {
    window.clearTimeout(id);
    id = window.setTimeout(fn, ms);
  };
};

export function startPlotter(canvas: HTMLCanvasElement, opts: PlotterOptions): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const { reduce } = opts;
  const st = createState(canvas, ctx, reduce);
  const { root, pen } = st;
  const updateHud = opts.hud ? hudUpdater(opts.hud) : null;
  let lastSy = -1;
  let lastSlide = -1;
  let lastHover = false;
  let lastRender = 0;
  let raf = 0;
  let alive = true;

  function render() {
    const c = st.ctx;
    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    c.clearRect(0, 0, st.W, st.H);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    drawGrid(st);
    drawPlates(st);
    drawTrail(st);
    drawSparks(st);
    drawPen(st);
  }

  // Revealed elements may have moved while hidden; measure again once they settle.
  const remeasureSoon = debounce(() => {
    measureAnchors(st);
    for (const p of st.plates) if (p.plate.at) p.trigger = st.anchors.get(p.plate.at)?.top ?? p.trigger;
    st.dirty = true;
  }, 1100);

  // ---------- loop: draws only when something on screen changes

  let last = performance.now();
  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    st.t = (now - st.t0) / 1000;
    if (st.scrolled) {
      st.scrolled = false;
      st.sy = window.scrollY;
    }
    if (st.sy !== lastSy) st.lastActivity = now;
    const wasIdle = st.idle;
    st.idle = !reduce && now - st.lastActivity > AMBIENT_IDLE_MS;
    if (st.idle !== wasIdle) root.toggleAttribute('data-plot-idle', st.idle);
    if (!st.idle) st.at += dt;
    const before = pen.s;
    updatePen(st, dt);
    st.inkS = st.hold ? Math.max(st.inkS, pen.s) : Math.max(pen.s, Math.min(st.inkS, scrollTarget(st)));
    updateCta(st);
    if (!reduce) {
      updateTitles(st);
      if (updateReveals(st)) remeasureSoon();
    }
    stepParticles(st, dt);
    const platesMoving = stepPlates(st, dt);
    // Ambient motion redraws at the pace its slowest-needing part asks for, the orbit included.
    let ambientMs = Infinity;
    if (!reduce && !st.idle) {
      for (const ps of st.plates)
        if (ps.plate.animated && onScreen(st, ps.section))
          ambientMs = Math.min(ambientMs, ps.plate.ambientMs ?? AMBIENT_FRAME_MS);
      if (st.orbit && near(st, pen.y, 200)) ambientMs = Math.min(ambientMs, AMBIENT_FRAME_MS);
    }
    const slide = plotStore.setup.slide;
    const hover = plotStore.cta.hover;
    const tintWas = st.tint;
    st.tint += ((hover ? 1 : 0) - st.tint) * (1 - Math.exp(-dt * 14));
    if (Math.abs(st.tint - (hover ? 1 : 0)) < 0.004) st.tint = hover ? 1 : 0;
    // Motion off screen draws nothing: the pen and its hot ink, sparks and flashes count only near the view.
    const changed =
      st.dirty ||
      st.sy !== lastSy ||
      (Math.abs(pen.s - before) > 0.05 && near(st, pen.y, HOT_INK + 80)) ||
      st.sparks.some((p) => near(st, p.y, 40)) ||
      st.flashes.some((fl) => near(st, fl.y, fl.size)) ||
      platesMoving ||
      st.easing ||
      slide !== lastSlide ||
      hover !== lastHover ||
      (st.tint !== tintWas && near(st, pen.y, 200)) ||
      !st.introDone;
    if (changed || now - lastRender >= ambientMs) {
      render();
      st.dirty = false;
      lastSy = st.sy;
      lastSlide = slide;
      lastHover = hover;
      lastRender = now;
    }
    updateHud?.(st, now);
  }

  function frame(now: number) {
    if (!alive) return;
    tick(now);
    raf = requestAnimationFrame(frame);
  }

  // ---------- page events

  // Keyboard focus never lands on something still hidden: whatever it enters shows at once.
  const onFocus = (e: FocusEvent) => {
    const host = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-reveal]:not([data-in])') : null;
    if (!host) return;
    reveal(host, 0);
    st.reveals = st.reveals.filter((r) => r.el !== host);
  };
  // Pressing the final button sprays sparks from its edge that fall away down the page.
  const onPress = (e: PointerEvent) => {
    const el = e.target instanceof Element ? e.target.closest('[data-plot-anchor="cta-button"]') : null;
    if (!el) return;
    burstFrom(st, el);
    st.dirty = true;
  };
  // The pen follows the mouse over elements marked to hold it, such as the FAQ's questions.
  const onPointerOver = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-plot-hold]') : null;
    if (el !== (st.hold?.el ?? null)) st.hold = el ? { el, s: null, epoch: -1 } : null;
  };
  const onPointerLeave = () => (st.hold = null);
  const onActivity = () => (st.lastActivity = performance.now());
  const onScroll = () => (st.scrolled = true);

  // A URL bar sliding in or out resizes the window on every scroll turn, but not the canvas; that needs no layout.
  const onResize = debounce(() => {
    const [w, h] = canvasBox(canvas);
    if (Math.abs(w - st.W) > 0.5 || Math.abs(h - st.H) > 0.5 || pixelRatio() !== st.dpr) layout(st);
  }, 120);
  // The observer's first call comes after the browser's own layout, so measuring there forces none.
  const relayout = debounce(() => layout(st), 150);
  let measured = false;
  const ro = new ResizeObserver(() => {
    if (measured) relayout();
    else {
      measured = true;
      layout(st);
    }
  });
  ro.observe(document.body);
  ro.observe(canvas);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, { passive: true });
  // A font arriving late rewraps titles without changing the page's height, which the observer would miss.
  const onFonts = debounce(() => alive && layout(st), 150);
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
  void document.fonts.ready.then(() => alive && measured && layout(st));
  void Promise.all([document.fonts.load(SERIF_S), document.fonts.load(MONO)]).then(() => {
    st.epoch++;
    st.dirty = true;
  });
  // Tells the page's failsafe in index.html that the hidden reveal states will be uncovered.
  if (!reduce) root.setAttribute('data-plot-ready', '');
  raf = requestAnimationFrame(frame);
  if (opts.debug)
    (window as unknown as { __plot?: object }).__plot = {
      render,
      layout: () => layout(st),
      /** Where along its path the pen heads at a scroll position. */
      sAtScroll: (sc: number) => (st.path ? sAtB(st.path, bAtScroll(st.kfs, sc)) : 0),
      /** Runs one loop iteration at a given time, for a page whose animation frames are paused. */
      step: (now: number) => tick(now),
      get pen() {
        return { ...pen };
      },
      get state() {
        return {
          W: st.W,
          H: st.H,
          sy: st.sy,
          introDone: st.introDone,
          reveals: st.reveals.map((r) => [r.kind, Math.round(r.top), titleP(r.title)]),
          plates: st.plates.map((p) => [p.name, p.p]),
        };
      },
      get path() {
        return st.path;
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
