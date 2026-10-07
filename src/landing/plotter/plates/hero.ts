import {
  AMBER,
  BLUE,
  GREEN,
  NEUTRAL,
  RED,
  TAU,
  camera,
  circlePts,
  easeOut,
  hash,
  rgba,
  smooth,
  type Pt,
} from '../draw.ts';
import type { Plate } from './types.ts';

/** Where the hero scene sits in its stage, as a share of the stage height. */
export const HERO_ORIGIN_Y = 0.5;

const N = 7;
const S = 0.6;
const HGT = 1.2;
const V: [number, number, number][] = [
  [-S, 0, -S],
  [S, 0, -S],
  [S, 0, S],
  [-S, 0, S],
  [-S, HGT, -S],
  [S, HGT, -S],
  [S, HGT, S],
  [-S, HGT, S],
];
const E: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
];
const CODE: [string, number, number][] = [
  ['% plot: "rewire the Scene view"', 0.02, 0.12],
  ['\\draw[axes] (-9,0,0) -- (9,0,0);', 0.1, 0.2],
  ['\\draw[grid] (-7,-7) grid (7,7);', 0.18, 0.32],
  ['\\draw[selected] (0,0,0) cube (1.2);', 0.38, 0.5],
  ['\\draw[gizmo=move] (0,0.6,0);', 0.6, 0.7],
  ['\\draw[dim] (0,0) -- (2,0) node{2.000 m};', 0.72, 0.84],
  ['\\orbit[pivot=selection] r = 2.2;', 0.8, 0.94],
];

