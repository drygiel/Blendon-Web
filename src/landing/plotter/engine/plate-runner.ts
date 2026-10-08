// Runs the sections' plates: how far each has drawn, and drawing the ones near the screen.
import { clamp } from '../draw.ts';
import { posAt } from '../path.ts';
import type { PlateCtx, Rect } from '../plates/index.ts';
import { plotStore } from '../store.ts';
import type { PlateState, PlotState } from './state.ts';

const HERO_PLATE_SECONDS = 3.2;
/** Seconds a station's plate takes to draw, and to undraw. */
const STATION_PLATE_SECONDS = 2.6;
const STATION_UNDO_SECONDS = 1;

/** Near enough the screen to draw. */
const visible = (st: PlotState, r: Rect) => r.top - st.sy < st.H + 240 && r.bottom - st.sy > -420;

/** On the screen itself. */
export const onScreen = (st: PlotState, r: Rect) => r.top - st.sy < st.H && r.bottom - st.sy > 0;

/** A plate's progress from where the pen is between named route points, or null if any is missing. */
function trackP(st: PlotState, track: [string, number][] | undefined): number | null {
  const { path, pen } = st;
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

/** Moves every plate's progress on; true while one near the screen still changes. */
export function stepPlates(st: PlotState, dt: number): boolean {
  const { path, pen, t, sy, H } = st;
  let moving = false;
  for (const ps of st.plates) {
    const hero = ps.plate.intro === true;
    // A station's plate is set off by the pen landing there, a named point's by the pen passing it.
    const station = ps.plate.station ? st.stations.find((x) => x.name === ps.plate.station) : undefined;
    const mark = station?.s0 ?? (ps.plate.station ? path?.marks.get(ps.plate.station) : undefined);
    const tracked = trackP(st, ps.plate.track);
    let next: number;
    if (st.reduce) next = 1;
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
    if (Math.abs(next - ps.p) > 0.0005 && visible(st, ps.section)) moving = true;
    ps.p = next;
  }
  return moving;
}

function plateCtx(st: PlotState, ps: PlateState): PlateCtx {
  const { path, sy, H, reduce } = st;
  return {
    ink: st.ink,
    ctx: st.ctx,
    sy,
    t: st.at,
    dpr: st.dpr,
    epoch: st.epoch,
    W: st.W,
    H,
    mobile: st.mobile,
    reduce,
    section: ps.section,
    content: ps.content,
    title: ps.title,
    anchor: (name) => st.anchors.get(name) ?? null,
    markAt: (name) => {
      const s = path?.marks.get(name);
      return path && s !== undefined ? posAt(path, s) : null;
    },
    progressAt: (r) => (reduce ? 1 : clamp((sy + H * 0.92 - r.top) / (H * 0.5))),
    scrub: clamp((sy + H * 0.6 - ps.section.top) / Math.max(1, ps.section.h)),
    store: plotStore,
  };
}

/** Draws the plates near the screen; notes in `easing` when one asks for another frame. */
export function drawPlates(st: PlotState) {
  const { ctx: c, ink } = st;
  ink.I = st.intensity;
  st.easing = false;
  for (const ps of st.plates) {
    if (!visible(st, ps.section)) continue;
    ink.p = ps.p;
    c.save();
    if (ps.plate.draw(plateCtx(st, ps)) === true) st.easing = true;
    c.restore();
  }
}
