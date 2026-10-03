// Handles / HandleUtility on a 2D canvas laid over the WebGL view. Geometry is projected through the
// Scene camera exactly as Unity's GL path would, then filled in call order (Handles draw with
// zTest Always, so the order is the layering).
import { Event, EventType, GUIUtility } from './imgui.ts';
import { Color, Mathf, Matrix4x4, Quaternion, Ray, Rect, Vector2, Vector3 } from './math.ts';
import type { SceneCamera, SceneView } from './sceneview.ts';

const kPickDistance = 5;

export type CapFunction = (id: number, position: Vector3, rotation: Quaternion, size: number, type: EventType) => void;

interface DrawTarget {
  ctx: CanvasRenderingContext2D;
  view: SceneView;
}

let target: DrawTarget | null = null;

/** Set by the host around every pass. */
export function setDrawTarget(t: DrawTarget | null) {
  target = t;
}

function cam(): SceneCamera {
  return (target?.view ?? SceneViewRef.current!).camera;
}

/** Breaks the import cycle with SceneView for code that runs outside a pass. */
export const SceneViewRef: { current: SceneView | null } = { current: null };

const ppp = () => (target?.view ?? SceneViewRef.current)?.pixelsPerPoint ?? 1;
const isRepaint = () => Event.current.type === EventType.Repaint;

function toGui(p: Vector3): [number, number, number] {
  const c = cam();
  const s = c.worldToScreenPoint(Handles.matrix === Matrix4x4.identity ? p : Handles.matrix.multiplyPoint3x4(p));
  const k = ppp();
  return [s.x / k, (c.pixelHeight - s.y) / k, s.z];
}

// ---- Handles shaded meshes (ConeHandleCap and friends) ----

interface Face {
  v: Vector3[];
  n: Vector3[];
}

const meshCone: Face[] = (() => {
  const ring = (k: number) => {
    const a = k * 22.5 * Mathf.Deg2Rad;
    return [Math.cos(a), Math.sin(a)];
  };
  const out: Face[] = [];
  for (let k = 0; k < 16; k++) {
    const a = ring(k),
      b = ring(k + 1),
      m = ring(k + 0.5);
    out.push({
      v: [new Vector3(a[0] * 0.4, a[1] * 0.4, -0.5), new Vector3(0, 0, 0.7), new Vector3(b[0] * 0.4, b[1] * 0.4, -0.5)],
      n: [
        new Vector3(a[0] * 0.949, a[1] * 0.949, 0.316),
        new Vector3(m[0] * 0.934, m[1] * 0.934, 0.358),
        new Vector3(b[0] * 0.949, b[1] * 0.949, 0.316),
      ],
    });
    out.push({
      v: [new Vector3(0, 0, -0.5), new Vector3(b[0] * 0.4, b[1] * 0.4, -0.5), new Vector3(a[0] * 0.4, a[1] * 0.4, -0.5)],
      n: [Vector3.back, Vector3.back, Vector3.back],
    });
  }
  return out;
})();

const meshCube: Face[] = (() => {
  const out: Face[] = [];
  const ns = [Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back];
  for (const n of ns) {
    const [a, b] = n.x
      ? [Vector3.up, Vector3.forward]
      : n.y
        ? [Vector3.forward, Vector3.right]
        : [Vector3.right, Vector3.up];
    const c = n.mul(0.5),
      A = a.mul(0.5),
      B = b.mul(0.5);
    let v = [c.sub(A).sub(B), c.sub(A).add(B), c.add(A).add(B), c.add(A).sub(B)];
    // Keep the winding facing out so back faces can be culled by normal.
    if (Vector3.dot(Vector3.cross(v[1].sub(v[0]), v[2].sub(v[0])), n) < 0) v = v.reverse();
    out.push({ v, n: [n, n, n, n] });
  }
  return out;
})();

const meshSphere: Face[] = (() => {
  const out: Face[] = [];
  const lat = 10,
    lon = 16;
  const p = (i: number, j: number) => {
    const th = (i / lat) * Math.PI,
      ph = (j / lon) * Math.PI * 2;
    return new Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
  };
  for (let i = 0; i < lat; i++)
    for (let j = 0; j < lon; j++) {
      const a = p(i, j),
        b = p(i + 1, j),
        c = p(i + 1, j + 1),
        d = p(i, j + 1);
      out.push({ v: [a, b, c, d].map((q) => q.mul(0.5)), n: [a, b, c, d] });
    }
  return out;
})();

