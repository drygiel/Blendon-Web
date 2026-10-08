// The line the pen has drawn: grey ink with ruler ticks on the rail, section numbers at its branches, and the
// fresh ink near the pen glowing hot.
import { AMBER, HOT, LIME, LIME_HOT, MONO_S, NEUTRAL, clamp, mix, rgba } from '../draw.ts';
import { GHOST, JUMP, UP, WRITE, posAt } from '../path.ts';
import { sectionLabel } from './page.ts';
import { ORBIT_TAIL } from './pen.ts';
import type { PlotState } from './state.ts';

/** How far behind the pen its ink is still hot, in pixels of path. */
export const HOT_INK = 380;
/** How far behind the pen a pen-up move leaves its dotted wake. */
const UP_WAKE = 620;
/** Heat steps of the fresh ink behind the pen. */
const HEAT_BANDS = 16;

export function drawTrail(st: PlotState) {
  const { path, ctx: c, ink, pen, sy, H, intensity, railX, tint, orbit, ell } = st;
  if (st.reduce || !path || path.n < 2) return;
  const { x: X, y: Y, s: S, kind: K, maxY } = path;
  const top = sy - 60;
  const bot = sy + H + 60;
  // The line reaches `e`; the pen, and the hot ink behind it, may be further back while it holds.
  const e = posAt(path, st.inkS);
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
    for (const s of st.titles.slice(1)) {
      const r = s.run;
      if (!r || st.inkS < r.s0) continue;
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
