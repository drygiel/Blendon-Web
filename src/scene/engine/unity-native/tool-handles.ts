// The Editor's own transform handles (PositionHandle, RotationHandle, ScaleHandle and the Transform tool),
// drawn whenever no plugin gizmo has claimed the tool through Tools.hidden. Hold V on the Move tool for the
// Editor's vertex snapping.
import {
  EditorSnapSettings,
  PivotMode,
  Selection,
  ShortcutManager,
  ShortcutStage,
  Tool,
  Tools,
  Undo,
} from '../../unity/editor.ts';
import { GUI, Handles, HandleUtility, type CapFunction } from '../../unity/handles.ts';
import { Event, EventType, GUIUtility } from '../../unity/imgui.ts';
import { Color, Mathf, Quaternion, Vector2, Vector3 } from '../../unity/math.ts';
import type { GameObject, Transform } from '../../unity/scene.ts';
import { Scene } from '../../unity/scene.ts';
import type { SceneView } from '../../unity/sceneview.ts';

// Handles.xAxisColor and friends.
const AxisColors = [
  new Color(219 / 255, 62 / 255, 29 / 255, 0.93),
  new Color(154 / 255, 243 / 255, 72 / 255, 0.93),
  new Color(58 / 255, 122 / 255, 248 / 255, 0.93),
];
const CenterColor = new Color(0.8, 0.8, 0.8, 0.93);
const SelectedColor = new Color(246 / 255, 242 / 255, 50 / 255, 0.89);
const PreselectColor = new Color(201 / 255, 200 / 255, 144 / 255, 0.89);
const Axes = [Vector3.right, Vector3.up, Vector3.forward];
const VertexSnapId = 'Tools/Vertex Snapping';
const VertexSnapRadius = 20;

interface Start {
  p: Vector3;
  r: Quaternion;
  s: Vector3;
}

let session: {
  id: number;
  name: string;
  starts: Map<Transform, Start>;
  pivot: Vector3;
  handleRot: Quaternion;
  // Rotation drags: the grabbed point and tangent, or the screen-space sign of the view ring.
  grab: Vector3;
  tangent: Vector3;
  sign: number;
  value: number;
  vertex: Vector3 | null;
} | null = null;

let vertexHeld = false;

function tint(id: number, base: Color) {
  if (GUIUtility.hotControl === id) return SelectedColor;
  if (GUIUtility.hotControl === 0 && HandleUtility.nearestControl === id) return PreselectColor;
  return base;
}

const toCamera = (p: Vector3) => {
  const c = Camera();
  return c.orthographic ? c.forward.neg() : c.position.sub(p).normalized;
};
const Camera = () => (SceneViewNow.view as SceneView).camera;
const SceneViewNow: { view: SceneView | null } = { view: null };

/** Starts the undo step and remembers every target's pose when a handle has just taken the mouse. */
function track(before: number, id: number, name: string, pivot: Vector3, handleRot: Quaternion) {
  if (before === id || GUIUtility.hotControl !== id) return false;
  const targets = Selection.transforms;
  Undo.incrementCurrentGroup();
  Undo.recordObjects(targets, name);
  Undo.setCurrentGroupName(name);
  session = {
    id,
    name,
    starts: new Map(targets.map((t) => [t, { p: t.position, r: t.rotation, s: t.localScale }])),
    pivot,
    handleRot,
    grab: pivot,
    tangent: Vector3.zero,
    sign: 1,
    value: 0,
    vertex: null,
  };
  return true;
}

function endIfReleased() {
  if (session && GUIUtility.hotControl !== session.id) {
    Undo.incrementCurrentGroup();
    session = null;
  }
}

const snap = (v: number, step: number) =>
  EditorSnapSettings.incrementalSnapActive && step > 0 ? Math.round(v / step) * step : v;

function applyMove(delta: Vector3) {
  if (!session) return;
  for (const [t, s] of session.starts) t.position = s.p.add(delta);
}

