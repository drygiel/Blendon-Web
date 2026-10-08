// The pen: where it heads along its path, how it gets there, and how it is drawn.
import { AMBER, TAU, WHITE, clamp, easeInOut, easeOut, rgba } from '../draw.ts';
import { FINALE, GHOST, INTRO_END, JUMP, UP, WRITE, bAtScroll, introS, posAt, sAtB, sAtY } from '../path.ts';
import { drawFlashes, emit } from './particles.ts';
import { onScreenY, type PlotState } from './state.ts';

/** Seconds the pen takes to circle a station once it lands. */
const RING_SECONDS = 1.2;
/** Once its journey is over, the pen circles the final button this many radians a second, a comet's tail behind. */
const ORBIT_SPEED = TAU / 14;
export const ORBIT_TAIL = 2.2;

/** Arc length the scroll position asks for. */
export const scrollTarget = (st: PlotState) => (st.path ? sAtB(st.path, bAtScroll(st.kfs, st.sy)) : 0);

/** Arc length on the rail level with the hovered element's first row, within its section's stretch. */
export function holdS(st: PlotState): number | null {
  const { hold, path, titles } = st;
  if (!hold || !path) return null;
  if (hold.epoch !== st.epoch) {
    hold.epoch = st.epoch;
    hold.s = null;
    const sec = hold.el.closest('section');
    const k = titles.findIndex((s) => s.section === sec);
    const run = titles[k]?.run;
    if (run) {
      const r = (hold.el.querySelector(':scope > summary') ?? hold.el).getBoundingClientRect();
      const end = titles[k + 1]?.run?.i0 ?? path.n - 1;
      hold.s = sAtY(path, r.top + st.sy + r.height / 2, run.i1, end);
    }
  }
  return hold.s;
}

/** Where the pen heads: along the scroll, unless it circles a station or holds at a hovered element. */
function penTarget(st: PlotState): number {
  if (!st.path) return 0;
  let target = scrollTarget(st);
  if (st.ring) {
    const name = st.ring.name;
    const s = st.stations.find((x) => x.name === name);
    const q = clamp((st.t - st.ring.t0) / RING_SECONDS);
    if (s && q < 1 && onScreenY(st, s.cy)) return s.s0 + (s.s1 - s.s0) * easeInOut(q);
    st.ring = null;
    st.ringFloor = s ? name : null;
  }
  if (st.ringFloor) {
    const s = st.stations.find((x) => x.name === st.ringFloor);
    if (!s || target < s.sJump) st.ringFloor = null;
    else target = Math.max(target, s.s1);
  }
  return holdS(st) ?? target;
}

export function updatePen(st: PlotState, dt: number) {
  const { path, pen, t } = st;
  if (!path || st.reduce) return;
  let target: number;
  let follow = st.introDone;
  if (!st.introDone) {
    target = introS(path, t);
    if (t >= INTRO_END) st.introDone = true;
  } else {
    target = penTarget(st);
    // The circle is already paced by time, so the pen takes it as given.
    if (st.ring) follow = false;
  }
  const prev = pen.s;
  const diff = target - prev;
  pen.s = follow ? prev + diff * (1 - Math.exp(-dt * (6 + Math.min(24, Math.abs(diff) / 250)))) : target;
  pen.v = (pen.s - prev) / Math.max(dt, 1e-3);
  const q = posAt(path, pen.s);
  pen.px = pen.x;
  pen.py = pen.y;
  pen.x = q.x;
  pen.y = q.y;
  pen.kind = q.kind;
  if (Math.abs(pen.s - prev) > 0.05) st.lastMove = t;

  if (!st.ignited && t > 0.28) {
    st.ignited = true;
    emit(st, st.origin.x, st.origin.y, 46, 330, -Math.PI / 2, TAU, 40);
  }
  // Landing in a station going forward ignites it: a burst of sparks and a spreading ring of light. From
  // then on its plate draws by time, and the pen circles it by time while it is on screen.
  for (const s of st.stations) {
    if (prev < s.s0 && pen.s >= s.s0) {
      const p = posAt(path, s.s0);
      emit(st, p.x, p.y, 70, 420, 0, TAU, 30);
      st.flashes.push({ x: p.x, y: p.y, t, size: 260 });
      if (onScreenY(st, s.cy)) st.ring = { name: s.name, t0: t };
    }
  }
  // Touching a plate's named point sets the plate off with a smaller burst.
  for (const ps of st.plates) {
    const at = ps.plate.station ? path.marks.get(ps.plate.station) : undefined;
    if (at === undefined || prev >= at || pen.s < at) continue;
    const p = posAt(path, at);
    emit(st, p.x, p.y, 40, 300, 0, TAU, 20);
    st.flashes.push({ x: p.x, y: p.y, t, size: 150 });
  }
  // At the end of its journey the pen keeps going round the button, slowly, on ambient time.
  const ell = st.ell;
  if (ell && st.introDone && pen.s >= path.total - 8) {
    st.orbit ??= { from: st.at, angle: 0 };
    st.orbit.angle = ell.a0 + ell.sweep + ORBIT_SPEED * (st.at - st.orbit.from);
    pen.x = ell.cx + Math.cos(st.orbit.angle) * ell.rx;
    pen.y = ell.cy + Math.sin(st.orbit.angle) * ell.ry;
    pen.kind = FINALE;
    st.lastMove = t;
  } else st.orbit = null;
  if (pen.kind !== UP && pen.kind !== GHOST && t - st.lastMove < 1.5) {
    const speed = Math.abs(pen.v);
    const extra = pen.kind === WRITE ? 26 : pen.kind === JUMP ? 110 : 4;
    st.emitAcc += (Math.min(140, speed * 0.08) + extra) * dt;
    const n = st.emitAcc | 0;
    if (n) {
      st.emitAcc -= n;
      const dir = Math.atan2(pen.y - pen.py, pen.x - pen.px);
      emit(st, pen.x, pen.y, n, 120 + Math.min(speed, 2000) * 0.12, dir + Math.PI, 2.3, 70);
    }
  }
}

export function drawPen(st: PlotState) {
  const { ctx: c, ink, pen, t, sprites, green, tint, origin, sy } = st;
  if (st.reduce || !st.path) return;
  const x = pen.x;
  const y = pen.y - sy;
  if ((y < -150 || y > st.H + 150) && !st.flashes.length) return;
  const up = pen.kind === UP ? 0.5 : 1;
  const flick = 0.84 + 0.16 * Math.sin(t * 41) * Math.sin(t * 17.3);
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (t > 0.28 && t < 1.1) {
    const q = (t - 0.28) / 0.82;
    c.strokeStyle = rgba(AMBER, (1 - q) * 0.6);
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(origin.x, origin.y - sy, easeOut(q) * 170, 0, TAU);
    c.stroke();
  }
  drawFlashes(st);
  // Gone into a drawing, the pen shows nothing of itself.
  if (pen.kind !== GHOST) {
    // Orange fading into green while the final button is pointed at.
    for (const [set, k] of [
      [sprites, 1 - tint],
      [green, tint],
    ] as const) {
      if (k <= 0.001) continue;
      ink.sprite(set.glowL, x, y, 230, 0.3 * up * flick * k);
      ink.sprite(set.glowS, x, y, 36 * flick, 0.95 * up * k);
      c.globalAlpha = 0.24 * up * flick * k;
      c.drawImage(set.streak, x - 130, y - 1.5, 260, 3);
    }
    c.globalAlpha = 1;
  }
  c.restore();
  if (pen.kind !== GHOST) ink.dot(x, y, 1.8, WHITE, 0.95 * up);
}
