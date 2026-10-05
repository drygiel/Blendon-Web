// The Editor's own scene gizmo (SceneOrientationGizmo): six cones round a cube, with the projection named
// underneath. Shown while Blendon's orientation gizmo is off, or alongside it when Blendon doesn't hide it.
// A cone looks down its axis in Iso; the cube or the label flip perspective; Shift+cube resets the view.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SceneHost } from '../engine/host.ts';
import { Quaternion, Vector3 } from '../unity/math.ts';
import { kDefaultRotation } from '../unity/sceneview.ts';
import { TopStripHeight, useOverlays } from './overlays.ts';
import styles from './Scene.module.scss';

const Size = 84;
const LabelHeight = 18;
const R = Size * 0.5 - 4;

// Handles.xAxisColor and friends; the negative arms are the Editor's grey.
const Colors: RGB[] = [
  [219, 62, 29],
  [154, 243, 72],
  [58, 122, 248],
];
const Grey: RGB = [200, 200, 200];
const CubeGrey: RGB = [205, 205, 205];
type RGB = [number, number, number];
const Names = [
  ['Right', 'Left'],
  ['Top', 'Bottom'],
  ['Front', 'Back'],
];
const Axes = [Vector3.right, Vector3.up, Vector3.forward];

interface Tri {
  pts: [number, number][];
  depth: number;
  fill: RGB;
  shade: number;
  /** 0-5: axis*2 + negative; 6: the cube. */
  part: number;
  alpha: number;
}

const upHint = (axis: number, positive: boolean) =>
  axis !== 1 ? Vector3.up : positive ? Vector3.forward : Vector3.back;

/** The arms and cube as view-space triangles, nearest last. */
function build(rotation: Quaternion): Tri[] {
  const inv = Quaternion.inverse(rotation);
  const view = (p: Vector3) => inv.mulV(p);
  const tris: Tri[] = [];
  const push = (pts: Vector3[], normal: Vector3, part: number, fill: RGB, alpha: number) => {
    const n = view(normal);
    if (n.z > 0.02) return;
    const v = pts.map(view);
    tris.push({
      pts: v.map((p) => [Size / 2 + p.x * R, Size / 2 - p.y * R]),
      depth: v.reduce((s, p) => s + p.z, 0) / v.length,
      fill,
      shade: 0.55 + 0.45 * Math.max(0, -n.z),
      part,
      alpha,
    });
  };
  for (let a = 0; a < 3; a++)
    for (const neg of [false, true]) {
      const dir = Axes[a].mul(neg ? -1 : 1);
      // Arms seen end-on fade, as the Editor's do, so they don't sit on top of the cube.
      const facing = Math.abs(view(dir).z);
      const alpha = facing > 0.95 ? Math.max(0, (1 - facing) / 0.05) : 1;
      const u = Math.abs(dir.y) < 0.9 ? Vector3.cross(dir, Vector3.up).normalized : Vector3.right;
      const w = Vector3.cross(dir, u).normalized;
      const tip = dir.mul(0.32);
      const base = dir.mul(0.95);
      const ring = (k: number) => {
        const t = (k / 14) * Math.PI * 2;
        return base.add(u.mul(Math.cos(t) * 0.2)).add(w.mul(Math.sin(t) * 0.2));
      };
      const fill = neg ? Grey : Colors[a];
      for (let k = 0; k < 14; k++) {
        const p0 = ring(k),
          p1 = ring(k + 1);
        const mid = p0.add(p1).mul(0.5).sub(base).normalized;
        push([tip, p0, p1], mid.mul(0.9).sub(dir.mul(0.35)).normalized, a * 2 + (neg ? 1 : 0), fill, alpha);
        push([base, p1, p0], dir, a * 2 + (neg ? 1 : 0), fill, alpha);
      }
    }
  const h = 0.16;
  for (let a = 0; a < 3; a++)
    for (const s of [1, -1]) {
      const n = Axes[a].mul(s);
      const u = Axes[(a + 1) % 3].mul(h),
        v = Axes[(a + 2) % 3].mul(h);
      const c = n.mul(h);
      push([c.add(u).add(v), c.add(u).sub(v), c.sub(u).sub(v), c.sub(u).add(v)], n, 6, CubeGrey, 1);
    }
  return tris.sort((x, y) => y.depth - x.depth);
}

