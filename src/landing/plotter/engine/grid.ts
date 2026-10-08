// The plotting paper: a grid in parallax that bends toward the pen, faded out over the hero.
import { NEUTRAL, rgba } from '../draw.ts';
import { GHOST } from '../path.ts';
import type { PlotState } from './state.ts';

/** How hard the grid bends toward the pen, and the reach of the bend in pixels. */
const WARP_STRENGTH = 30;
const WARP_RADIUS = 130;

export function drawGrid(st: PlotState) {
  const { ctx, W, H, sy, pen, intensity } = st;
  const cell = st.mobile ? 34 : 44;
  const par = sy * 0.3;
  const base = Math.floor(par / cell);
  const y0 = -(par - base * cell);
  const px = pen.x;
  const py = pen.y - sy;
  const sig = WARP_RADIUS;
  const str = st.reduce || pen.kind === GHOST ? 0 : WARP_STRENGTH;
  const reach = sig * 3;
  const penNear = str > 0 && py > -reach && py < H + reach;
  // Straight stretches are filled as rects, far cheaper to raster than strokes; only the stretch near the pen
  // bends, sampled every ~8px into one polyline. Index 0 is minor, 1 major.
  const rects = [new Path2D(), new Path2D()];
  const bent = [new Path2D(), new Path2D()];
  const pt = [0, 0];
  // Lines bend toward the pen like a gravity well.
  const warp = (x: number, y: number) => {
    const dx = x - px;
    const dy = y - py;
    const r2 = dx * dx + dy * dy;
    if (r2 < reach * reach) {
      const k = (str * Math.exp(-r2 / (2 * sig * sig))) / (Math.sqrt(r2) + sig * 0.5);
      x -= dx * k;
      y -= dy * k;
    }
    pt[0] = x;
    pt[1] = y;
  };
  // One grid line at `c` (x of a vertical line, y of a horizontal one).
  const line = (set: number, vertical: boolean, c: number, len: number) => {
    const fill = (a0: number, a1: number) => {
      if (a1 <= a0) return;
      if (vertical) rects[set].rect(c - 0.5, a0, 1, a1 - a0);
      else rects[set].rect(a0, c - 0.5, a1 - a0, 1);
    };
    const n = Math.max(2, Math.ceil(len / 8));
    const step = len / n;
    const along = vertical ? py : px;
    const i0 = Math.max(0, Math.floor((along - reach) / step));
    const i1 = Math.min(n, Math.ceil((along + reach) / step));
    if (!penNear || Math.abs(c - (vertical ? px : py)) >= reach || i1 <= i0) {
      fill(0, len);
      return;
    }
    const at = (i: number) => (vertical ? warp(c, i * step) : warp(i * step, c));
    fill(0, i0 * step);
    at(i0);
    bent[set].moveTo(pt[0], pt[1]);
    for (let i = i0 + 1; i <= i1; i++) {
      at(i);
      bent[set].lineTo(pt[0], pt[1]);
    }
    fill(i1 * step, len);
  };
  for (let x = ((W / 2) % cell) - cell + 0.5; x < W + cell; x += cell)
    line(Math.round((x - W / 2) / cell) % 4 === 0 ? 1 : 0, true, x, H);
  for (let k = -1; ; k++) {
    const y = Math.round(y0 + k * cell) + 0.5;
    if (y > H + cell) break;
    line((base + k) % 4 === 0 ? 1 : 0, false, y, W);
  }
  const alpha = [0.034 * intensity, 0.062 * intensity];
  ctx.lineWidth = 1;
  for (let set = 0; set < 2; set++) {
    const col = rgba(NEUTRAL, alpha[set]);
    ctx.fillStyle = col;
    ctx.fill(rects[set]);
    ctx.strokeStyle = col;
    ctx.stroke(bent[set]);
  }

  // No grid over the hero, where it would fight the scene's own floor; it fades in below.
  const fadeTop = st.heroBottom - sy;
  if (fadeTop > -260) {
    const g = ctx.createLinearGradient(0, fadeTop, 0, fadeTop + 260);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    if (fadeTop > 0) ctx.fillRect(0, 0, W, fadeTop);
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.max(0, fadeTop), W, 260);
    ctx.restore();
  }
}
