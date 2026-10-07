import { AMBER, MONO_S, NEUTRAL, SERIF, SERIF_S, TAU, circlePts, rectPts, type Pt } from '../draw.ts';
import type { Plate } from './types.ts';

/** The drawing's size at scale 1: orbit radius, distance between the two orbits, width and height. */
const R0 = 58;
const SPACING = 200;
const WIDTH = SPACING + 2 * R0;
const HEIGHT = 236;

/** Unity orbits a pivot that is not the object; Blendon orbits the selection itself. */
export const orbits: Plate = {
  draw({ ink, sy, W, title, content, anchor }) {
    if (!title || W < 900) return;
    // Fits between the intro column and the content's right edge, and above the table, with room to breathe.
    const left = title.right + 48;
    const top = title.top - 36;
    const table = anchor('compare-table');
    const bottom = table ? table.top - 32 : top + HEIGHT;
    const u = Math.min(1, (content.right - left) / WIDTH, (bottom - top) / HEIGHT);
    if (u < 0.7) return;
    const r = R0 * u;
    const x0 = content.right - WIDTH * u;
    const y0 = top - sy;
    const c1: Pt = [x0 + r, y0 + r + 30 * u];
    const c2: Pt = [c1[0] + SPACING * u, c1[1]];
    const start = -2.4;
    const cam = (c: Pt): Pt => [c[0] + Math.cos(start) * r, c[1] + Math.sin(start) * r];
    const below = c1[1] + r + 24 * u;

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
    ink.poly(rectPts(c1[0] + 32 * u, c1[1] - 19 * u, 14 * u, 14 * u), 0.05, 0.15, { a: 0.4 });
    ink.poly(circlePts(c1[0], c1[1], r, start, TAU * 0.82, 64), 0.1, 0.42, { a: 0.24, arrow: true, arrowSize: 6 });
    const k1 = cam(c1);
    ink.poly([c1, k1], 0.34, 0.44, { a: 0.22, dash: [2, 3], noTip: true });
    if (ink.seg(0.1, 0.42) > 0) ink.dot(k1[0], k1[1], 2.4, NEUTRAL, 0.5 * ink.I);
    ink.label('UNITY', c1[0] - r, below, 0.38, 0.48, { a: 0.5, font: MONO_S });
    ink.label('orbits the pivot', c1[0] - r, below + 18, 0.42, 0.56, { font: SERIF_S, a: 0.5 });

    ink.poly(rectPts(c2[0], c2[1], 15 * u, 15 * u), 0.3, 0.4, { c: AMBER, hm: 0, a: 0.75, hb: 0.3 });
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
    ink.label('BLENDON', c2[0] - r, below, 0.62, 0.72, { a: 0.55, font: MONO_S, c: AMBER });
    ink.label('orbits the selection', c2[0] - r, below + 18, 0.66, 0.8, { font: SERIF_S, a: 0.55 });
    ink.label('c′ = s + R(θ) · (c − s)', x0 + (WIDTH * u) / 2, below + 58, 0.74, 0.92, {
      font: SERIF,
      align: 'center',
      a: 0.5,
    });
  },
};
