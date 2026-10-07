import { SHORTCUTS } from '../../data/content.ts';
import { AMBER, NEUTRAL, SERIF_S, rgba } from '../draw.ts';
import type { Plate } from './types.ts';

type Key = [label: string, x: number, y: number, w: number, h: number];

// A full-size layout in key units: main block, a nav pair and the numpad. Labels match the shortcut tokens.
function layout(): Key[] {
  const keys: Key[] = [];
  const row = (y: number, x0: number, spec: (string | [string, number])[]) => {
    let x = x0;
    for (const s of spec) {
      const [label, w] = typeof s === 'string' ? [s, 1] : s;
      keys.push([label, x, y, w, 1]);
      x += w;
    }
  };
  row(0, 0, ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', ['Backspace', 2]]);
  row(1, 0, [['Tab', 1.5], 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', ['\\', 1.5]]);
  row(2, 0, [['Caps', 1.75], 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", ['Enter', 2.25]]);
  row(3, 0, [['Shift', 2.25], 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', ['Shift', 2.75]]);
  row(4, 0, [
    ['Ctrl', 1.25],
    ['Win', 1.25],
    ['Alt', 1.25],
    ['Space', 6.25],
    ['Alt', 1.25],
    ['Fn', 1.25],
    ['Menu', 1.25],
    ['Ctrl', 1.25],
  ]);
  row(0, 15.4, ['Ins', 'Home', 'PgUp']);
  row(1, 15.4, ['Del', 'End', 'PgDn']);
  row(0, 18.8, ['Num Lock', 'Num /', 'Num *', 'Num −']);
  row(1, 18.8, ['Num 7', 'Num 8', 'Num 9']);
  row(2, 18.8, ['Num 4', 'Num 5', 'Num 6']);
  row(3, 18.8, ['Num 1', 'Num 2', 'Num 3']);
  row(4, 18.8, [['Num 0', 2], 'Num .']);
  keys.push(['Num +', 21.8, 1, 1, 2], ['Num Enter', 21.8, 3, 1, 2]);
  return keys;
}

const KEYS = layout();
const WIDTH = 22.8;
const LIT = new Set(SHORTCUTS.flatMap(([, tokens]) => tokens));

/** The keyboard, drawn row by row; every key with a Blendon default is lit. */
export const keyboard: Plate = {
  draw({ ink, ctx, sy, W, title, content }) {
    if (!title || W < 1100) return;
    const width = Math.min(430, content.w * 0.36);
    const u = width / WIDTH;
    const x0 = content.right - width;
    const y0 = title.top - sy - 34;
    const gap = Math.max(1.5, u * 0.12);
    for (const [label, kx, ky, kw, kh] of KEYS) {
      const lit = LIT.has(label);
      const a = 0.04 + ky * 0.08 + (kx / WIDTH) * 0.18;
      const x = x0 + kx * u + gap / 2;
      const y = y0 + ky * u + gap / 2;
      const w = kw * u - gap;
      const h = kh * u - gap;
      ink.poly(
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
          [x, y],
        ],
        a,
        a + 0.12,
        { c: lit ? AMBER : NEUTRAL, hm: lit ? 0 : 0.9, a: lit ? 0.5 : 0.13, noTip: true, linear: true },
      );
      if (lit && ink.seg(a, a + 0.12) >= 1) {
        ctx.fillStyle = rgba(AMBER, 0.08 * ink.I);
        ctx.fillRect(x, y, w, h);
      }
    }
    ink.label('fig. 10 — every default, lit', x0 + width, y0 + 5 * u + 22, 0.7, 0.9, {
      font: SERIF_S,
      align: 'right',
      a: 0.5,
    });
  },
};
