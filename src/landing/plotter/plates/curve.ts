import { AMBER, MONO_S, NEUTRAL, SANS, SERIF_S, clamp, lerp, mix, rgba, type Pt } from '../draw.ts';
import { TUTORIAL } from '../../sections/tutorial/tutorial-data.ts';
import type { Plate, Rect } from './types.ts';

const SENTENCE = 'a task ticks off only when you actually perform it';
const CHAPTERS = TUTORIAL.chapters.length;
const TASKS = TUTORIAL.chapters.reduce((n, c) => n + c.tasks.length, 0);

const N = 160;
const logistic = (u: number) => 1 / (1 + Math.exp(-8.5 * (u - 0.42)));

/** The axes' corner and far ends, and the curve, in page coordinates; the pen draws the same curve. */
export function curveGeometry(g: Rect) {
  const x0 = g.left + 44;
  const x1 = g.right - 8;
  const yb = g.bottom - 28;
  const yt = g.top + 12;
  const l0 = logistic(0);
  const l1 = logistic(1);
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    pts.push([lerp(x0, x1, u), yb - (yb - yt - 24) * (0.04 + (0.92 * (logistic(u) - l0)) / (l1 - l0))]);
  }
  return { x0, x1, yb, yt, pts };
}

/** A learning curve: a column per chapter, a dot per task, and a sentence riding the curve behind the pen tip. */
export const curve: Plate = {
  at: 'tutorial-plot',
  // The pen comes down to the curve's start and draws it, so the plate keeps pace with the pen.
  track: [
    ['chart-in', 0],
    ['chart-0', 0.2],
    ['chart-1', 0.88],
    ['chart-out', 1],
  ],
  draw({ ink, ctx, sy, anchor }) {
    const g = anchor('tutorial-plot');
    if (!g) return;
    const geo = curveGeometry(g);
    const { x0, x1 } = geo;
    const yb = geo.yb - sy;
    const yt = geo.yt - sy;
    ink.poly(
      [
        [x0, yt],
        [x0, yb],
        [x1, yb],
      ],
      0.02,
      0.22,
      { a: 0.26 },
    );
    ink.label('HABIT', x0 - 10, yt + 8, 0.1, 0.2, { align: 'right', a: 0.4, font: MONO_S });
    ink.label('PRACTICE →', x1, yb + 22, 0.14, 0.26, { align: 'right', a: 0.4, font: MONO_S });
    for (let k = 0; k < CHAPTERS; k++) {
      const x = lerp(x0, x1, (k + 1) / CHAPTERS);
      ink.poly(
        [
          [x, yb],
          [x, yt + 22],
        ],
        0.12 + k * 0.04,
        0.3 + k * 0.04,
        { a: 0.07, dash: [2, 4], noTip: true },
      );
      ink.label(
        String(k + 1).padStart(2, '0'),
        x - (x1 - x0) / (CHAPTERS * 2),
        yb + 22,
        0.16 + k * 0.04,
        0.24 + k * 0.04,
        {
          align: 'center',
          a: 0.36,
          font: MONO_S,
        },
      );
    }

    const pts: Pt[] = geo.pts.map(([x, y]) => [x, y - sy]);
    ink.poly(pts, 0.2, 0.88, { c: AMBER, hm: 0, a: 0.5, hb: 0.6, w: 1.5, linear: true });
    const q = ink.seg(0.2, 0.88);
    if (q <= 0) return;

    const ls = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) ls[i] = ls[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const L = ls[N];
    const reach = L * q;
    const at = (d: number): [number, number, number] => {
      let lo = 1;
      let hi = N;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (ls[m] < d) lo = m + 1;
        else hi = m;
      }
      const p0 = pts[lo - 1];
      const p1 = pts[lo];
      const f = (d - ls[lo - 1]) / (ls[lo] - ls[lo - 1] || 1);
      return [lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f), Math.atan2(p1[1] - p0[1], p1[0] - p0[0])];
    };

    for (let i = 0; i < TASKS; i++) {
      const d = (L * (i + 0.5)) / TASKS;
      if (d > reach) break;
      const [x, y] = at(d);
      const fresh = clamp(1 - (reach - d) / 120);
      ink.dot(x, y, 2.2, mix(NEUTRAL, AMBER, 0.45 + 0.55 * fresh), (0.45 + fresh * 0.5) * ink.I);
    }

    // The sentence rides the curve, letter by letter, behind the pen tip.
    ctx.font = SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let d = L * 0.06;
    for (const ch of SENTENCE) {
      const cw = ctx.measureText(ch).width;
      const mid = d + cw / 2;
      if (mid > reach - 4) break;
      const [x, y, a] = at(mid);
      const fresh = clamp(1 - (reach - mid) / 160);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.translate(0, -10);
      ctx.fillStyle = rgba(mix(NEUTRAL, AMBER, fresh), (0.42 + 0.5 * fresh) * ink.I);
      ctx.fillText(ch, -cw / 2, 0);
      ctx.restore();
      d += cw;
    }
    ink.label(`fig. 6 — ${TASKS} tasks, each ticked only when performed`, x0 + 16, yt + 14, 0.5, 0.75, {
      font: SERIF_S,
      a: 0.5,
    });
  },
};
