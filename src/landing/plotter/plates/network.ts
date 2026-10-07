import { AMBER, HOT, MONO_S, NEUTRAL, TAU, clamp, easeOut, hash, mix, rgba } from '../draw.ts';
import type { Plate } from './types.ts';

/** Generations of the tree: every tip splits in two at each beat, so the last one has 2^GENS tips. */
const GENS = 8;
const COUNT_FONT = '600 26px "JetBrains Mono", ui-monospace, Consolas, monospace';
/** Points per branch curve. */
const STEPS = 10;
/** Most growing tips given a glow in one frame. */
const MAX_GLOWS = 24;

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

/** A box to keep clear, relative to the root. */
interface Keep {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The tree for one layout, and each generation's finished strokes, built once and reused every frame. */
let cache: { key: string; byGen: Branch[][]; done: Path2D[]; keep: Keep | null } | null = null;

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

const inside = (k: Keep | null, x: number, y: number) => !!k && x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1;

/** Adds a branch up to `q` of its length, lifting the pen wherever it would cross the box to keep clear. */
function trace(pa: Path2D, b: Branch, q: number, keep: Keep | null) {
  let down = false;
  for (let i = 0; i <= STEPS; i++) {
    const [x, y] = along(b, (q * i) / STEPS);
    if (inside(keep, x, y)) down = false;
    else if (down) pa.lineTo(x, y);
    else {
      pa.moveTo(x, y);
      down = true;
    }
  }
}

/**
 * A growing network, set off where the pen flashes beside the section's title and vanishes into it: every
 * beat each tip forks in two at once, sparking as it splits, over faint polar rings. It spreads into the
 * space beside the intro and on round the playground, which hides whatever passes behind it. The whole
 * growth takes under a second; afterwards each generation is a stroke of a path built once.
 */
export const network: Plate = {
  at: 'try-dock',
  station: 'net',
  seconds: 0.8,
  draw({ ink, ctx, sy, W, title, content, anchor, markAt }) {
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
    // The intro's words, in a column as wide as the title's box, stay clear of the branches.
    const intro = anchor('try-intro');
    const keep = intro
      ? { x0: title.left - 16 - ox, y0: intro.top - 16 - o.y, x1: title.right + 16 - ox, y1: intro.bottom + 16 - o.y }
      : null;
    const key = `${unit}|${Math.round(hx)}|${keep ? `${Math.round(keep.x0)},${Math.round(keep.y0)},${Math.round(keep.y1)}` : ''}`;
    if (cache?.key !== key) {
      const branches = grow(unit, hx, hy);
      const byGen = Array.from({ length: GENS }, (_, g) => branches.filter((b) => b.gen === g));
      const done = byGen.map((list) => {
        const pa = new Path2D();
        for (const b of list) trace(pa, b, 1, keep);
        return pa;
      });
      cache = { key, byGen, done, keep };
    }
    const u = ink.p * GENS;
    if (u <= 0) return;

    ctx.save();
    ctx.translate(ox, oy);

    // Polar rings spreading from the root with the tree.
    ctx.lineWidth = 1;
    for (let j = 1; j <= 12; j++) {
      const a = clamp(u * 1.6 - j * 0.9);
      if (a <= 0) break;
      ctx.strokeStyle = rgba(NEUTRAL, 0.055 * a * ink.I);
      ctx.beginPath();
      ctx.arc(0, 0, unit * 0.62 * j, 0, TAU);
      ctx.stroke();
    }

    // Grown generations cool to cream, a little fainter each one out; the growing one burns amber.
    const hot = new Path2D();
    const glows: [number, number][] = [];
    const stars: [number, number, number][] = [];
    for (let gen = 0; gen < GENS; gen++) {
      const age = u - gen;
      if (age <= 0) break;
      const list = cache.byGen[gen];
      if (age >= 1) {
        ctx.lineWidth = gen < 3 ? 1.3 : 1;
        ctx.strokeStyle = rgba(mix(NEUTRAL, HOT, 0.3), (0.66 - gen * 0.04) * ink.I);
        ctx.stroke(cache.done[gen]);
        // Tips just forked flash a short star.
        if (age < 1.6) for (const b of list) if (stars.length < 96) stars.push([b.x1, b.y1, age - 1]);
        continue;
      }
      const q = easeOut(age);
      const every = Math.max(1, Math.ceil(list.length / MAX_GLOWS));
      list.forEach((b, i) => {
        trace(hot, b, q, cache?.keep ?? null);
        if (i % every === 0) glows.push(along(b, q));
      });
    }
    ctx.strokeStyle = rgba(AMBER, 0.85 * ink.I);
    ctx.lineWidth = 1.4;
    ctx.stroke(hot);

    // Stars in one stroke, glows in one batch of sprites.
    if (stars.length) {
      const star = new Path2D();
      for (const [x, y, age] of stars) {
        const r = 4 + age * 10;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU + age * 2;
          star.moveTo(x, y);
          star.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
      }
      const fade = clamp(1 - (stars[0]?.[2] ?? 0) / 0.6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(HOT, 0.6 * fade * ink.I);
      ctx.stroke(star);
    }
    if (glows.length) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, 0.7 * ink.I);
      for (const [x, y] of glows) ctx.drawImage(ink.sprites.glowS, x - 10, y - 10, 20, 20);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // The count of branches, doubling every beat.
    const gen = Math.min(GENS, Math.floor(u));
    const y = title.top - sy;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = MONO_S;
    ctx.fillStyle = rgba(NEUTRAL, 0.5 * ink.I);
    ctx.fillText('BRANCHES', right, y);
    ctx.font = COUNT_FONT;
    ctx.fillStyle = rgba(AMBER, 0.9 * ink.I);
    ctx.fillText(String(2 ** gen).padStart(4, '0'), right, y + 30);
    ctx.font = MONO_S;
    ctx.fillStyle = rgba(NEUTRAL, 0.42 * ink.I);
    ctx.fillText(`n(t) = 2^floor(t/beat)   k = ${gen}`, right, y + 50);
  },
};
