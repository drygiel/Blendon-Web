import { AMBER, MONO_S, NEUTRAL, SERIF_S, type Pt } from '../draw.ts';
import type { Plate } from './types.ts';

/** Registration marks and a dimension line around the live Scene view; static, since WebGL runs inside. */
export const frame: Plate = {
  at: 'try-dock',
  draw({ ink, sy, anchor }) {
    const d = anchor('try-dock');
    if (!d) return;
    const m = 12;
    const L = d.left - m;
    const R = d.right + m;
    const T = d.top - sy - m;
    const B = d.bottom - sy + m;
    const s = 18;
    const corners: Pt[][] = [
      [
        [L, T + s],
        [L, T],
        [L + s, T],
      ],
      [
        [R - s, T],
        [R, T],
        [R, T + s],
      ],
      [
        [R, B - s],
        [R, B],
        [R - s, B],
      ],
      [
        [L + s, B],
        [L, B],
        [L, B - s],
      ],
    ];
    corners.forEach((c, k) => ink.poly(c, 0.04 + k * 0.06, 0.2 + k * 0.06, { c: AMBER, hm: 0, a: 0.5, hb: 0.6 }));
    const y = T - 14;
    ink.poly(
      [
        [d.left, y],
        [d.right, y],
      ],
      0.3,
      0.6,
      { a: 0.22, arrow: true, arrowSize: 6 },
    );
    if (ink.seg(0.3, 0.6) >= 1) ink.arrowHead(d.left, y, Math.PI, 6, NEUTRAL, 0.35 * ink.I);
    ink.label(`${Math.round(d.w)} px · 1 : 1`, (d.left + d.right) / 2, y - 7, 0.5, 0.7, {
      align: 'center',
      a: 0.45,
      font: MONO_S,
    });
    ink.label('fig. 9 — a Scene view, live', d.right, B + 22, 0.62, 0.82, { font: SERIF_S, align: 'right', a: 0.5 });
  },
};
