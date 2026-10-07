import { RED, SERIF } from '../draw.ts';
import type { Plate, Rect } from './types.ts';

/** The rule's zero, in page coordinates: the pen taps it to set the plate off. */
export const rulerOrigin = (rs: Rect): [number, number] => [rs.left, rs.top + rs.h * 0.6];

/** A metre rule under the G, X, 2, Enter sequence, with the typed 2.000 m as a vector. */
export const ruler: Plate = {
  at: 'ruler-space',
  station: 'ruler',
  seconds: 1.1,
  draw({ ink, sy, W, anchor }) {
    const rs = anchor('ruler-space');
    if (!rs) return;
    const [x0, oy] = rulerOrigin(rs);
    const x1 = Math.min(rs.right, rs.left + 980);
    const y = oy - sy;
    const um = (x1 - x0) / 6.2;
    ink.poly(
      [
        [x0, y],
        [x1, y],
      ],
      0.02,
      0.3,
      { a: 0.22, linear: true },
    );
    for (let i = 0; i <= 24; i++) {
      const x = x0 + i * 0.25 * um;
      const major = i % 4 === 0;
      const a = 0.15 + i * 0.012;
      ink.poly(
        [
          [x, y],
          [x, y - (major ? 10 : 4)],
        ],
        a,
        a + 0.05,
        { a: major ? 0.32 : 0.18, noTip: true, linear: true },
      );
      if (major) {
        ink.label(i === 0 ? '0 m' : String(i / 4), x, y + 17, a + 0.02, a + 0.08, {
          align: i === 0 ? 'left' : 'center',
          a: 0.4,
        });
      }
    }
    const vy = y - 24;
    const x2 = x0 + 2 * um;
    ink.poly(
      [
        [x0, y],
        [x0, vy - 8],
      ],
      0.4,
      0.46,
      { a: 0.3, dash: [2, 3], noTip: true },
    );
    ink.poly(
      [
        [x2, y],
        [x2, vy - 8],
      ],
      0.42,
      0.48,
      { a: 0.3, dash: [2, 3], noTip: true },
    );
    ink.poly(
      [
        [x0, vy],
        [x2, vy],
      ],
      0.45,
      0.68,
      { c: RED, hm: 0.3, a: 0.6, w: 1.4, arrow: true, arrowSize: 7 },
    );
    ink.label('Δx = 2.000 m', x0 + um, vy - 10, 0.6, 0.78, { align: 'center', a: 0.6 });
    if (W >= 700) ink.label('p′ = p + 2.000 · x̂', x1, vy - 8, 0.68, 0.88, { font: SERIF, align: 'right', a: 0.5 });
  },
};
