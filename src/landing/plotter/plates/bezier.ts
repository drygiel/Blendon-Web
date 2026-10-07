import { AMBER, MONO_S, NEUTRAL, SERIF, SERIF_S, clamp, lerp, type Pt } from '../draw.ts';
import type { Plate } from './types.ts';

const at = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** De Casteljau's construction of a cubic Bezier curve, its parameter t driven by the scroll. */
export const bezier: Plate = {
  draw({ ink, sy, W, title, content, scrub }) {
    if (!title || W < 1000) return;
    const w = Math.min(400, content.w * 0.34);
    const h = 170;
    const x0 = content.right - w;
    const y0 = title.top - sy - 40;
    const P: Pt[] = [
      [x0, y0 + h],
      [x0 + w * 0.18, y0],
      [x0 + w * 0.78, y0 + h * 0.08],
      [x0 + w, y0 + h * 0.86],
    ];
    const t = clamp(0.08 + scrub * 1.1, 0.08, 0.92);

    ink.poly(P, 0.04, 0.3, { a: 0.22, dash: [3, 4] });
    P.forEach((p, i) => {
      if (ink.seg(0.04 + i * 0.06, 0.1 + i * 0.06) <= 0) return;
      ink.dot(p[0], p[1], 2.6, NEUTRAL, 0.6 * ink.I);
      ink.label(
        `P${'₀₁₂₃'[i]}`,
        p[0] + (i === 3 ? 8 : -8),
        p[1] + (i === 0 ? 18 : -10),
        0.08 + i * 0.06,
        0.16 + i * 0.06,
        {
          font: SERIF,
          align: i === 3 ? 'left' : 'right',
          a: 0.55,
        },
      );
    });

    // Each level interpolates the one above at t, down to the single point on the curve.
    const l1 = [at(P[0], P[1], t), at(P[1], P[2], t), at(P[2], P[3], t)];
    const l2 = [at(l1[0], l1[1], t), at(l1[1], l1[2], t)];
    const b = at(l2[0], l2[1], t);
    ink.poly(l1, 0.3, 0.45, { a: 0.3 });
    ink.poly(l2, 0.4, 0.55, { c: AMBER, hm: 0, a: 0.35, hb: 0.6 });
    if (ink.p > 0.45) for (const p of l1) ink.dot(p[0], p[1], 2, NEUTRAL, 0.45 * ink.I);
    if (ink.p > 0.55) for (const p of l2) ink.dot(p[0], p[1], 2, AMBER, 0.55 * ink.I);

    const curve: Pt[] = [];
    for (let i = 0; i <= 60; i++) {
      const u = (i / 60) * t;
      const a1 = [at(P[0], P[1], u), at(P[1], P[2], u), at(P[2], P[3], u)];
      const a2 = [at(a1[0], a1[1], u), at(a1[1], a1[2], u)];
      curve.push(at(a2[0], a2[1], u));
    }
    ink.poly(curve, 0.5, 0.7, { c: AMBER, hm: 0, a: 0.6, hb: 0.5, w: 1.5, linear: true });
    if (ink.p > 0.7) {
      ink.dot(b[0], b[1], 3, AMBER, 0.9 * ink.I);
      ink.spark(b[0], b[1], 0.6);
    }
    ink.label(`t = ${t.toFixed(2)}`, b[0] + 10, b[1] + 16, 0.7, 0.8, { a: 0.55, font: MONO_S });
    ink.label('B(t) = (1−t)³P₀ + 3(1−t)²t P₁ + 3(1−t)t² P₂ + t³P₃', x0 + w, y0 + h + 34, 0.72, 0.92, {
      font: SERIF_S,
      align: 'right',
      a: 0.5,
    });
  },
};
