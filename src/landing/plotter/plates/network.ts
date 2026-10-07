import { AMBER, HOT, MONO_S, NEUTRAL, TAU, clamp, easeOut, hash, mix, rgba } from '../draw.ts';
import type { Plate } from './types.ts';

/** Generations of the tree: every tip splits in two at each beat, so the last one has 2^GENS tips. */
const GENS = 8;
const COUNT_FONT = '600 26px "JetBrains Mono", ui-monospace, Consolas, monospace';

/** One branch, relative to the root: from its parent's tip, bent through a control point, to its own tip. */
interface Branch {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  gen: number;
}

let cache: { key: string; branches: Branch[] } | null = null;

/**
 * A fixed, branching tree: a trunk from the root to the hub `(hx, hy)`, then every tip forks outward from
 * the hub at a varying angle and length, so the net spreads round it evenly and reads as grown, not drawn.
 */
function grow(unit: number, hx: number, hy: number): Branch[] {
  const out: Branch[] = [];
  const push = (x0: number, y0: number, x1: number, y1: number, gen: number, id: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    // A slight bend, one way or the other.
    const bend = (hash(id * 1.9) - 0.5) * 0.3 * len;
    out.push({
      x0,
      y0,
      cx: (x0 + x1) / 2 - Math.sin(a) * bend,
      cy: (y0 + y1) / 2 + Math.cos(a) * bend,
      x1,
      y1,
      gen,
    });
  };
  push(0, 0, hx, hy, 0, 1);
  const trunk = Math.atan2(hy, hx);
  let tips = [{ x: hx, y: hy, a: trunk, id: 1 }];
  for (let gen = 1; gen < GENS; gen++) {
    const next: typeof tips = [];
    for (const t of tips) {
      // Half the tip's own heading, half straight out from the hub; the first fork opens widest.
      const out0 = gen === 1 ? t.a : Math.atan2(t.y - hy, t.x - hx);
      const base = gen === 1 ? t.a : out0 + 0.5 * Math.atan2(Math.sin(t.a - out0), Math.cos(t.a - out0));
      for (const side of [-1, 1]) {
        const id = t.id * 2 + (side > 0 ? 1 : 0);
        const spread = gen === 1 ? 1.25 : 0.38 + 0.32 * hash(id * 3.1);
        const a = base + side * spread;
        // Short near the hub, so it fills the space there, longer further out, so it reaches round the playground.
        const len = unit * (0.45 + gen * 0.16) * (0.75 + 0.5 * hash(id * 7.7));
        const x1 = t.x + Math.cos(a) * len;
        const y1 = t.y + Math.sin(a) * len;
        push(t.x, t.y, x1, y1, gen, id);
        next.push({ x: x1, y: y1, a, id });
      }
    }
    tips = next;
  }
  return out;
}

/** A point `q` of the way along a branch's curve. */
const along = (b: Branch, q: number): [number, number] => {
  const m = 1 - q;
  return [m * m * b.x0 + 2 * m * q * b.cx + q * q * b.x1, m * m * b.y0 + 2 * m * q * b.cy + q * q * b.y1];
};

/**
 * A growing network, set off where the pen flashes beside the section's title: every beat each tip forks in
 * two at once, sparking as it splits, over faint polar rings. It spreads into the space beside the intro and
 * on round the playground, which hides whatever passes behind it.
 */
export const network: Plate = {
  at: 'try-dock',
  station: 'net',
  seconds: 4.2,
  draw({ ink, ctx, sy, W, H, title, content, anchor, markAt }) {
    if (!title) return;
    const o = markAt('net') ?? { x: content.right - 140, y: title.top + 60 };
    const ox = o.x;
    const oy = o.y - sy;
    const unit = clamp(content.w * 0.09, 60, 120);
    // The section spans the page; its words run in the column the title starts, mirrored on the right.
    const right = W - title.left;
    // The hub sits in the middle of the space right of the root, as far as that edge.
    const hx = Math.max(60, (right - ox) * 0.5);
    const hy = 30;
    const key = `${unit}|${Math.round(hx)}`;
    if (cache?.key !== key) cache = { key, branches: grow(unit, hx, hy) };
    const u = ink.p * GENS;
    if (u <= 0) return;

    ctx.save();
    // Kept off the intro's words, which run in a column as wide as the title's box.
    const intro = anchor('try-intro');
    if (intro) {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(title.left - 16, intro.top - sy - 16, title.w + 32, intro.h + 32);
      ctx.clip('evenodd');
    }

    // Polar rings spreading from the root with the tree.
    ctx.lineWidth = 1;
    for (let j = 1; j <= 12; j++) {
      const a = clamp(u * 1.6 - j * 0.9);
      if (a <= 0) break;
      ctx.strokeStyle = rgba(NEUTRAL, 0.055 * a * ink.I);
      ctx.beginPath();
      ctx.arc(ox, oy, unit * 0.62 * j, 0, TAU);
      ctx.stroke();
    }

    // Grown branches cool to cream, a little fainter each generation out; the growing ones burn amber.
    const cool = Array.from({ length: GENS }, () => new Path2D());
    const hot = new Path2D();
    const tips: [number, number, number][] = [];
    for (const b of cache.branches) {
      const q = easeOut(clamp(u - b.gen));
      if (q <= 0) continue;
      const pa = q < 1 ? hot : cool[b.gen];
      pa.moveTo(ox + b.x0, oy + b.y0);
      const n = 10;
      for (let i = 1; i <= n; i++) {
        const [x, y] = along(b, (q * i) / n);
        pa.lineTo(ox + x, oy + y);
      }
      if (q < 1 || u - b.gen < 1.5) tips.push([ox + along(b, q)[0], oy + along(b, q)[1], u - b.gen]);
    }
    cool.forEach((pa, gen) => {
      ctx.lineWidth = gen < 3 ? 1.3 : 1;
      ctx.strokeStyle = rgba(mix(NEUTRAL, HOT, 0.3), (0.66 - gen * 0.04) * ink.I);
      ctx.stroke(pa);
    });
    ctx.strokeStyle = rgba(AMBER, 0.85 * ink.I);
    ctx.lineWidth = 1.4;
    ctx.stroke(hot);

    // A glowing tip while it grows, then a short star as it forks.
    ctx.lineWidth = 1;
    for (const [x, y, age] of tips) {
      if (age < 1) {
        ink.spark(x, y, 0.7);
        continue;
      }
      const k = 1 - (age - 1) / 0.5;
      if (k <= 0) continue;
      ctx.strokeStyle = rgba(HOT, 0.7 * k * ink.I);
      ctx.beginPath();
      for (let r = 0; r < 5; r++) {
        const a = (r / 5) * TAU + age;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 9 * (1.4 - k), y + Math.sin(a) * 9 * (1.4 - k));
      }
      ctx.stroke();
      ink.spark(x, y, 0.5 * k);
    }
    ctx.restore();

    // The count of branches, doubling every beat.
    const gen = Math.min(GENS, Math.floor(u));
    const x = right;
    const y = title.top - sy;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = MONO_S;
    ctx.fillStyle = rgba(NEUTRAL, 0.5 * ink.I);
    ctx.fillText('BRANCHES', x, y);
    ctx.font = COUNT_FONT;
    ctx.fillStyle = rgba(AMBER, 0.9 * ink.I);
    ctx.fillText(String(2 ** gen).padStart(4, '0'), x, y + 30);
    ctx.font = MONO_S;
    ctx.fillStyle = rgba(NEUTRAL, 0.42 * ink.I);
    ctx.fillText(`n(t) = 2^floor(t/beat)   k = ${gen}`, x, y + 50);
  },
};
