import { AMBER, HOT, Ink, MONO, MONO_S, TAU, circlePts, rgba, smooth, type Sprites } from '../draw.ts';
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
/** Plate progress from which the rings, bounds and angles are drawn and cooled, so they stop changing. */
const SETTLED = 0.9;
/** How far the paper reaches from the pie's centre, in multiples of its radius. */
const EXTENT = 3.6;

// The sector eases toward the picked item and the angle arc toward the pointer, instead of jumping.
let sector = 0;
let pointer = 0;
let vis = 0;
let glow = -1;
/** The settled paper, kept as an image and copied while the pie is on screen. */
let paper: { key: string; img: HTMLCanvasElement; o: number } | null = null;

const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const toward = (from: number, to: number, k: number) => from + turn(from, to) * k;

/**
 * The pie's ring burning like an accretion disc, painted once into a square `size` px wide (four radii):
 * the page shows it in a layer of its own, lit and flickering through its opacity.
 */
export function paintGlow(ctx: CanvasRenderingContext2D, sprites: Sprites, size: number, R: number) {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.16;
  ctx.drawImage(sprites.glowL, 0, 0, size, size);
  ctx.globalAlpha = 1;
  for (const [w, a] of [
    [14, 0.05],
    [7, 0.1],
    [2, 0.45],
  ]) {
    ctx.lineWidth = w;
    ctx.strokeStyle = rgba(AMBER, a);
    ctx.beginPath();
    ctx.arc(c, c, R * 0.25, 0, TAU);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Rings, sector bounds every 45 degrees and their angles, none of them crossing `floor`. */
function drawPaper(ink: Ink, cx: number, cy: number, R: number, floor: number) {
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
    const limit = sa > 0.01 ? Math.min(EXTENT, (floor - cy) / (sa * R)) : EXTENT;
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
}

/** The settled paper in a canvas of its own, centred `o` CSS px from its left and top edges. */
function bakePaper(ink: Ink, R: number, below: number, dpr: number, key: string) {
  const o = R * EXTENT + 16;
  const bottom = Math.max(16, Math.min(o, below + 16));
  const img = document.createElement('canvas');
  img.width = Math.ceil(2 * o * dpr);
  img.height = Math.ceil((o + bottom) * dpr);
  const g = img.getContext('2d');
  if (g) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const local = new Ink(g, ink.sprites);
    local.p = 1;
    local.I = ink.I;
    drawPaper(local, o, o, R, o + below);
  }
  return { key, img, o };
}

/**
 * Polar paper around the pie demo, set off by the pen landing in the pie's centre: rings, sector bounds every
 * 45 degrees, angles and the sector of the item under the pointer. The glow on the pie's own ring is a layer
 * of the page (see `paintGlow`); the plate only lights it.
 */
export const polar: Plate = {
  station: 'pie',
  warp: true,
  draw({ ink, ctx, sy, anchor, store, reduce, section, dpr, epoch }) {
    const c = anchor('pie-center');
    if (!c) return;
    const cx = c.cx;
    const cy = c.cy - sy;
    const R = store.pie.radius || 120;
    // Nothing reaches below the section, where the next section's straight grid begins.
    const floor = section.bottom - sy + 40;
    const reach = Math.min(R * EXTENT, Math.max(R * 1.4, floor - cy));

    const lit = Math.round(ink.seg(0, 0.3) * ink.I * 1000) / 1000;
    if (store.pie.glow && lit !== glow) {
      store.pie.glow.style.setProperty('--glow', String(lit));
      store.pie.glow.toggleAttribute('data-lit', lit > 0);
      glow = lit;
    }

    if (ink.p < SETTLED) drawPaper(ink, cx, cy, R, floor);
    else {
      // Page coordinates, so scrolling never invalidates it.
      const below = Math.round((section.bottom + 40 - c.cy) * 4) / 4;
      const key = `${R}|${below}|${dpr}|${ink.I}|${epoch}`;
      if (paper?.key !== key) paper = bakePaper(ink, R, below, dpr, key);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(paper.img, Math.round((cx - paper.o) * dpr), Math.round((cy - paper.o) * dpr));
      ctx.restore();
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
