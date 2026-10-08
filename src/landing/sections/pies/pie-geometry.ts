// The demo pie's layout and selection, in the plugin's points; the demo draws them `scale` times larger.

/** Blender's pie order: left, up, right, down, then upper-right, lower-right, lower-left, upper-left. */
export const DIRS = [180, 90, 0, 270, 45, 315, 225, 135];

// PieMenuStyles / PieMenuSettings of the plugin.
export const RADIUS = 100;
const THRESHOLD = 12;
export const RING_OUTER = 23;
export const RING_THICKNESS = 9;
export const MAX_SCALE = 1.6;
/** Widest pie's half-width (a 190 pt pill on a diagonal), so every pie fits the stage. */
export const HALF_WIDTH = 240;
export const HALF_HEIGHT = RADIUS + 24 + 8;
const COS45 = Math.cos(Math.PI / 4);

/** An item's direction in radians, counterclockwise from +X. */
export const dirOf = (i: number) => ((DIRS[i] ?? 0) * Math.PI) / 180;

/** Blender's segment test reduced to the nearest occupied direction; a greyed slot keeps its wedge. */
export function select(count: number, disabled: Set<number>, angle: number) {
  let best = -1;
  let bestCos = COS45 - 1e-4;
  for (let i = 0; i < count; i++) {
    const c = Math.cos(angle - dirOf(i));
    if (c > bestCos) {
      bestCos = c;
      best = i;
    }
  }
  return disabled.has(best) ? -1 : best;
}

/** The pointer's direction from the pie's centre in GUI space (y down), or null inside the deadzone. */
export function pointerAngle(center: DOMRect, x: number, y: number, scale: number): number | null {
  const dx = x - center.left;
  const dy = y - center.top;
  return Math.hypot(dx, dy) / scale < THRESHOLD ? null : Math.atan2(dy, dx);
}

/** The ring's band as an arc of `half` degrees either side of +X. */
export function ringArc(half: number) {
  const r = RING_OUTER - 1 - RING_THICKNESS / 2;
  const a = (half * Math.PI) / 180;
  const x = (r * Math.cos(a)).toFixed(3);
  const y = (r * Math.sin(a)).toFixed(3);
  return `M ${x} -${y} A ${r} ${r} 0 0 1 ${x} ${y}`;
}