function inside(p: [number, number], pts: [number, number][]) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i],
      [xj, yj] = pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function pick(tris: Tri[], p: [number, number]) {
  for (let i = tris.length - 1; i >= 0; i--) if (tris[i].alpha > 0.3 && inside(p, tris[i].pts)) return tris[i].part;
  return -1;
}

function alignedName(rotation: Quaternion) {
  const fwd = rotation.mulV(Vector3.forward);
  for (let a = 0; a < 3; a++)
    for (const neg of [false, true])
      if (Vector3.dot(fwd, Axes[a].mul(neg ? 1 : -1)) > 0.9999) return Names[a][neg ? 1 : 0];
  return '';
}

export function NativeSceneGizmo({ host, besideBlendon }: { host: SceneHost; besideBlendon: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(-1);
  const [, setTick] = useState(0);
  const overlays = useOverlays();
  const view = host.view;

  useEffect(() => {
    let last = '';
    const onFrame = () => {
      const r = view.rotation;
      const key = `${r.x},${r.y},${r.z},${r.w},${view.orthographic},${hover}`;
      if (key === last) return;
      last = key;
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Size * dpr;
      c.height = Size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, Size, Size);
      for (const t of build(r)) {
        ctx.beginPath();
        t.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        const k = t.shade * (t.part === hover ? 1.25 : 1);
        const css = `rgb(${t.fill.map((c) => Math.min(255, Math.round(c * k))).join(',')})`;
        ctx.globalAlpha = t.alpha;
        ctx.fillStyle = css;
        ctx.fill();
        ctx.strokeStyle = css;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // The positive arms carry their letters just past the cone.
      const inv = Quaternion.inverse(r);
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(210,210,210,0.9)';
      ['x', 'y', 'z'].forEach((l, a) => {
        const v = inv.mulV(Axes[a]);
        if (Math.abs(v.z) > 0.95) return;
        ctx.fillText(l, Size / 2 + v.x * (R + 2), Size / 2 - v.y * (R + 2));
      });
      setTick((t) => t + 1);
    };
    host.frameListeners.add(onFrame);
    onFrame();
    return () => void host.frameListeners.delete(onFrame);
  }, [host, view, hover]);

  if (!overlays.isShown('orientation')) return null;

  const local = (e: ReactPointerEvent): [number, number] => {
    const b = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };
  const focusView = () => host.focusRoot.focus({ preventScroll: true });
  const toggleProjection = () => view.lookAt(view.pivot, view.rotation, view.size, !view.orthographic, false);

  const click = (part: number, shift: boolean) => {
    if (part < 0) return;
    if (part === 6) {
      if (shift) view.lookAt(view.pivot, kDefaultRotation, view.size, false, false);
      else toggleProjection();
      return;
    }
    const axis = part >> 1;
    const positive = (part & 1) === 0;
    const dir = Axes[axis].mul(positive ? 1 : -1);
    view.lookAt(view.pivot, Quaternion.lookRotation(dir.neg(), upHint(axis, positive)), view.size, true, false);
  };

  const name = alignedName(view.rotation);
  const label = view.orthographic ? name || 'Iso' : 'Persp';

  return (
    <div
      className={styles.nativeGizmo}
      style={{
        right: besideBlendon ? 104 : 4,
        top: 4 + (overlays.topStrip ? TopStripHeight : 0),
        width: Size,
        height: Size + LabelHeight,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        style={{ width: Size, height: Size, cursor: hover >= 0 ? 'pointer' : undefined }}
        aria-label="Scene gizmo"
        role="img"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button === 0) click(pick(build(view.rotation), local(e)), e.shiftKey);
          focusView();
        }}
        onPointerMove={(e) => setHover(pick(build(view.rotation), local(e)))}
        onPointerLeave={() => setHover(-1)}
      />
      <button
        type="button"
        className={styles.nativeGizmoLabel}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button === 0) toggleProjection();
          focusView();
        }}
      >
        <span aria-hidden="true">‹</span> {label}
      </button>
    </div>
  );
}
