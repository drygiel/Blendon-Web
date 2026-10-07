import { SHORTCUTS } from '../../data/content.ts';
import { AMBER, NEUTRAL, SERIF_S, rgba, smooth } from '../draw.ts';
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

/** Every default as key presses on this keyboard, modifiers first: Ctrl + Num 1 / Num 3 is two presses. */
function presses(): number[][] {
  const at = new Map<string, number>();
  KEYS.forEach(([label], i) => at.has(label) || at.set(label, i));
  const out: number[][] = [];
  for (const [, tokens] of SHORTCUTS) {
    const alts: string[][] = [[]];
    for (const tk of tokens) {
      if (tk === '~/') alts.push([]);
      else alts[alts.length - 1].push(tk);
    }
    for (const alt of alts) {
      const plus = alt.indexOf('~+');
      const mods = (plus < 0 ? [] : alt.slice(0, plus)).flatMap((k) => at.get(k) ?? []);
      if (plus > 0 && mods.length < plus) continue;
      for (const k of alt.slice(plus + 1)) {
        const i = at.get(k);
        if (i !== undefined) out.push([...mods, i]);
      }
    }
  }
  return out;
}

const PRESSES = presses();
/** Seconds per press: keys go down one after another, stay held, then come up and rest. */
const PRESS = 2.6;

/** How far each key of the current press is down, 0 to 1, at time `t`. */
function pressed(t: number): Map<number, number> {
  const out = new Map<number, number>();
  if (!PRESSES.length) return out;
  const keys = PRESSES[Math.floor(t / PRESS) % PRESSES.length];
  const u = t % PRESS;
  const up = 1 - smooth(1.5, 1.95, u);
  keys.forEach((k, j) => out.set(k, smooth(0.15 + j * 0.24, 0.4 + j * 0.24, u) * up));
  return out;
}

/** The keyboard, drawn row by row; every key with a Blendon default is lit, then they are pressed in turn. */
export const keyboard: Plate = {
  animated: true,
  draw({ ink, ctx, sy, t, reduce, W, title, content }) {
    if (!title || W < 1100) return;
    const width = Math.min(430, content.w * 0.36);
    const u = width / WIDTH;
    const x0 = content.right - width;
    const y0 = title.top - sy - 34;
    const gap = Math.max(1.5, u * 0.12);
    const down = ink.p > 0.98 && !reduce ? pressed(t) : null;
    KEYS.forEach(([label, kx, ky, kw, kh], i) => {
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
      // A pressed key glows and sinks a pixel into its outline.
      const k = down?.get(i) ?? 0;
      if (k > 0.01) {
        const d = 1.2 * k;
        ctx.fillStyle = rgba(AMBER, 0.24 * k * ink.I);
        ctx.fillRect(x + d, y + d, w - 2 * d, h - 2 * d);
        ctx.strokeStyle = rgba(AMBER, 0.7 * k * ink.I);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + d + 0.5, y + d + 0.5, w - 2 * d - 1, h - 2 * d - 1);
      }
    });
    ink.label('fig. 10 — every default, lit', x0 + width, y0 + 5 * u + 22, 0.7, 0.9, {
      font: SERIF_S,
      align: 'right',
      a: 0.5,
    });
  },
};