// Handles Shaded lighting, measured off a render: a view-facing term plus a sky/ground hemisphere.
const SKY = [0.318, 0.341, 0.389].map((v) => Math.pow(v, 2.2));
const GROUND = [0.07, 0.064, 0.052].map((v) => Math.pow(v, 2.2));
const HEMI = [0.9856, 0.9786, 0.9744];
const BIAS = [-0.0023, -0.0024, -0.0027];

function lit(c: SceneCamera, n: Vector3, ch: number) {
  const ey = Vector3.dot(n, c.up);
  const ez = -Vector3.dot(n, c.forward);
  const g = GROUND[ch];
  return 1.3752 * ez + HEMI[ch] * (g + (SKY[ch] - g) * (ey * 0.5 + 0.5)) + BIAS[ch];
}

let meshCanvas: HTMLCanvasElement | null = null;

function cssRGBA(r: number, g: number, b: number, a: number) {
  const c = (v: number) => Math.round(Mathf.Clamp01(v) * 255);
  return `rgba(${c(r)},${c(g)},${c(b)},${Mathf.Clamp01(a)})`;
}

/** A Handles mesh: rasterised whole off to the side so its triangles neither seam nor stack, then laid down. */
function drawMesh(faces: Face[], position: Vector3, rotation: Quaternion, size: number, lighting: boolean) {
  if (!target || !isRepaint()) return;
  const c = cam();
  const col = Handles.color;
  const a = Mathf.Clamp01(col.a);
  if (a <= 0) return;
  const toWorld = (v: Vector3) => position.add(rotation.mulV(v.mul(size)));
  const tris: { pts: [number, number][]; fill: string; depth: number }[] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const f of faces) {
    const w = f.v.map(toWorld);
    const ns = f.n.map((n) => rotation.mulV(n));
    const ctr = w.reduce((s, p) => s.add(p), Vector3.zero).div(w.length);
    const nAvg = ns.reduce((s, n) => s.add(n), Vector3.zero);
    const toCam = c.orthographic ? c.forward.neg() : c.position.sub(ctr);
    if (Vector3.dot(nAvg, toCam) <= 0) continue;
    const pts = w.map((p) => {
      const g = toGui(p);
      minX = Math.min(minX, g[0]);
      maxX = Math.max(maxX, g[0]);
      minY = Math.min(minY, g[1]);
      maxY = Math.max(maxY, g[1]);
      return [g[0], g[1]] as [number, number];
    });
    let fill: string;
    if (lighting) {
      const n = nAvg.normalized;
      fill = cssRGBA(a * col.r * lit(c, n, 0), a * col.g * lit(c, n, 1), a * col.b * lit(c, n, 2), 1);
    } else fill = cssRGBA(a * col.r, a * col.g, a * col.b, 1);
    tris.push({ pts, fill, depth: Vector3.dot(ctr.sub(c.position), c.forward) });
  }
  if (!tris.length) return;
  tris.sort((x, y) => y.depth - x.depth);
  const k = ppp();
  const pad = 2;
  const x0 = Math.floor(minX - pad),
    y0 = Math.floor(minY - pad);
  const w = Math.ceil((maxX - x0 + pad) * k),
    h = Math.ceil((maxY - y0 + pad) * k);
  if (w <= 0 || h <= 0 || w > 4096 || h > 4096) return;
  meshCanvas ??= document.createElement('canvas');
  if (meshCanvas.width < w || meshCanvas.height < h) {
    meshCanvas.width = Math.max(meshCanvas.width, w);
    meshCanvas.height = Math.max(meshCanvas.height, h);
  }
  const mc = meshCanvas.getContext('2d')!;
  const main = target.ctx;
  for (const pass of [0, 1]) {
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, w, h);
    mc.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    for (const t of tris) {
      mc.beginPath();
      t.pts.forEach((p, i) => (i ? mc.lineTo(p[0], p[1]) : mc.moveTo(p[0], p[1])));
      mc.closePath();
      mc.fillStyle = pass ? t.fill : '#000';
      mc.strokeStyle = mc.fillStyle;
      mc.lineWidth = 0.5;
      mc.lineJoin = 'round';
      mc.fill();
      mc.stroke();
    }
    // dst * (1 - alpha) + alpha * colour: a black cut-out, then an additive pass of premultiplied colour.
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalAlpha = pass ? 1 : a;
    main.globalCompositeOperation = pass ? 'lighter' : 'source-over';
    main.drawImage(meshCanvas, 0, 0, w, h, x0 * k, y0 * k, w, h);
    main.restore();
  }
}