/** The Scene view as a plotter draws it: floor, axes, the selected cube, its gizmo, a typed move and the orbit. */
export const hero: Plate = {
  animated: true,
  intro: true,
  draw({ ink, ctx, sy, t, mobile, reduce, anchor, W }) {
    const g = anchor('hero-stage');
    if (!g) return;
    const cx = g.cx;
    const cy = g.top + g.h * HERO_ORIGIN_Y - sy;
    const scale = Math.min(g.w, 1240) * (mobile ? 1.1 : 0.94);
    const spin = reduce ? 0 : 0.035 * Math.max(0, t - 1.8) + sy * 0.0007;
    const pr = camera(cx, cy, scale, 10, 0.62 + spin, 0.36);
    // The floor and axes fade out before the stage ends, so they never cross the next section's title.
    const bottom = g.bottom - sy;
    const keep = (y: number) => 1 - smooth(bottom - 150, bottom + 10, y);
    const at = (x: number, y: number, z: number): Pt => {
      const p = pr(x, y, z);
      return [p[0], p[1]];
    };

    // Ignition: rays burst from the origin, then die away.
    const qr = ink.seg(0, 0.2);
    const fade = 1 - ink.seg(0.16, 0.42);
    if (qr > 0 && fade > 0) {
      ctx.strokeStyle = rgba(AMBER, 0.5 * fade * ink.I);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU + 0.1;
        const len = easeOut(qr) * Math.min(g.w * 0.55, 560) * (0.55 + 0.45 * hash(k));
        ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      }
      ctx.stroke();
    }

    // Floor grid, growing outward and fading with distance; bucketed by alpha to keep stroke calls few.
    const buckets = Array.from({ length: 8 }, () => new Path2D());
    for (let i = -N; i <= N; i++) {
      if (!i) continue;
      const q = easeOut(ink.seg(0.16 + Math.abs(i) * 0.022, 0.46 + Math.abs(i) * 0.022));
      if (q <= 0) continue;
      const ext = q * N;
      for (let axis = 0; axis < 2; axis++) {
        let prev: Pt | null = null;
        for (let j = 0; j <= 28; j++) {
          const u = -ext + (2 * ext * j) / 28;
          const x = axis ? i : u;
          const z = axis ? u : i;
          const p = at(x, 0, z);
          if (prev) {
            const f = (1 - smooth(2.6, 6.6, Math.hypot(x, z))) * keep(p[1]);
            if (f > 0.03) {
              const pa = buckets[Math.min(7, (f * 8) | 0)];
              pa.moveTo(prev[0], prev[1]);
              pa.lineTo(p[0], p[1]);
            }
          }
          prev = p;
        }
      }
    }
    ctx.lineWidth = 1;
    buckets.forEach((pa, bi) => {
      ctx.strokeStyle = rgba(NEUTRAL, ((bi + 0.5) / 8) * 0.17 * ink.I);
      ctx.stroke(pa);
    });

    // World axes, X red and Z blue, as in the Scene view.
    const qa = easeOut(ink.seg(0.1, 0.42));
    if (qa > 0) {
      for (const [col, dx, dz] of [
        [RED, 1, 0],
        [BLUE, 0, 1],
      ] as const) {
        const pa = Array.from({ length: 6 }, () => new Path2D());
        const ext = qa * 9;
        let prev: Pt | null = null;
        for (let j = 0; j <= 36; j++) {
          const u = -ext + (2 * ext * j) / 36;
          const p = at(dx * u, 0, dz * u);
          if (prev) {
            const f = (1 - smooth(3, 8.5, Math.abs(u))) * keep(p[1]);
            if (f > 0.03) {
              const b = pa[Math.min(5, (f * 6) | 0)];
              b.moveTo(prev[0], prev[1]);
              b.lineTo(p[0], p[1]);
            }
          }
          prev = p;
        }
        ctx.lineWidth = 1.2;
        pa.forEach((x, bi) => {
          ctx.strokeStyle = rgba(col, ((bi + 0.5) / 6) * 0.55 * ink.I);
          ctx.stroke(x);
        });
      }
    }

    // The selected cube, outlined amber as Blender outlines a selection, and its ghost 2 m along X.
    E.forEach(([a, b], k) => {
      ink.poly([at(...V[a]), at(...V[b])], 0.38 + k * 0.017, 0.44 + k * 0.017, {
        c: AMBER,
        hm: 0,
        a: 0.55,
        hb: 0.5,
        w: 1.3,
      });
    });
    E.forEach(([a, b]) => {
      const A = at(V[a][0] + 2, V[a][1], V[a][2]);
      const B = at(V[b][0] + 2, V[b][1], V[b][2]);
      ink.poly([A, B], 0.6, 0.72, { a: 0.22, dash: [3, 4], noTip: true });
    });

    // Move gizmo at the cube's centre.
    const O = at(0, 0.6, 0);
    const arms = [
      [RED, at(1.25, 0.6, 0)],
      [GREEN, at(0, 1.95, 0)],
      [BLUE, at(0, 0.6, 1.25)],
    ] as const;
    arms.forEach(([col, end], k) => {
      ink.poly([O, end], 0.62 + k * 0.03, 0.7 + k * 0.03, {
        c: col,
        hm: 0.2,
        a: 0.8,
        hb: 0.3,
        w: 1.6,
        arrow: true,
        arrowSize: 8,
      });
    });
    ink.poly(circlePts(O[0], O[1], 9, 0, TAU, 32), 0.6, 0.7, { a: 0.5, noTip: true });

    // The 2.000 m typed after G, X.
    const dy = 1.8;
    const D0 = at(0, dy, 0);
    const D1 = at(2, dy, 0);
    ink.poly([at(0, 1.3, 0), at(0, dy + 0.14, 0)], 0.72, 0.78, { a: 0.3, dash: [2, 3], noTip: true });
    ink.poly([at(2, 1.3, 0), at(2, dy + 0.14, 0)], 0.73, 0.79, { a: 0.3, dash: [2, 3], noTip: true });
    ink.poly([D0, D1], 0.74, 0.84, { c: RED, hm: 0.3, a: 0.6, arrow: true, arrowSize: 6 });
    if (ink.seg(0.74, 0.84) >= 1) {
      ink.arrowHead(D0[0], D0[1], Math.atan2(D0[1] - D1[1], D0[0] - D1[0]), 6, RED, 0.6 * ink.I);
    }
    ink.label('Δx  2.000 m', (D0[0] + D1[0]) / 2, (D0[1] + D1[1]) / 2 - 10, 0.8, 0.93, { align: 'center', a: 0.7 });

    // Orbit about the selection.
    const orb: Pt[] = [];
    for (let k = 0; k <= 80; k++) {
      const a = 2.6 + (k / 80) * TAU * 0.86;
      orb.push(at(Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2));
    }
    ink.poly(orb, 0.78, 0.98, { c: AMBER, hm: 0, a: 0.3, hb: 1, dash: [5, 6], arrow: true, arrowSize: 8 });
    if (!mobile) {
      ink.label('orbit · pivot = selection', orb[0][0] - 12, orb[0][1] + 22, 0.86, 0.99, { align: 'right', a: 0.5 });
    }

    // TikZ-like source, typed in step with the drawing.
    if (W >= 1000) {
      CODE.forEach(([str, a, b], i) => ink.label(str, g.right - 300, g.top - sy + 24 + i * 17, a, b, { a: 0.34 }));
    }
  },
};
