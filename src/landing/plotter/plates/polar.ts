import { AMBER, HOT, MONO, MONO_S, TAU, circlePts, rgba, smooth } from '../draw.ts';
import type { Plate } from './types.ts';

/** Rings in multiples of the pie's radius; the page grid winds into them from outside. */
const RINGS = [0.24, 0.5, 0.78, 1.0, 1.24, 1.6, 2.05, 2.6, 3.3];
/** Sector bounds run out in three steps, each fainter than the last. */
const RAY_STEPS: [number, number, number][] = [
  [0.24, 1.3, 0.12],
  [1.3, 2.4, 0.07],
  [2.4, 3.6, 0.035],
];
/** The radius the pen circles when it lands, as a multiple of the pie's radius. */
export const POLAR_RING = 1.24;

// The sector eases toward the picked item and the angle arc toward the pointer, instead of jumping.
let sector = 0;
let pointer = 0;
let vis = 0;

const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const toward = (from: number, to: number, k: number) => from + turn(from, to) * k;

/**
 * Polar paper around the pie demo, set off by the pen landing in the pie's centre: rings, sector bounds every
 * 45 degrees, angles, a glow where the pie's own ring sits and the sector of the item under the pointer.
 */
export const polar: Plate = {
  station: 'pie',
  warp: true,
  animated: true,
  draw({ ink, ctx, sy, t, anchor, store, reduce, section }) {
    const c = anchor('pie-center');
    if (!c) return;
    const cx = c.cx;
    const cy = c.cy - sy;
    const R = store.pie.radius || 120;
    // Nothing reaches below the section, where the next section's straight grid begins.
    const floor = section.bottom - sy + 40;
    const reach = Math.min(R * 3.6, Math.max(R * 1.4, floor - cy));

    // The pie's ring burns like an accretion disc once the pen has lit it.
    const lit = ink.seg(0, 0.3);
    if (lit > 0) {
      const flick = reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 3.1) * Math.sin(t * 1.7);
      const rc = R * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ink.sprite(ink.sprites.glowL, cx, cy, R * 4, 0.16 * lit * flick * ink.I);
      for (const [w, a] of [
        [14, 0.05],
        [7, 0.1],
        [2, 0.45],
      ]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = rgba(AMBER, a * lit * flick * ink.I);
        ctx.beginPath();
        ctx.arc(cx, cy, rc, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    RINGS.forEach((f, i) => {
      const rr = R * f;
      const fade = 1 - smooth(1.4, 3.6, f) * 0.75;
      // A ring that would cross the floor is drawn as the arc above it.
      const s0 = (floor - cy) / rr;
      if (s0 <= -0.9) return;
      const pts =
        s0 >= 1
          ? circlePts(cx, cy, rr, 0, -TAU, 140)
          : circlePts(cx, cy, rr, Math.PI - Math.asin(s0), Math.PI + 2 * Math.asin(s0), 140);
      ink.poly(pts, 0.02 + i * 0.035, 0.3 + i * 0.035, {
        a: (f === 1 || f === POLAR_RING ? 0.22 : 0.13) * fade,
      });
    });
    for (let k = 0; k < 8; k++) {
      const a = ((k * 45 + 22.5) * Math.PI) / 180;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Rays pointing down stop at the floor.
      const limit = sa > 0.01 ? Math.min(3.6, (floor - cy) / (sa * R)) : 3.6;
      RAY_STEPS.forEach(([r0, r1, alpha], j) => {
        if (r0 >= limit) return;
        const end = Math.min(r1, limit);
        const w0 = 0.25 + k * 0.02 + j * 0.06;
        ink.poly(
          [
            [cx + ca * R * r0, cy + sa * R * r0],
            [cx + ca * R * end, cy + sa * R * end],
          ],
          w0,
          w0 + 0.14,
          { a: alpha, noTip: j > 0, linear: true },
        );
      });
    }
    // Angles as mathematics counts them: counterclockwise from +X.
    for (let k = 0; k < 8; k++) {
      const a = (-k * Math.PI) / 4;
      ink.label(
        `${k * 45}°`,
        cx + Math.cos(a) * R * 1.42,
        cy + Math.sin(a) * R * 1.42 + 3,
        0.5 + k * 0.02,
        0.6 + k * 0.02,
        { align: 'center', a: 0.36, font: MONO_S },
      );
    }

    const { angle, hot } = store.pie;
    const k = reduce ? 1 : 0.25;
    vis += ((hot === null ? 0 : 1) - vis) * (reduce ? 1 : 0.18);
    if (hot !== null) sector = toward(sector, hot, k);
    if (angle !== null) pointer = toward(pointer, angle, k);
    const easing =
      Math.abs((hot === null ? 0 : 1) - vis) > 0.002 ||
      (hot !== null && Math.abs(turn(sector, hot)) > 0.002) ||
      (angle !== null && Math.abs(turn(pointer, angle)) > 0.002);
    const v = vis * ink.seg(0.2, 0.4);
    if (v <= 0.01) return easing;

    // The picked item's sector, fading outward with no edge to stop it.
    const far = Math.min(R * 3.4, Math.max(R * 1.4, reach));
    const a0 = sector - Math.PI / 8;
    const a1 = sector + Math.PI / 8;
    const grad = ctx.createRadialGradient(cx, cy, R * 0.24, cx, cy, far);
    grad.addColorStop(0, rgba(AMBER, 0.11 * v * ink.I));
    grad.addColorStop(0.45, rgba(AMBER, 0.05 * v * ink.I));
    grad.addColorStop(1, rgba(AMBER, 0));
    ctx.beginPath();
    ctx.arc(cx, cy, far, a0, a1);
    ctx.arc(cx, cy, R * 0.24, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    const edge = ctx.createRadialGradient(cx, cy, R * 0.24, cx, cy, far);
    edge.addColorStop(0, rgba(AMBER, 0.45 * v * ink.I));
    edge.addColorStop(1, rgba(AMBER, 0));
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();

    // The pointer's angle on the ring the pen drew.
    const th = (((-pointer % TAU) + TAU) % TAU) * (180 / Math.PI);
    ctx.beginPath();
    ctx.arc(cx, cy, R * POLAR_RING, 0, pointer, true);
    ctx.strokeStyle = rgba(AMBER, 0.55 * v * ink.I);
    ctx.stroke();
    const ex = cx + Math.cos(pointer) * R * POLAR_RING;
    const ey = cy + Math.sin(pointer) * R * POLAR_RING;
    ink.dot(ex, ey, 2.5, AMBER, 0.9 * v * ink.I);
    const left = Math.cos(pointer) < -0.2;
    ctx.font = MONO;
    ctx.textAlign = left ? 'right' : 'left';
    ctx.fillStyle = rgba(HOT, 0.75 * v * ink.I);
    ctx.fillText(`θ = ${Math.round(th)}°`, ex + (left ? -10 : 10), ey - 8);
    return easing;
  },
};