function applyRotation(q: Quaternion) {
  if (!session) return;
  const center = Tools.pivotMode === PivotMode.Center;
  for (const [t, s] of session.starts) {
    t.rotation = q.mul(s.r);
    if (center) t.position = session.pivot.add(q.mulV(s.p.sub(session.pivot)));
  }
}

function applyScale(factor: Vector3) {
  if (!session) return;
  const r = session.handleRot;
  const inv = Quaternion.inverse(r);
  const center = Tools.pivotMode === PivotMode.Center && session.starts.size > 1;
  for (const [t, s] of session.starts) {
    t.localScale = s.s.scale(factor);
    if (center) t.position = session.pivot.add(r.mulV(inv.mulV(s.p.sub(session.pivot)).scale(factor)));
  }
}

// ---- Move ----

const rectCap: CapFunction = (id, position, rotation, size, type) =>
  Handles.rectangleHandleCap(id, position, rotation, size, type);

function planeCap(axis1: Vector3, axis2: Vector3, size: number, fill: Color, line: Color) {
  return (id: number, position: Vector3, _r: Quaternion, _s: number, type: EventType) => {
    const toCam = toCamera(position);
    // The square sits in the quadrant facing the camera, as the Editor flips it.
    const a = axis1.mul(Vector3.dot(axis1, toCam) < 0 ? -1 : 1);
    const b = axis2.mul(Vector3.dot(axis2, toCam) < 0 ? -1 : 1);
    const q = (u: number, v: number) => position.add(a.mul(u * size)).add(b.mul(v * size));
    const quad = [q(0.05, 0.05), q(0.05, 0.3), q(0.3, 0.3), q(0.3, 0.05)];
    if (type === EventType.Layout)
      HandleUtility.addControl(id, HandleUtility.distanceToPolygon(quad.map((p) => HandleUtility.worldToGUIPoint(p))));
    else if (type === EventType.Repaint) Handles.drawSolidRectangleWithOutline(quad, fill, line);
  };
}

function arrowCap(id: number, position: Vector3, rotation: Quaternion, size: number, type: EventType) {
  const dir = rotation.mulV(Vector3.forward);
  if (type === EventType.Layout)
    HandleUtility.addControl(
      id,
      Math.min(
        HandleUtility.distanceToLine(position, position.add(dir.mul(size * 0.9))),
        HandleUtility.distanceToCircle(position.add(dir.mul(size)), size * 0.2),
      ),
    );
  else if (type === EventType.Repaint) {
    Handles.drawLine(position, position.add(dir.mul(size * 0.9)), 2);
    Handles.coneHandleCap(id, position.add(dir.mul(size)), rotation, size * 0.2, type);
  }
}

/** Faded out as an axis turns end-on to the camera, where dragging along it means nothing. */
function axisAlpha(dir: Vector3, pos: Vector3) {
  const d = Math.abs(Vector3.dot(dir, toCamera(pos)));
  return d > 0.995 ? 0 : d > 0.96 ? (0.995 - d) / 0.035 : 1;
}

