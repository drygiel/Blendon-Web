import { AMBER, MONO_S, NEUTRAL, SERIF, SERIF_S, TAU, circlePts, rectPts, type Pt } from '../draw.ts';
import type { Plate } from './types.ts';

/** Unity orbits a pivot that is not the object; Blendon orbits the selection itself. */
export const orbits: Plate = {
  draw({ ink, sy, W, title, content }) {
    // Needs the empty space right of the title; narrow layouts have none.
    if (!title || W < 900) return;
    const rw = Math.min(470, content.w * 0.42);
    const u = rw / 470;
    const x0 = content.right - rw;
    const y0 = title.top - sy - 36;
    const r = 66 * u;
    const c1: Pt = [x0 + 110 * u, y0 + 100 * u];
    const c2: Pt = [x0 + 350 * u, y0 + 100 * u];
    const start = -2.4;
    const cam = (c: Pt): Pt => [c[0] + Math.cos(start) * r, c[1] + Math.sin(start) * r];

    ink.poly(
      [
        [c1[0] - 6, c1[1]],
        [c1[0] + 6, c1[1]],
      ],
      0.04,
      0.1,
      { a: 0.5, noTip: true },
    );
    ink.poly(
      [
        [c1[0], c1[1] - 6],
        [c1[0], c1[1] + 6],
      ],
      0.04,
      0.1,
      { a: 0.5, noTip: true },
    );
    ink.poly(rectPts(c1[0] + 36 * u, c1[1] - 22 * u, 15 * u, 15 * u), 0.05, 0.15, { a: 0.4 });
    ink.poly(circlePts(c1[0], c1[1], r, start, TAU * 0.82, 64), 0.1, 0.42, { a: 0.24, arrow: true, arrowSize: 6 });
    const k1 = cam(c1);
    ink.poly([c1, k1], 0.34, 0.44, { a: 0.22, dash: [2, 3], noTip: true });
    if (ink.seg(0.1, 0.42) > 0) ink.dot(k1[0], k1[1], 2.4, NEUTRAL, 0.5 * ink.I);
    ink.label('UNITY', c1[0] - r, c1[1] + r + 26 * u, 0.38, 0.48, { a: 0.5, font: MONO_S });
    ink.label('orbits the pivot', c1[0] - r, c1[1] + r + 26 * u + 18, 0.42, 0.56, { font: SERIF_S, a: 0.5 });

    ink.poly(rectPts(c2[0], c2[1], 17 * u, 17 * u), 0.3, 0.4, { c: AMBER, hm: 0, a: 0.75, hb: 0.3 });
    ink.poly(circlePts(c2[0], c2[1], r, start, TAU * 0.82, 64), 0.36, 0.7, {
      c: AMBER,
      hm: 0,
      a: 0.42,
      hb: 0.8,
      arrow: true,
      arrowSize: 6,
    });
    const k2 = cam(c2);
    ink.poly([c2, k2], 0.6, 0.7, { c: AMBER, hm: 0, a: 0.3, dash: [2, 3], noTip: true });
    if (ink.seg(0.36, 0.7) > 0) ink.dot(k2[0], k2[1], 2.4, AMBER, 0.7 * ink.I);
    ink.label('BLENDON', c2[0] - r, c2[1] + r + 26 * u, 0.62, 0.72, { a: 0.55, font: MONO_S, c: AMBER });
    ink.label('orbits the selection', c2[0] - r, c2[1] + r + 26 * u + 18, 0.66, 0.8, { font: SERIF_S, a: 0.55 });
    ink.label('c′ = s + R(θ) · (c − s)', x0 + rw / 2, c1[1] + r + 92 * u + 12, 0.74, 0.92, {
      font: SERIF,
      align: 'center',
      a: 0.5,
    });
  },
};