function fillGui(pts: [number, number][], color: Color) {
  if (!target || pts.length < 3 || color.a <= 0) return;
  const ctx = target.ctx;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = color.css();
  ctx.fill();
}

function strokeGui(pts: [number, number][], color: Color, width: number, closed = false, dash?: number[]) {
  if (!target || pts.length < 2 || color.a <= 0) return;
  const ctx = target.ctx;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (closed) ctx.closePath();
  ctx.strokeStyle = color.css();
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.setLineDash(dash ?? []);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Clips a world segment to the near plane so a line running behind the camera doesn't wrap around. */
function clipToNear(a: Vector3, b: Vector3): [Vector3, Vector3] | null {
  const c = cam();
  if (c.orthographic) return [a, b];
  const near = c.nearClipPlane;
  const da = Vector3.dot(a.sub(c.position), c.forward) - near;
  const db = Vector3.dot(b.sub(c.position), c.forward) - near;
  if (da < 0 && db < 0) return null;
  if (da >= 0 && db >= 0) return [a, b];
  const t = da / (da - db);
  const m = Vector3.lerpUnclamped(a, b, t);
  return da < 0 ? [m, b] : [a, m];
}

function circleWorld(center: Vector3, normal: Vector3, from: Vector3, angle: number, radius: number, segs: number) {
  const pts: Vector3[] = [];
  const f = from.normalized;
  for (let i = 0; i <= segs; i++) {
    const q = Quaternion.angleAxis((angle * i) / segs, normal);
    pts.push(center.add(q.mulV(f).mul(radius)));
  }
  return pts;
}

function anyPerpendicular(n: Vector3) {
  let a = Vector3.cross(n, Vector3.up);
  if (a.sqrMagnitude < 0.001) a = Vector3.cross(n, Vector3.right);
  return a.normalized;
}

interface GuiStyleLike {
  fontSize?: number;
  bold?: boolean;
  color?: Color;
  align?: 'left' | 'center' | 'right';
  font?: string;
}

export const Handles = {
  color: Color.white,
  zTest: 8 as number,
  matrix: Matrix4x4.identity,
  lighting: true,
  inGui: false,

  drawAAConvexPolygon(...points: Vector3[]) {
    if (!isRepaint()) return;
    fillGui(
      points.map((p) => {
        const g = toGui(p);
        return [g[0], g[1]];
      }),
      Handles.color,
    );
  },

  drawLine(a: Vector3, b: Vector3, thickness = 0) {
    if (!isRepaint()) return;
    const seg = clipToNear(a, b);
    if (!seg) return;
    const [ga, gb] = seg.map(toGui);
    strokeGui(
      [
        [ga[0], ga[1]],
        [gb[0], gb[1]],
      ],
      Handles.color,
      thickness > 0 ? thickness : 1 / ppp(),
    );
  },

  drawLines(points: Vector3[]) {
    for (let i = 0; i + 1 < points.length; i += 2) Handles.drawLine(points[i], points[i + 1]);
  },

  drawPolyLine(...points: Vector3[]) {
    for (let i = 0; i + 1 < points.length; i++) Handles.drawLine(points[i], points[i + 1]);
  },

  drawDottedLine(a: Vector3, b: Vector3, screenSpaceSize: number) {
    if (!isRepaint()) return;
    const seg = clipToNear(a, b);
    if (!seg) return;
    const [ga, gb] = seg.map(toGui);
    strokeGui(
      [
        [ga[0], ga[1]],
        [gb[0], gb[1]],
      ],
      Handles.color,
      1 / ppp(),
      false,
      [screenSpaceSize, screenSpaceSize],
    );
  },

  drawAAPolyLine(width: number, ...points: Vector3[]) {
    if (!isRepaint()) return;
    const pts = points.map((p) => {
      const g = toGui(p);
      return [g[0], g[1]] as [number, number];
    });
    strokeGui(pts, Handles.color, Math.max(width, 1) / ppp());
  },

  drawWireDisc(center: Vector3, normal: Vector3, radius: number, thickness = 0) {
    Handles.drawWireArc(center, normal, anyPerpendicular(normal), 360, radius, thickness);
  },

  drawWireArc(center: Vector3, normal: Vector3, from: Vector3, angle: number, radius: number, thickness = 0) {
    if (!isRepaint()) return;
    const pts = circleWorld(center, normal, from, angle, radius, 60);
    for (let i = 0; i + 1 < pts.length; i++) Handles.drawLine(pts[i], pts[i + 1], thickness);
  },

  drawSolidDisc(center: Vector3, normal: Vector3, radius: number) {
    Handles.drawSolidArc(center, normal, anyPerpendicular(normal), 360, radius);
  },

  drawSolidArc(center: Vector3, normal: Vector3, from: Vector3, angle: number, radius: number) {
    if (!isRepaint()) return;
    const pts = circleWorld(center, normal, from, angle, radius, 60);
    const g = [center, ...pts].map((p) => {
      const q = toGui(p);
      return [q[0], q[1]] as [number, number];
    });
    fillGui(g, Handles.color);
  },

  drawWireCube(center: Vector3, size: Vector3) {
    const h = size.mul(0.5);
    const c = (x: number, y: number, z: number) => center.add(new Vector3(h.x * x, h.y * y, h.z * z));
    const e: [number[], number[]][] = [];
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      e.push([
        [x, y, -1],
        [x, y, 1],
      ]);
      e.push([
        [x, -1, y],
        [x, 1, y],
      ]);
      e.push([
        [-1, x, y],
        [1, x, y],
      ]);
    }
    for (const [a, b] of e) Handles.drawLine(c(a[0], a[1], a[2]), c(b[0], b[1], b[2]));
  },

  drawSolidRectangleWithOutline(verts: Vector3[], face: Color, outline: Color) {
    if (!isRepaint()) return;
    const g = verts.map((p) => {
      const q = toGui(p);
      return [q[0], q[1]] as [number, number];
    });
    fillGui(g, face);
    strokeGui(g, outline, 1 / ppp(), true);
  },

  label(position: Vector3, text: string, style: GuiStyleLike = {}) {
    if (!isRepaint() || !target) return;
    const g = toGui(position);
    if (g[2] <= 0) return;
    GUI.label(new Rect(g[0], g[1], 0, 0), text, style);
  },

  beginGUI() {
    Handles.inGui = true;
  },
  endGUI() {
    Handles.inGui = false;
  },

  coneHandleCap(id: number, position: Vector3, rotation: Quaternion, size: number, type: EventType) {
    if (type === EventType.Layout) HandleUtility.addControl(id, HandleUtility.distanceToCircle(position, size));
    else if (type === EventType.Repaint) drawMesh(meshCone, position, rotation, size, Handles.lighting);
  },

  cubeHandleCap(id: number, position: Vector3, rotation: Quaternion, size: number, type: EventType) {
    if (type === EventType.Layout) HandleUtility.addControl(id, HandleUtility.distanceToCube(position, rotation, size));
    else if (type === EventType.Repaint) drawMesh(meshCube, position, rotation, size, Handles.lighting);
  },

  sphereHandleCap(id: number, position: Vector3, rotation: Quaternion, size: number, type: EventType) {
    if (type === EventType.Layout) HandleUtility.addControl(id, HandleUtility.distanceToCircle(position, size * 0.5));
    else if (type === EventType.Repaint) drawMesh(meshSphere, position, rotation, size, Handles.lighting);
  },

  dotHandleCap(id: number, position: Vector3, rotation: Quaternion, size: number, type: EventType) {
    if (type === EventType.Layout)
      HandleUtility.addControl(id, HandleUtility.distanceToRectangle(position, rotation, size));
    else if (type === EventType.Repaint) {
      const c = cam();
      const r = c.right.mul(size),
        u = c.up.mul(size);
      Handles.drawAAConvexPolygon(
        position.add(r).add(u),
        position.add(r).sub(u),
        position.sub(r).sub(u),
        position.sub(r).add(u),
      );
    }
  },

  rectangleHandleCap(id: number, position: Vector3, rotation: Quaternion, size: number, type: EventType) {
    if (type === EventType.Layout)
      HandleUtility.addControl(id, HandleUtility.distanceToRectangle(position, rotation, size));
    else if (type === EventType.Repaint) {
      const r = rotation.mulV(new Vector3(size, 0, 0)),
        u = rotation.mulV(new Vector3(0, size, 0));
      Handles.drawPolyLine(
        position.add(r).add(u),
        position.add(r).sub(u),
        position.sub(r).sub(u),
        position.sub(r).add(u),
        position.add(r).add(u),
      );
    }
  },

  circleHandleCap(id: number, position: Vector3, rotation: Quaternion, size: number, type: EventType) {
    if (type === EventType.Layout) HandleUtility.addControl(id, HandleUtility.distanceToCircle(position, size));
    else if (type === EventType.Repaint) Handles.drawWireDisc(position, rotation.mulV(Vector3.forward), size);
  },

  /**
   * Handles.Slider: Unity's Slider1D - the mouse delta accumulates from the press and is projected
   * onto the axis on screen (CalcLineTranslation), applied to the position held at the press.
   */
  slider(
    id: number,
    position: Vector3,
    direction: Vector3,
    size: number,
    cap: CapFunction | null,
    snap: number,
  ): Vector3 {
    const ev = Event.current;
    const st = sliderState;
    switch (ev.type) {
      case EventType.Layout:
      case EventType.MouseMove:
        cap?.(id, position, Quaternion.lookRotation(direction), size, EventType.Layout);
        break;
      case EventType.MouseDown:
        if (HandleUtility.nearestControl === id && ev.button === 0 && !ev.alt) {
          GUIUtility.hotControl = id;
          st.startMouse = st.currentMouse = ev.mousePosition;
          st.startPosition = position;
          ev.use();
        }
        break;
      case EventType.MouseDrag:
        if (GUIUtility.hotControl === id) {
          st.currentMouse = st.currentMouse.add(ev.delta);
          const dist = HandleUtility.calcLineTranslation(st.startMouse, st.currentMouse, st.startPosition, direction);
          let d = dist;
          if (snap > 0) d = Math.round(d / snap) * snap;
          position = st.startPosition.add(direction.normalized.mul(d));
          GUI.changed = true;
          ev.use();
        }
        break;
      case EventType.MouseUp:
        if (GUIUtility.hotControl === id && (ev.button === 0 || ev.button === 2)) {
          GUIUtility.hotControl = 0;
          ev.use();
        }
        break;
      case EventType.Repaint:
        cap?.(id, position, Quaternion.lookRotation(direction), size, EventType.Repaint);
        break;
    }
    return position;
  },

  /** Handles.FreeMoveHandle: drags on the camera-facing plane through the press position. */
  freeMoveHandle(id: number, position: Vector3, size: number, snap: Vector3, cap: CapFunction | null): Vector3 {
    const ev = Event.current;
    const st = sliderState;
    const c = cam();
    switch (ev.type) {
      case EventType.Layout:
      case EventType.MouseMove:
        cap?.(id, position, c.rotation, size, EventType.Layout);
        break;
      case EventType.MouseDown:
        if (HandleUtility.nearestControl === id && ev.button === 0 && !ev.alt) {
          GUIUtility.hotControl = id;
          st.startMouse = st.currentMouse = ev.mousePosition;
          st.startPosition = position;
          ev.use();
        }
        break;
      case EventType.MouseDrag:
        if (GUIUtility.hotControl === id) {
          st.currentMouse = st.currentMouse.add(ev.delta);
          const startGui = HandleUtility.worldToGUIPoint(st.startPosition);
          const target = startGui.add(st.currentMouse.sub(st.startMouse));
          const ray = HandleUtility.guiPointToWorldRay(target);
          const n = c.forward;
          const denom = Vector3.dot(ray.direction, n);
          if (Math.abs(denom) > 1e-8) {
            const t = Vector3.dot(st.startPosition.sub(ray.origin), n) / denom;
            position = ray.getPoint(t);
            if (snap.sqrMagnitude > 0)
              position = new Vector3(
                snap.x ? Math.round(position.x / snap.x) * snap.x : position.x,
                snap.y ? Math.round(position.y / snap.y) * snap.y : position.y,
                snap.z ? Math.round(position.z / snap.z) * snap.z : position.z,
              );
          }
          GUI.changed = true;
          ev.use();
        }
        break;
      case EventType.MouseUp:
        if (GUIUtility.hotControl === id && (ev.button === 0 || ev.button === 2)) {
          GUIUtility.hotControl = 0;
          ev.use();
        }
        break;
      case EventType.Repaint:
        cap?.(id, position, c.rotation, size, EventType.Repaint);
        break;
    }
    return position;
  },

  setCamera(_c?: unknown) {},
};