function moveHandle(pos: Vector3, rot: Quaternion, withPlanes = true) {
  const size = HandleUtility.getHandleSize(pos);
  const step = EditorSnapSettings.move.x;
  for (let i = 0; i < 3; i++) {
    const dir = rot.mulV(Axes[i]);
    const id = GUIUtility.getControlID(0);
    const alpha = axisAlpha(dir, pos);
    if (alpha <= 0) continue;
    const before = GUIUtility.hotControl;
    const c = tint(id, AxisColors[i]);
    Handles.color = new Color(c.r, c.g, c.b, c.a * alpha);
    const next = Handles.slider(
      id,
      pos,
      dir,
      size,
      arrowCap,
      step * (EditorSnapSettings.incrementalSnapActive ? 1 : 0),
    );
    track(before, id, 'Move', pos, rot);
    if (session?.id === id && GUI.changed) applyMove(next.sub(session.pivot));
  }
  if (withPlanes)
    for (let i = 0; i < 3; i++) {
      const n = rot.mulV(Axes[i]);
      const a = rot.mulV(Axes[(i + 1) % 3]);
      const b = rot.mulV(Axes[(i + 2) % 3]);
      const id = GUIUtility.getControlID(0);
      if (Math.abs(Vector3.dot(n, toCamera(pos))) < 0.15) continue;
      const before = GUIUtility.hotControl;
      const c = tint(id, AxisColors[i]);
      const cap = planeCap(a, b, size, new Color(c.r, c.g, c.b, 0.1), new Color(c.r, c.g, c.b, c.a));
      const s = EditorSnapSettings.incrementalSnapActive ? step : 0;
      const next = Handles.slider2D(id, pos, n, a, b, size, cap, new Vector2(s, s));
      track(before, id, 'Move', pos, rot);
      if (session?.id === id && GUI.changed) applyMove(next.sub(session.pivot));
    }
  centerMove(pos, rot, size);
}

function centerMove(pos: Vector3, rot: Quaternion, size: number) {
  const id = GUIUtility.getControlID(0);
  const before = GUIUtility.hotControl;
  Handles.color = tint(id, CenterColor);
  const s = EditorSnapSettings.incrementalSnapActive ? EditorSnapSettings.move : Vector3.zero;
  const next = Handles.freeMoveHandle(id, pos, size * 0.15, s, rectCap);
  track(before, id, 'Move', pos, rot);
  if (session?.id === id && GUI.changed) applyMove(next.sub(session.pivot));
}

// ---- Vertex snapping ----

function worldVertices(go: GameObject) {
  const m = go.mesh;
  if (!m || !go.visible) return [];
  const t = go.transform;
  return m.vertices.map((v) => t.transformPoint(v));
}

