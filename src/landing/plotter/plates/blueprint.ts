import { VERSION } from '../../../lib/product.ts';
import { AMBER, MONO, MONO_S, NEUTRAL, SERIF_S, type RGB } from '../draw.ts';
import type { Plate } from './types.ts';

const LAYERS: [string, string, RGB, boolean][] = [
  ['EDITOR', 'Blendon lives here', AMBER, false],
  ['RUNTIME', 'nothing added', NEUTRAL, true],
  ['PLAYER BUILD', 'untouched', NEUTRAL, false],
];

/** A drawing's title block under the specs, and the build exploded into layers beside the title. */
export const blueprint: Plate = {
  draw({ ink, sy, W, title, content, anchor, progressAt }) {
    const g = anchor('hood-block');
    if (g) {
      // The block sits low in the section, so it draws when it comes into view rather than with the title.
      const keep = ink.p;
      ink.p = progressAt(g);
      const bw = Math.min(g.w, 540);
      const bh = 96;
      const x0 = g.right - bw;
      const y0 = g.top - sy + (g.h - bh) / 2;
      const split = x0 + bw * 0.66;
      const rows = [y0, y0 + bh / 3, y0 + (2 * bh) / 3];
      ink.poly(
        [
          [x0, y0],
          [x0 + bw, y0],
          [x0 + bw, y0 + bh],
          [x0, y0 + bh],
          [x0, y0],
        ],
        0.04,
        0.32,
        { a: 0.3 },
      );
      ink.poly(
        [
          [split, y0],
          [split, y0 + bh],
        ],
        0.28,
        0.38,
        { a: 0.2, noTip: true },
      );
      for (const [k, y] of [rows[1], rows[2]].entries()) {
        ink.poly(
          [
            [x0, y],
            [x0 + bw, y],
          ],
          0.3 + k * 0.02,
          0.4 + k * 0.02,
          { a: 0.16, noTip: true },
        );
      }
      const narrow = bw < 440;
      const cells: [string, string, number, number][] = [
        ['TITLE', 'blendon · editor extension', x0, 0],
        ['SHEET', '11 of 12', split, 0],
        ['DRAWN', 'editor assemblies only', x0, 1],
        ['SCALE', '1:1', split, 1],
        ['BUILD', '+0 bytes in the player', x0, 2],
        ['REV', `v${VERSION}`, split, 2],
      ];
      cells.forEach(([k, v, x, r], i) => {
        const y = rows[r] + bh / 6 + 4;
        const a = 0.4 + i * 0.06;
        ink.label(k, x + 12, y, a, a + 0.06, { a: 0.42, font: MONO_S });
        ink.label(v, x + (narrow ? 52 : 66), y, a + 0.04, a + 0.16, { a: 0.62, font: narrow ? MONO_S : MONO });
      });
      ink.p = keep;
    }

    if (W < 1180 || !title) return;
    const cx = content.right - 118;
    const top = title.top - sy - 30;
    const hw = 104;
    const hh = 32;
    LAYERS.forEach(([k, v, col, dashed], i) => {
      const cy = top + hh + i * 62;
      const a = 0.06 + i * 0.12;
      ink.poly(
        [
          [cx, cy - hh],
          [cx + hw, cy],
          [cx, cy + hh],
          [cx - hw, cy],
          [cx, cy - hh],
        ],
        a,
        a + 0.26,
        { c: col, hm: col === AMBER ? 0 : 0.9, a: col === AMBER ? 0.5 : 0.2, dash: dashed ? [3, 4] : null },
      );
      ink.poly(
        [
          [cx - hw, cy],
          [cx - hw - 30, cy],
        ],
        a + 0.2,
        a + 0.28,
        { a: 0.24, noTip: true },
      );
      ink.label(k, cx - hw - 38, cy - 3, a + 0.24, a + 0.34, { align: 'right', a: 0.5, font: MONO_S, c: col });
      ink.label(v, cx - hw - 38, cy + 14, a + 0.3, a + 0.44, { align: 'right', font: SERIF_S, a: 0.5 });
    });
    ink.poly(
      [
        [cx + hw, top + hh],
        [cx + hw, top + hh + 124],
      ],
      0.42,
      0.56,
      { a: 0.12, dash: [2, 4], noTip: true },
    );
  },
};
