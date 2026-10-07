import { AMBER, HOT, MONO, MONO_S, TAU, circlePts, rgba } from '../draw.ts';
import type { Plate } from './types.ts';

const RINGS = [0.24, 0.5, 0.78, 1.0, 1.24, 1.6, 2.0];

// The sector eases toward the picked item and the angle arc toward the pointer, instead of jumping.
let sector = 0;
let pointer = 0;
let vis = 0;

const toward = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;

/** Polar paper behind the pie demo: rings, sector bounds every 45 degrees, angles, and the pointer's sector. */
export const polar: Plate = {
  at: 'pie-stage',
  animated: true,
  draw({ ink, ctx, sy, anchor, store, reduce }) {
    const c = anchor('pie-center');
    const stage = anchor('pie-stage');
    if (!c || !stage) return;
    const cx = c.cx;
    const cy = c.cy - sy;
    const R = store.pie.radius || stage.h * 0.38;
    ctx.save();
    ctx.beginPath();
    ctx.rect(stage.left, stage.top - sy, stage.w, stage.h);
    ctx.clip();

    RINGS.forEach((f, i) => {
      ink.poly(circlePts(cx, cy, R * f, -Math.PI / 2, TAU, 120), 0.04 + i * 0.04, 0.3 + i * 0.04, {
        a: f === 1 ? 0.2 : 0.11,
      });
    });
    for (let k = 0; k < 8; k++) {
      const a = ((k * 45 + 22.5) * Math.PI) / 180;
      ink.poly(
        [
          [cx + Math.cos(a) * R * 0.24, cy + Math.sin(a) * R * 0.24],
          [cx + Math.cos(a) * R * 2.6, cy + Math.sin(a) * R * 2.6],
        ],
        0.28 + k * 0.025,
        0.46 + k * 0.025,
        { a: 0.1 },
      );
    }
    // Angles as mathematics counts them: counterclockwise from +X.
    for (let k = 0; k < 8; k++) {
      const a = (-k * Math.PI) / 4;
      ink.label(
        `${k * 45}°`,
        cx + Math.cos(a) * R * 1.42,
        cy + Math.sin(a) * R * 1.42 + 3,
        0.45 + k * 0.02,
        0.55 + k * 0.02,
        {
          align: 'center',
          a: 0.36,
          font: MONO_S,
        },
      );
    }

    const { angle, hot } = store.pie;
    const k = reduce ? 1 : 0.25;
    vis += ((hot === null ? 0 : 1) - vis) * (reduce ? 1 : 0.18);
    if (hot !== null) sector = toward(sector, hot, k);
    if (angle !== null) pointer = toward(pointer, angle, k);
    const v = vis * ink.seg(0.55, 0.75);
    if (v > 0.01) {
      const a0 = sector - Math.PI / 8;
      const a1 = sector + Math.PI / 8;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 2.6, a0, a1);
      ctx.arc(cx, cy, R * 0.24, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = rgba(AMBER, 0.07 * v * ink.I);
      ctx.fill();
      ctx.strokeStyle = rgba(AMBER, 0.34 * v * ink.I);
      ctx.lineWidth = 1;
      ctx.stroke();
      // The pointer's angle, counted as mathematics does, counterclockwise from +X.
      const th = (((-pointer % TAU) + TAU) % TAU) * (180 / Math.PI);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.24, 0, pointer, true);
      ctx.strokeStyle = rgba(AMBER, 0.55 * v * ink.I);
      ctx.stroke();
      const ex = cx + Math.cos(pointer) * R * 1.24;
      const ey = cy + Math.sin(pointer) * R * 1.24;
      ink.dot(ex, ey, 2.5, AMBER, 0.9 * v * ink.I);
      const left = Math.cos(pointer) < -0.2;
      ctx.font = MONO;
      ctx.textAlign = left ? 'right' : 'left';
      ctx.fillStyle = rgba(HOT, 0.75 * v * ink.I);
      ctx.fillText(`θ = ${Math.round(th)}°`, ex + (left ? -10 : 10), ey - 8);
    }
    ctx.restore();
  },
};
