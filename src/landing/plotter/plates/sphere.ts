import { AMBER, NEUTRAL, SERIF, SERIF_S, TAU, circlePts, clamp, rgba, type Pt3 } from '../draw.ts';
import type { Plate } from './types.ts';

const LATITUDES = [-60, -30, 0, 30, 60];
const TILT = 0.5;
const ORBIT_R = 1.22;

/** A wire sphere turning with the page, with a camera dot orbiting the selection. */
export const sphere: Plate = {
  animated: true,
  draw({ ink, ctx, sy, t, reduce, title, content }) {
    if (!title) return;
    const r = clamp(content.w * 0.15, 66, 190);
    const cx = content.right - r * 1.02;
    const cy = title.top - sy + r * 0.5;
    const yaw = (reduce ? 0 : t * 0.12) + sy * 0.0012;
    const pit = 0.42;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cp = Math.cos(pit);
    const sp = Math.sin(pit);
    const pr = (x: number, y: number, z: number): Pt3 => {
      const x1 = x * cyw + z * syw;
      const z1 = -x * syw + z * cyw;
      return [cx + x1 * r, cy - (y * cp - z1 * sp) * r, y * sp + z1 * cp];
    };

    ink.poly(circlePts(cx, cy, r, -Math.PI / 2, TAU, 96), 0.02, 0.3, { a: 0.2 });
    LATITUDES.forEach((d, k) => {
      const ph = (d * Math.PI) / 180;
      const pts: Pt3[] = [];
      for (let i = 0; i <= 72; i++) {
        const u = (i / 72) * TAU;
        pts.push([Math.cos(ph) * Math.cos(u), Math.sin(ph), Math.cos(ph) * Math.sin(u)]);
      }
      ink.poly3(pts, pr, 0.08 + k * 0.05, 0.3 + k * 0.05, { a: d === 0 ? 0.24 : 0.15 });
    });
    for (let k = 0; k < 6; k++) {
      const lam = (k * Math.PI) / 6;
      const pts: Pt3[] = [];
      for (let i = 0; i <= 72; i++) {
        const u = (i / 72) * TAU;
        pts.push([Math.cos(u) * Math.cos(lam), Math.sin(u), Math.cos(u) * Math.sin(lam)]);
      }
      ink.poly3(pts, pr, 0.25 + k * 0.04, 0.5 + k * 0.04, { a: 0.13 });
    }
    const orbitAt = (u: number): Pt3 => [
      Math.cos(u) * ORBIT_R,
      Math.sin(u) * Math.sin(TILT) * ORBIT_R,
      Math.sin(u) * Math.cos(TILT) * ORBIT_R,
    ];
    const orbit: Pt3[] = [];
    for (let i = 0; i <= 90; i++) orbit.push(orbitAt((i / 90) * TAU));
    ink.poly3(orbit, pr, 0.55, 0.85, { c: AMBER, hm: 0, a: 0.42, dash: [4, 5], back: 0.4 });

    // The camera rides the orbit, always facing the centre.
    if (ink.p > 0.86) {
      const vis = ink.seg(0.86, 0.95);
      const cam = pr(...orbitAt(reduce ? 0.6 : t * 0.5));
      const dx = cx - cam[0];
      const dy = cy - cam[1];
      const dl = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = rgba(AMBER, 0.45 * vis * ink.I);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cam[0], cam[1]);
      ctx.lineTo(cam[0] + (dx / dl) * 18, cam[1] + (dy / dl) * 18);
      ctx.stroke();
      ink.dot(cam[0], cam[1], 3, AMBER, 0.85 * vis * ink.I);
      ink.spark(cam[0], cam[1], 0.45 * vis);
    }

    ink.poly(
      [
        [cx, cy],
        [cx + r, cy],
      ],
      0.66,
      0.74,
      { a: 0.3, dash: [2, 3], noTip: true },
    );
    if (ink.seg(0.66, 0.74) > 0) ink.dot(cx, cy, 2, NEUTRAL, 0.6 * ink.I);
    ink.label('r = 1.000', cx + r * 0.5, cy - 7, 0.7, 0.82, { align: 'center', a: 0.5 });
    ink.label('θ', cx + r + 10, cy + 4, 0.7, 0.78, { font: SERIF, a: 0.55 });
    ink.label('φ', cx - 4, cy - r - 10, 0.72, 0.8, { font: SERIF, a: 0.55 });
    ink.label('fig. 3 — orbit about the selection', cx + r, cy - r - 30, 0.78, 0.95, {
      font: SERIF_S,
      align: 'right',
      a: 0.5,
    });
  },
};