const sliderState = {
  startMouse: Vector2.zero,
  currentMouse: Vector2.zero,
  startPosition: Vector3.zero,
};

export const HandleUtility = {
  nearestControl: 0,
  nearestDistance: kPickDistance,
  kPickDistance,
  /** Delegates for scene queries, installed by the host. */
  picker: null as null | {
    pick(gui: Vector2, ignore?: Set<unknown>): unknown;
    pickRect(rect: Rect): unknown[];
  },

  beginLayout() {
    HandleUtility.nearestControl = 0;
    HandleUtility.nearestDistance = kPickDistance;
    pendingNearest = 0;
    pendingDistance = kPickDistance;
  },

  endLayout() {
    HandleUtility.nearestControl = pendingNearest;
    HandleUtility.nearestDistance = pendingDistance;
  },

  addControl(id: number, distance: number) {
    if (distance > kPickDistance) return;
    if (distance <= pendingDistance) {
      pendingDistance = distance;
      pendingNearest = id;
    }
  },

  addDefaultControl(id: number) {
    HandleUtility.addControl(id, kPickDistance);
  },

  worldToGUIPoint(p: Vector3) {
    const g = toGui(p);
    return new Vector2(g[0], g[1]);
  },

  worldToGUIPointWithDepth(p: Vector3) {
    const g = toGui(p);
    return new Vector3(g[0], g[1], g[2]);
  },

  guiPointToScreenPixelCoordinate(p: Vector2) {
    const k = ppp();
    return new Vector2(p.x * k, cam().pixelHeight - p.y * k);
  },

  guiPointToWorldRay(p: Vector2): Ray {
    const c = cam();
    const k = ppp();
    return c.screenPointToRay(new Vector2(p.x * k, c.pixelHeight - p.y * k));
  },

  getHandleSize(position: Vector3) {
    const c = cam();
    const p = Handles.matrix === Matrix4x4.identity ? position : Handles.matrix.multiplyPoint3x4(position);
    const z = Vector3.dot(p.sub(c.position), c.forward);
    const a = c.worldToScreenPoint(c.position.add(c.forward.mul(z)));
    const b = c.worldToScreenPoint(c.position.add(c.forward.mul(z)).add(c.right));
    const mag = Math.hypot(a.x - b.x, a.y - b.y);
    return (80 / Math.max(mag, 0.0001)) * ppp();
  },

  distanceToCircle(position: Vector3, radius: number) {
    const center = HandleUtility.worldToGUIPoint(position);
    const edge = HandleUtility.worldToGUIPoint(position.add(cam().right.mul(radius)));
    const r = center.sub(edge).magnitude;
    const d = center.sub(Event.current.mousePosition).magnitude;
    return d < r ? 0 : d - r;
  },

  distanceToRectangle(position: Vector3, rotation: Quaternion, size: number) {
    const sides = [
      new Vector3(size, size, 0),
      new Vector3(size, -size, 0),
      new Vector3(-size, -size, 0),
      new Vector3(-size, size, 0),
    ].map((v) => HandleUtility.worldToGUIPoint(position.add(rotation.mulV(v))));
    return HandleUtility.distanceToPolygon(sides);
  },

  distanceToCube(position: Vector3, rotation: Quaternion, size: number) {
    const h = size * 0.5;
    const pts: Vector2[] = [];
    for (let i = 0; i < 8; i++)
      pts.push(
        HandleUtility.worldToGUIPoint(
          position.add(rotation.mulV(new Vector3(i & 1 ? h : -h, i & 2 ? h : -h, i & 4 ? h : -h))),
        ),
      );
    return HandleUtility.distanceToPolygon(convexHull(pts));
  },

  /** GUI distance from the mouse to a convex polygon; zero inside. */
  distanceToPolygon(poly: Vector2[], mouse = Event.current.mousePosition) {
    if (pointInPolygon(mouse, poly)) return 0;
    let best = Infinity;
    for (let i = 0; i < poly.length; i++)
      best = Math.min(best, HandleUtility.distancePointToLineSegment(mouse, poly[i], poly[(i + 1) % poly.length]));
    return best;
  },

  distanceToLine(a: Vector3, b: Vector3) {
    const ga = HandleUtility.worldToGUIPoint(a),
      gb = HandleUtility.worldToGUIPoint(b);
    let d = HandleUtility.distancePointToLineSegment(Event.current.mousePosition, ga, gb);
    if (d < 0) d = 0;
    return d;
  },

  distanceToPolyLine(...points: Vector3[]) {
    let best = Infinity;
    for (let i = 0; i + 1 < points.length; i++)
      best = Math.min(best, HandleUtility.distanceToLine(points[i], points[i + 1]));
    return best;
  },

  distancePointToLineSegment(p: Vector2, a: Vector2, b: Vector2) {
    const ab = b.sub(a);
    const l2 = ab.sqrMagnitude;
    if (l2 === 0) return p.sub(a).magnitude;
    const t = Mathf.Clamp01(Vector2.dot(p.sub(a), ab) / l2);
    return p.sub(a.add(ab.mul(t))).magnitude;
  },

  distancePointLine(p: Vector3, a: Vector3, b: Vector3) {
    const ab = b.sub(a);
    const l2 = ab.sqrMagnitude;
    if (l2 === 0) return p.sub(a).magnitude;
    const t = Mathf.Clamp01(Vector3.dot(p.sub(a), ab) / l2);
    return p.sub(a.add(ab.mul(t))).magnitude;
  },

  /** Unity's CalcLineTranslation: how far along constraintDir a drag from src to dest moves. */
  calcLineTranslation(src: Vector2, dest: Vector2, srcPosition: Vector3, constraintDir: Vector3) {
    const c = cam();
    const invert = Vector3.dot(constraintDir, c.forward) < 0 ? -1 : 1;
    const p1 = HandleUtility.worldToGUIPoint(srcPosition);
    const p2 = HandleUtility.worldToGUIPoint(srcPosition.add(constraintDir.mul(invert)));
    const d = p2.sub(p1);
    if (d.sqrMagnitude < 1e-12) return 0;
    const param = (x: Vector2) => Vector2.dot(x.sub(p1), d) / d.sqrMagnitude;
    return (param(dest) - param(src)) * invert;
  },

  pickGameObject(position: Vector2, _selectPrefabRoot = false, ignore?: Set<unknown>) {
    return HandleUtility.picker?.pick(position, ignore) ?? null;
  },

  pickRectObjects(rect: Rect) {
    return HandleUtility.picker?.pickRect(rect) ?? [];
  },

  repaint() {
    SceneViewRef.current?.repaint();
  },
};

