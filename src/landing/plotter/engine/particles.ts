// Sparks thrown off the pen and rings of light where it ignites something, in page coordinates.
import { AMBER, HOT, LIME, LIME_HOT, TAU, easeOut, mix, rgba } from '../draw.ts';
import { pageRect } from './page.ts';
import type { PlotState } from './state.ts';

const MAX_SPARKS = 280;
/** Seconds a ring of light takes to spread and fade. */
const FLASH_SECONDS = 0.9;

export function emit(
  st: PlotState,
  x: number,
  y: number,
  n: number,
  spd: number,
  ang: number,
  spread: number,
  up: number,
) {
  const { sparks } = st;
  for (let i = 0; i < n; i++) {
    if (sparks.length > MAX_SPARKS) sparks.shift();
    const a = ang + (Math.random() - 0.5) * spread;
    const v = spd * (0.3 + Math.random() * 0.9);
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - up * Math.random(),
      life: 0.3 + Math.random() * 0.6,
      age: 0,
      g: 520,
    });
  }
}

/** Sparks sprayed from the top of a pressed button, mostly up and out, that fall away down the page. */
export function burstFrom(st: PlotState, el: Element) {
  const { sparks } = st;
  const r = pageRect(el, st.sy);
  for (let i = 0; i < 110; i++) {
    if (sparks.length > MAX_SPARKS) sparks.shift();
    // From a point on the button's outline, mostly up and out, a few straight sideways.
    const u = Math.random();
    const x = r.left + u * r.w;
    const y = r.top + Math.random() * r.h * 0.4;
    const a = -Math.PI / 2 + (u - 0.5) * 2.2 + (Math.random() - 0.5) * 0.6;
    const v = 260 + Math.random() * 520;
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 1.1 + Math.random() * 0.9,
      age: 0,
      g: 1100,
    });
  }
}

export function stepParticles(st: PlotState, dt: number) {
  const { sparks, flashes } = st;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.age += dt;
    if (p.age >= p.life) {
      sparks.splice(i, 1);
      continue;
    }
    p.vy += p.g * dt;
    p.vx *= 1 - 1.6 * dt;
    p.vy *= 1 - 0.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  while (flashes.length && st.t - flashes[0].t > FLASH_SECONDS) flashes.shift();
}

export function drawSparks(st: PlotState) {
  const { ctx: c, sparks, sy, H, tint } = st;
  if (!sparks.length) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.lineWidth = 1;
  for (const p of sparks) {
    const k = 1 - p.age / p.life;
    const y = p.y - sy;
    if (y < -40 || y > H + 40) continue;
    c.strokeStyle = rgba(mix(mix(AMBER, LIME, tint), mix(HOT, LIME_HOT, tint), k * k), k * 0.9);
    c.beginPath();
    c.moveTo(p.x, y);
    c.lineTo(p.x - p.vx * 0.025, y - p.vy * 0.025);
    c.stroke();
  }
  c.restore();
}

/** The spreading rings, drawn by the pen in its own additive pass. */
export function drawFlashes(st: PlotState) {
  const { ctx: c, ink, sprites, flashes, t, sy } = st;
  for (const fl of flashes) {
    const q = (t - fl.t) / FLASH_SECONDS;
    if (q < 0 || q > 1) continue;
    c.strokeStyle = rgba(AMBER, (1 - q) * 0.7);
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(fl.x, fl.y - sy, easeOut(q) * fl.size, 0, TAU);
    c.stroke();
    ink.sprite(sprites.glowL, fl.x, fl.y - sy, 320 * (1 - q * 0.5), 0.5 * (1 - q));
  }
}
