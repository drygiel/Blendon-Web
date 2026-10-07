import { AMBER, SERIF_S, type Pt } from '../draw.ts';
import type { Plate } from './types.ts';

/** Registration marks around the live Scene view; static, since WebGL runs inside. */
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
    ink.label('fig. 9 — a Scene view, live', d.right, B + 22, 0.62, 0.82, { font: SERIF_S, align: 'right', a: 0.5 });
  },
};