let pendingNearest = 0;
let pendingDistance = kPickDistance;

function pointInPolygon(p: Vector2, poly: Vector2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function convexHull(pts: Vector2[]): Vector2[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vector2, a: Vector2, b: Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vector2[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vector2[] = [];
  for (const p of s.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ---- GUI: screen-space drawing between Handles.BeginGUI/EndGUI ----

export const GUI = {
  color: Color.white,
  contentColor: Color.white,
  backgroundColor: Color.white,
  enabled: true,
  changed: false,

  get ctx() {
    return target?.ctx ?? null;
  },

  drawRect(rect: Rect, color: Color) {
    const ctx = target?.ctx;
    if (!ctx || !isRepaint()) return;
    ctx.fillStyle = color.css();
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  },

  drawRoundedRect(rect: Rect, radius: number, color: Color, border?: { color: Color; width: number }) {
    const ctx = target?.ctx;
    if (!ctx || !isRepaint()) return;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
    ctx.fillStyle = color.css();
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border.color.css();
      ctx.lineWidth = border.width;
      ctx.stroke();
    }
  },

  drawTexture(rect: Rect, image: CanvasImageSource | null, tint?: Color): void {
    tint ??= guiColor();
    const ctx = target?.ctx;
    if (!ctx || !image || !isRepaint()) return;
    ctx.save();
    ctx.globalAlpha = tint.a;
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  },

  /** Text anchored at rect.x/y (top-left, or centre for align: 'center'). */
  label(rect: Rect, text: string, style: GuiStyleLike = {}) {
    const ctx = target?.ctx;
    if (!ctx || !isRepaint()) return;
    const size = style.fontSize ?? 12;
    ctx.font = `${style.bold ? 600 : 400} ${size}px ${style.font ?? 'Inter, system-ui, sans-serif'}`;
    ctx.fillStyle = (style.color ?? guiColor()).css();
    ctx.textBaseline = 'top';
    const align = style.align ?? 'left';
    ctx.textAlign = align;
    const x = align === 'center' ? rect.x + rect.width / 2 : align === 'right' ? rect.x + rect.width : rect.x;
    ctx.fillText(text, x, rect.y);
    ctx.textAlign = 'left';
  },

  /** Size of rich text (<color>, <b>) in a style, padding included. */
  richSize(text: string, style: RichStyle) {
    const ctx = target?.ctx;
    const runs = parseRich(text);
    let w = 0;
    for (const r of runs) {
      if (ctx) {
        ctx.font = fontOf(style, r.bold);
        w += ctx.measureText(r.text).width;
      } else w += r.text.length * style.fontSize * 0.6;
    }
    const [l, rr, t, b] = style.padding ?? [0, 0, 0, 0];
    return new Vector2(Math.ceil(w + l + rr), Math.ceil(style.fontSize * (style.lineHeight ?? 1.25) + t + b));
  },

  /** Rich text inside rect, vertically centred, left-aligned after the padding. */
  richLabel(rect: Rect, text: string, style: RichStyle) {
    const ctx = target?.ctx;
    if (!ctx || !isRepaint()) return;
    const [l, , t, b] = style.padding ?? [0, 0, 0, 0];
    let x = rect.x + l;
    const y = rect.y + t + (rect.height - t - b) / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const r of parseRich(text)) {
      ctx.font = fontOf(style, r.bold);
      ctx.fillStyle = (r.color ?? style.color ?? Color.white).css();
      ctx.fillText(r.text, x, y);
      x += ctx.measureText(r.text).width;
    }
  },

  measure(text: string, fontSize = 12, bold = false, font = 'Inter, system-ui, sans-serif') {
    const ctx = target?.ctx;
    if (!ctx) return text.length * fontSize * 0.55;
    ctx.font = `${bold ? 600 : 400} ${fontSize}px ${font}`;
    return ctx.measureText(text).width;
  },
};

export interface RichStyle {
  fontSize: number;
  font?: string;
  color?: Color;
  /** Left, right, top, bottom. */
  padding?: [number, number, number, number];
  lineHeight?: number;
}

const fontOf = (s: RichStyle, bold: boolean) =>
  `${bold ? 700 : 400} ${s.fontSize}px ${s.font ?? 'Inter, system-ui, sans-serif'}`;

interface RichRun {
  text: string;
  color?: Color;
  bold: boolean;
}

/** Unity rich text: <color=#hex>, <b>, <i> and <size> (size ignored), nestable. */
export function parseRich(text: string): RichRun[] {
  const out: RichRun[] = [];
  const colors: Color[] = [];
  let bold = 0;
  const re = /<(\/?)(color|b|i|size)(?:=([^>]+))?>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (t: string) => {
    if (t) out.push({ text: t, color: colors.at(-1), bold: bold > 0 });
  };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    last = m.index + m[0].length;
    const close = m[1] === '/';
    if (m[2] === 'color') {
      if (close) colors.pop();
      else colors.push(Color.hex(m[3] ?? '#ffffff'));
    } else if (m[2] === 'b') bold += close ? -1 : 1;
  }
  push(text.slice(last));
  return out;
}

function guiColor(): Color {
  return GUI.contentColor.mulC(GUI.color);
}

export const EditorGUIUtility = {
  get pixelsPerPoint() {
    return ppp();
  },
  isProSkin: true,
  systemCopyBuffer: '',
  /** Cursor for the whole view; read by the host after each pass. */
  cursor: '' as string,
  addCursorRect(_rect: Rect, cursor: string) {
    EditorGUIUtility.cursor = cursor;
  },
  setWantsMouseJumping(_v: number) {},
};

export const MouseCursor = {
  Arrow: 'default',
  Pan: 'grabbing',
  Orbit: 'default',
  Zoom: 'default',
  MoveArrow: 'move',
  RotateArrow: 'default',
  ScaleArrow: 'default',
  ArrowPlus: 'copy',
  ArrowMinus: 'default',
  Link: 'pointer',
  SlideArrow: 'default',
  FPS: 'default',
} as const;