function nearestVertex(objects: Iterable<GameObject>, mouse: Vector2, maxDistance = Infinity) {
  let best: Vector3 | null = null;
  let bestD = maxDistance;
  for (const go of objects)
    for (const p of worldVertices(go)) {
      const d = HandleUtility.worldToGUIPoint(p).sub(mouse).magnitude;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  return best;
}

function vertexSnapHandle() {
  const ev = Event.current;
  const selected = new Set<GameObject>();
  for (const t of Selection.transforms) for (const d of t.walk()) selected.add(d.gameObject);
  const dragging = session?.vertex;
  const grab = dragging ?? nearestVertex(selected, ev.mousePosition) ?? Tools.handlePosition;
  const size = HandleUtility.getHandleSize(grab);
  const id = GUIUtility.getControlID(0);
  const before = GUIUtility.hotControl;
  Handles.color = tint(id, CenterColor);
  const next = Handles.freeMoveHandle(id, grab, size * 0.15, Vector3.zero, rectCap);
  if (track(before, id, 'Move', grab, Quaternion.identity) && session) session.vertex = grab;
  if (session?.id === id && GUI.changed) {
    const others = [...(Scene.current?.allObjects() ?? [])].filter((o) => !selected.has(o));
    const target = nearestVertex(others, ev.mousePosition, VertexSnapRadius) ?? next;
    applyMove(target.sub(session.pivot));
  }
}

// ---- Rotate ----

/** The half of an axis ring that faces the camera, or all of it seen end-on. */
function ringPoints(center: Vector3, axis: Vector3, radius: number) {
  const toCam = toCamera(center);
  let m = Vector3.projectOnPlane(toCam, axis);
  const full = m.magnitude < 0.05;
  m = full ? anyPerpendicular(axis) : m.normalized;
  const s = Vector3.cross(axis, m).normalized;
  const pts: Vector3[] = [];
  const n = full ? 64 : 32;
  const span = full ? Math.PI * 2 : Math.PI;
  for (let k = 0; k <= n; k++) {
    const th = (k / n) * span - (full ? 0 : Math.PI / 2);
    pts.push(center.add(m.mul(Math.cos(th) * radius)).add(s.mul(Math.sin(th) * radius)));
  }
  return pts;
}

function anyPerpendicular(n: Vector3) {
  const a = Vector3.cross(n, Math.abs(n.y) < 0.9 ? Vector3.up : Vector3.right);
  return a.normalized;
}

function closestOnPolyline(pts: Vector3[], mouse: Vector2) {
  let best = pts[0];
  let bestD = Infinity;
  for (const p of pts) {
    const d = HandleUtility.worldToGUIPoint(p).sub(mouse).magnitude;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function rotateHandle(pos: Vector3, rot: Quaternion) {
  const ev = Event.current;
  const size = HandleUtility.getHandleSize(pos);
  const toCam = toCamera(pos);

  // Free rotate inside the sphere, a little behind the rings so a ring under the cursor wins.
  {
    const id = GUIUtility.getControlID(0);
    if (ev.type === EventType.Layout) HandleUtility.addControl(id, HandleUtility.distanceToCircle(pos, size) + 4.9);
    customDrag(id, pos, rot, 'Rotate', (s) => {
      const c = Camera();
      const r = Math.max(
        1,
        HandleUtility.worldToGUIPoint(pos.add(c.right.mul(size))).sub(HandleUtility.worldToGUIPoint(pos)).magnitude,
      );
      const k = Mathf.Rad2Deg / r;
      const q = Quaternion.angleAxis(-ev.delta.x * k, c.up).mul(Quaternion.angleAxis(-ev.delta.y * k, c.right));
      s.handleRot = q.mul(s.handleRot);
      applyRotation(s.handleRot);
    });
    if (
      ev.type === EventType.Repaint &&
      (GUIUtility.hotControl === id || (GUIUtility.hotControl === 0 && HandleUtility.nearestControl === id))
    ) {
      Handles.color = new Color(CenterColor.r, CenterColor.g, CenterColor.b, 0.08);
      Handles.drawSolidDisc(pos, toCam, size);
    }
  }

  // The view ring: turns about the camera's line of sight.
  {
    const id = GUIUtility.getControlID(0);
    const radius = size * 1.1;
    if (ev.type === EventType.Layout) HandleUtility.addControl(id, ringGap(pos, radius));
    customDrag(id, pos, rot, 'Rotate', (s) => {
      const center = HandleUtility.worldToGUIPoint(pos);
      const a = s.startMouse.sub(center);
      const b = s.mouse.sub(center);
      const angle = Vector2.signedAngle(a, b) * s.sign;
      const v = snap(angle, EditorSnapSettings.rotate);
      applyRotation(Quaternion.angleAxis(v, toCam));
      s.value = v;
    });
    Handles.color = tint(id, CenterColor);
    Handles.drawWireDisc(pos, toCam, radius, GUIUtility.hotControl === id ? 2 : 1);
  }

  for (let i = 0; i < 3; i++) {
    const axis = rot.mulV(Axes[i]);
    const id = GUIUtility.getControlID(0);
    const pts = ringPoints(pos, axis, size);
    if (ev.type === EventType.Layout) HandleUtility.addControl(id, HandleUtility.distanceToPolyLine(...pts));
    customDrag(
      id,
      pos,
      rot,
      'Rotate',
      (s) => {
        const d = HandleUtility.calcLineTranslation(s.startMouse, s.mouse, s.grab, s.tangent);
        const v = snap((d / size) * Mathf.Rad2Deg, EditorSnapSettings.rotate);
        applyRotation(Quaternion.angleAxis(v, axis));
        s.value = v;
      },
      (s) => {
        s.grab = closestOnPolyline(pts, ev.mousePosition);
        const v = s.grab.sub(pos);
        s.tangent = Quaternion.angleAxis(1, axis).mulV(v).sub(v).normalized;
      },
    );
    const hot = GUIUtility.hotControl === id;
    Handles.color = tint(id, AxisColors[i]);
    if (ev.type === EventType.Repaint) {
      for (let k = 0; k + 1 < pts.length; k++)
        Handles.drawLine(pts[k], pts[k + 1], hot || HandleUtility.nearestControl === id ? 2.5 : 1.6);
      if (hot && session) {
        Handles.color = new Color(AxisColors[i].r, AxisColors[i].g, AxisColors[i].b, 0.15);
        Handles.drawSolidArc(pos, axis, session.grab.sub(pos), session.value, size);
      }
    }
  }
}

/** Distance to a thin ring: zero only near its line, so the free-rotate disc inside stays reachable. */
function ringGap(pos: Vector3, radius: number) {
  const c = HandleUtility.worldToGUIPoint(pos);
  const e = HandleUtility.worldToGUIPoint(pos.add(Camera().right.mul(radius)));
  const r = e.sub(c).magnitude;
  return Math.abs(Event.current.mousePosition.sub(c).magnitude - r);
}

// ---- Scale ----

function scaleHandle(pos: Vector3, rot: Quaternion) {
  const ev = Event.current;
  const size = HandleUtility.getHandleSize(pos);
  for (let i = 0; i < 3; i++) {
    const dir = rot.mulV(Axes[i]);
    const alpha = axisAlpha(dir, pos);
    const id = GUIUtility.getControlID(0);
    const factor = session?.id === id ? 1 + session.value : 1;
    const end = pos.add(dir.mul(size * factor));
    if (ev.type === EventType.Layout && alpha > 0)
      HandleUtility.addControl(
        id,
        Math.min(HandleUtility.distanceToLine(pos, end), HandleUtility.distanceToCube(end, rot, size * 0.1)),
      );
    customDrag(id, pos, rot, 'Scale', (s) => {
      const d = HandleUtility.calcLineTranslation(s.startMouse, s.mouse, pos, dir);
      s.value = snap(d / size, EditorSnapSettings.scale);
      applyScale(Vector3.one.with(i, 1 + s.value));
    });
    if (alpha <= 0) continue;
    const c = tint(id, AxisColors[i]);
    Handles.color = new Color(c.r, c.g, c.b, c.a * alpha);
    Handles.drawLine(pos, end, 2);
    if (ev.type === EventType.Repaint) Handles.cubeHandleCap(id, end, rot, size * 0.1, ev.type);
  }
  uniformScale(pos, rot, size);
}

function uniformScale(pos: Vector3, rot: Quaternion, size: number) {
  const ev = Event.current;
  const id = GUIUtility.getControlID(0);
  if (ev.type === EventType.Layout) HandleUtility.addControl(id, HandleUtility.distanceToCube(pos, rot, size * 0.15));
  customDrag(id, pos, rot, 'Scale', (s) => {
    const d = s.mouse.sub(s.startMouse);
    // HandleUtility.niceMouseDelta: the larger axis, right and up growing.
    const nice = Math.abs(d.x) > Math.abs(d.y) ? d.x : -d.y;
    s.value = snap(nice * 0.01, EditorSnapSettings.scale);
    const f = Math.max(0.01, 1 + s.value);
    applyScale(new Vector3(f, f, f));
  });
  Handles.color = tint(id, CenterColor);
  if (ev.type === EventType.Repaint) Handles.cubeHandleCap(id, pos, rot, size * 0.15, ev.type);
}

// ---- a hand-rolled drag for the handles the Handles API has no slider for ----

interface DragState {
  startMouse: Vector2;
  mouse: Vector2;
  grab: Vector3;
  tangent: Vector3;
  sign: number;
  value: number;
  handleRot: Quaternion;
}
const drag: DragState = {
  startMouse: Vector2.zero,
  mouse: Vector2.zero,
  grab: Vector3.zero,
  tangent: Vector3.zero,
  sign: 1,
  value: 0,
  handleRot: Quaternion.identity,
};

function customDrag(
  id: number,
  pos: Vector3,
  rot: Quaternion,
  name: string,
  onDrag: (s: DragState) => void,
  onPress?: (s: DragState) => void,
) {
  const ev = Event.current;
  switch (ev.type) {
    case EventType.MouseDown:
      if (HandleUtility.nearestControl !== id || ev.button !== 0 || ev.alt || GUIUtility.hotControl !== 0) return;
      GUIUtility.hotControl = id;
      track(0, id, name, pos, rot);
      drag.startMouse = drag.mouse = ev.mousePosition;
      drag.value = 0;
      drag.handleRot = Quaternion.identity;
      drag.sign = viewRingSign(pos);
      onPress?.(drag);
      if (session) {
        session.grab = drag.grab;
        session.value = 0;
      }
      ev.use();
      return;
    case EventType.MouseDrag:
      if (GUIUtility.hotControl !== id) return;
      drag.mouse = drag.mouse.add(ev.delta);
      onDrag(drag);
      if (session) session.value = drag.value;
      GUI.changed = true;
      ev.use();
      return;
    case EventType.MouseUp:
      if (GUIUtility.hotControl !== id || (ev.button !== 0 && ev.button !== 2)) return;
      GUIUtility.hotControl = 0;
      ev.use();
      return;
  }
}

/** Which way a positive turn about the line of sight goes on screen, settled by trying one. */
function viewRingSign(pos: Vector3) {
  const c = Camera();
  const toCam = toCamera(pos);
  const a = HandleUtility.worldToGUIPoint(pos.add(c.right)).sub(HandleUtility.worldToGUIPoint(pos));
  const b = HandleUtility.worldToGUIPoint(pos.add(Quaternion.angleAxis(10, toCam).mulV(c.right))).sub(
    HandleUtility.worldToGUIPoint(pos),
  );
  return Vector2.signedAngle(a, b) > 0 ? 1 : -1;
}

export const UnityToolHandles = {
  install() {
    // The Editor's own V; Blendon's vertex snapping takes the key while its tools are live.
    ShortcutManager.registerNative(
      VertexSnapId,
      (args) => {
        vertexHeld = args.stage !== ShortcutStage.End;
        SceneViewNow.view?.repaint();
      },
      true,
      'V',
      '',
      true,
    );
  },

  onGUI(view: SceneView) {
    SceneViewNow.view = view;
    endIfReleased();
    if (Tools.hidden || !Selection.activeTransform || Selection.transforms.length === 0) {
      if (session && GUIUtility.hotControl === session.id) GUIUtility.hotControl = 0;
      endIfReleased();
      return;
    }
    const savedColor = Handles.color;
    // Held still for a turn or a scale: the bounds centre would drift under the drag.
    const pivot = !session ? Tools.handlePosition : session.name === 'Move' ? livePivot() : session.pivot;
    const handleRot = session ? session.handleRot : Tools.handleRotation;
    switch (Tools.current) {
      case Tool.Move:
        if (vertexHeld) vertexSnapHandle();
        else moveHandle(pivot, handleRot);
        break;
      case Tool.Rotate:
        rotateHandle(pivot, handleRot);
        break;
      case Tool.Scale:
        // The Editor's scale handle always follows the active object's own axes.
        scaleHandle(pivot, session ? session.handleRot : Selection.activeTransform.rotation);
        break;
      case Tool.Transform:
        rotateHandle(pivot, handleRot);
        if (vertexHeld) vertexSnapHandle();
        else moveHandle(pivot, handleRot);
        break;
    }
    Handles.color = savedColor;
  },
};

/** Where a move drag's handle sits now: its start plus the selection's travel. */
function livePivot() {
  if (!session) return Tools.handlePosition;
  const [t, s] = session.starts.entries().next().value as [Transform, Start];
  return session.pivot.add(t.position.sub(s.p));
}
