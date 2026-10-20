// Unity 6.4's Handles for the built-in tools: PositionHandle, RotationHandle, ScaleHandle and TransformHandle with
// their sliders and caps, ported from the reference source so they pick the way the Editor's do. They wear Blendon's
// Unity+ preset (sizes, line widths, palette), so next to Blendon's tools on that preset only the edges differ.
import { D } from '../../../plugin/window-data.ts';
import {
  EditorSnapSettings,
  heldModifiers,
  PivotRotation,
  Selection,
  SelectionMode,
  Tools,
} from '../../unity/editor.ts';
import { EditorGUI, EditorGUIUtility, GUI, Handles, HandleUtility, type CapFunction } from '../../unity/handles.ts';
import { Event, EventType, GUIUtility } from '../../unity/imgui.ts';
import { Color, Mathf, Quaternion, Vector2, Vector3 } from '../../unity/math.ts';
import type { GameObject } from '../../unity/scene.ts';
import { Scene } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import {
  calcDrawOrder,
  CameraViewThreshold,
  cameraViewLerp,
  discDegrees,
  discSectionPoints,
  discTangent,
  snapTo,
} from './handle-math.ts';

const CenterColor = new Color(0.8, 0.8, 0.8, 0.93);
// Handles.selectedColor, also the rotation pie's colour.
const SelectedColor = new Color(246 / 255, 242 / 255, 50 / 255, 0.89);
// The other handles while one is dragged.
const DisabledColor = new Color(0.5, 0.5, 0.5, 0.5);
const FreeRotateColor = new Color(0, 0, 0, 0.3);
const DimmingColor = new Color(0, 0, 0, 0.078);
const Axes = [Vector3.right, Vector3.up, Vector3.forward];
// SceneView.handleLineThickness's default; under the cursor a line gets a point thicker and a cap 5 % bigger.
const LineThickness = 2;
const HoverExtraThickness = 1;
const HoverExtraScale = 1.05;
const HoverAlpha = 1.33;
const FreeMoveSizeFactor = 0.15;
// A ring's pick distance is scaled down, so the thin line is easy to catch.
const GrabZoneScale = 0.3;

// ---- the handles' parameters, as Unity's PositionHandleParam, RotationHandleParam and ScaleHandleParam ----

const P = { X: 1, Y: 2, Z: 4, XY: 8, YZ: 16, XZ: 32, XYZ: 64 };
const R = { X: 1, Y: 2, Z: 4, Camera: 8, XYZ: 16 };
const S = { X: 1, Y: 2, Z: 4, XYZ: 8 };

/** An arrow along its axis in handle sizes: the line from start to end, then a cone of its own size. */
interface Arrow {
  start: number;
  end: number;
  cone: number;
  thickness: number;
}

interface PositionParam {
  handles: number;
  arrow: Arrow;
  planeSize: number;
  cameraAxes: boolean;
  cameraPlanes: boolean;
}

interface RotationParam {
  handles: number;
  axisSize: number;
  xyzSize: number;
  cameraAxisSize: number;
  circle: boolean;
  thickness: number;
  cameraColor: Color;
}

interface ScaleParam {
  handles: number;
  axisOffset: number;
  lineScale: number;
  thickness: number;
  cube: number;
  centerColor: Color;
}

type ToolParams = { p: PositionParam; r: RotationParam; s: ScaleParam };

interface Look {
  axis: Color[];
  /** Alpha on every line, where Unity has Handles.lineTransparency. */
  lineAlpha: number;
  planeOutline: number;
  /** A plane's fill at rest and under the cursor. Unity's own is the colour squared, Blendon's the colour as is. */
  plane: { idle: number; hover: number; squared: boolean };
  cameraRingThickness: number;
  /** The free rotation's fill at rest and under the cursor, or null for Unity's dark circle. */
  trackball: { idle: Color; hover: Color } | null;
  position: PositionParam;
  /** Shift or vertex snapping: the centre square instead of the planes. */
  freeMove: PositionParam;
  rotation: RotationParam;
  scale: ScaleParam;
  transform: { global: ToolParams; camera: ToolParams; local: ToolParams; vertex: ToolParams };
}

const UnityPlus = 'Unity+';
let builtLook: Look | null = null;

/** Built on first use: the preset ships with the window data, which loads before the scene draws. */
function look() {
  return (builtLook ??= buildLook(D?.gizmoPresets.find((p) => p.name === UnityPlus)?.values ?? {}));
}

/** Blendon's settings keys mapped onto Unity's parameters. A key the preset lacks keeps Unity's own value. */
function buildLook(values: Record<string, unknown>): Look {
  const num = (key: string, unity: number) => (typeof values[key] === 'number' ? values[key] : unity);
  const color = (key: string, unity: Color) => (typeof values[key] === 'string' ? Color.hex(values[key]) : unity);
  // Blendon's AxisOffset is a share of AxisLength, its cone sits right past the line.
  const arrow = (page: string, unity: Arrow): Arrow => {
    const end = num(`${page}.AxisLength`, unity.end);
    return {
      start: num(`${page}.AxisOffset`, unity.start / unity.end) * end,
      end,
      cone: num(`${page}.AxisHeadSize`, unity.cone),
      thickness: num(`${page}.AxisThickness`, unity.thickness),
    };
  };
  const ring = (page: string, unity: { axis: number; xyz: number; camera: number }) => ({
    axisSize: num(`${page}.AxisLength`, unity.axis),
    xyzSize: num(`${page}.TrackballRadius`, unity.xyz),
    cameraAxisSize: num(`${page}.ScreenRingRadius`, unity.camera),
    thickness: num(`${page}.AxisThickness`, LineThickness),
    cameraColor: color(`${page}.ScreenRingColor`, new Color(0.8, 0.8, 0.8, 0.93)),
  });
  const trackball = num('RotateGizmoSettings.TrackballOpacity', -1);
  const opacity = num('SharedGizmoSettings.Opacity', 1);
  // Blendon's trackball is all but clear at rest and takes its opacity only under the cursor.
  const fill = (alpha: number) => Color.white.withAlpha(alpha * opacity);
  const scaleCube = num('ScaleGizmoSettings.AxisHeadSize', 0.1);

  // Unity's own: the arrows from the pivot, a 0.9 line and a 0.2 cone; TransformHandleParam.Default pushes them out.
  const position: PositionParam = {
    handles: P.X | P.Y | P.Z | P.XY | P.YZ | P.XZ,
    arrow: arrow('MoveGizmoSettings', { start: 0, end: 0.9, cone: 0.2, thickness: LineThickness }),
    planeSize: 2 * num('MoveGizmoSettings.PlaneSize', 0.125),
    cameraAxes: false,
    cameraPlanes: true,
  };
  const transformPosition: PositionParam = {
    ...position,
    arrow: arrow('TransformMoveSettings', { start: 0.15, end: 1.05, cone: 0.2, thickness: LineThickness }),
    planeSize: 2 * num('TransformMoveSettings.PlaneSize', 0.1875),
  };
  const transformRing = ring('TransformRotateSettings', { axis: 1.4, xyz: 1.4, camera: 1.5 });
  const scale: ScaleParam = {
    handles: 15,
    axisOffset: 0,
    // The cube's centre, where Blendon has the line's end plus half the cube.
    lineScale: num('ScaleGizmoSettings.AxisLength', 0.95) + scaleCube / 2,
    thickness: num('ScaleGizmoSettings.AxisThickness', LineThickness),
    cube: scaleCube,
    centerColor: color('ScaleGizmoSettings.ScreenRingColor', new Color(0.8, 0.8, 0.8, 0.93)),
  };
  const transformScale: ScaleParam = {
    ...scale,
    handles: S.XYZ,
    lineScale: 1,
    centerColor: color('TransformScaleSettings.ScreenRingColor', scale.centerColor),
  };
  const local: ScaleParam = { ...transformScale, handles: 15, axisOffset: 1.5, lineScale: 0.25 };

  return {
    axis: [
      color('GeneralSettings.AxisColorX', new Color(219 / 255, 62 / 255, 29 / 255, 0.93)),
      color('GeneralSettings.AxisColorY', new Color(154 / 255, 243 / 255, 72 / 255, 0.93)),
      color('GeneralSettings.AxisColorZ', new Color(58 / 255, 122 / 255, 248 / 255, 0.93)),
    ],
    lineAlpha: num('SharedGizmoSettings.Opacity', 0.75),
    planeOutline: num('MoveGizmoSettings.PlaneOutlineThickness', 0),
    plane:
      'SharedGizmoSettings.Opacity' in values
        ? { idle: 0.5 * opacity, hover: 0.75 * opacity, squared: false }
        : { idle: 0.1, hover: 0.4, squared: true },
    cameraRingThickness: num('SharedGizmoSettings.ScreenRingThickness', LineThickness),
    trackball: trackball < 0 ? null : { idle: fill(0.01), hover: fill(Math.min(trackball * 1.5, 0.3)) },
    position,
    freeMove: { ...position, handles: P.X | P.Y | P.Z | P.XYZ, cameraPlanes: false },
    rotation: { handles: 31, circle: true, ...ring('RotateGizmoSettings', { axis: 1, xyz: 1, camera: 1.1 }) },
    scale,
    transform: {
      global: { p: transformPosition, r: { handles: 31, circle: true, ...transformRing }, s: transformScale },
      camera: {
        p: { ...transformPosition, handles: P.X | P.Y | P.XY, cameraPlanes: false },
        r: { handles: R.Z | R.XYZ, circle: false, ...transformRing },
        s: transformScale,
      },
      local: { p: transformPosition, r: { handles: 31, circle: true, ...transformRing }, s: local },
      vertex: {
        p: { ...transformPosition, handles: P.X | P.Y | P.Z | P.XYZ, cameraPlanes: false },
        r: { handles: 0, circle: true, ...transformRing },
        s: { ...local, handles: 0 },
      },
    },
  };
}

// ---- shared helpers ----

const camera = () => (SceneView.currentDrawingSceneView ?? SceneView.lastActiveSceneView)!.camera;
const dragging = () => GUIUtility.hotControl !== 0;
const hovering = (id: number) => id === HandleUtility.nearestControl && GUIUtility.hotControl === 0;
export const controlIds = (n: number) => Array.from({ length: n }, () => GUIUtility.getControlID(0));
// EditorSnapSettings.angleSnapEnabled and scaleSnapEnabled: the toolbar toggles, inverted while Ctrl is held.
const angleSnap = () => EditorSnapSettings.angleSnapEnabled !== heldModifiers.action;
const scaleSnap = () => EditorSnapSettings.scaleSnapEnabled !== heldModifiers.action;

/** Handles.SetupHandleColor: selected while dragged, more opaque and thicker under the cursor. */
function setupColor(id: number, thickness = LineThickness) {
  if (id === GUIUtility.hotControl) {
    Handles.color = SelectedColor;
    return thickness;
  }
  if (!hovering(id)) return thickness;
  const c = Handles.color;
  Handles.color = new Color(c.r, c.g, c.b, Mathf.Clamp01(c.a * HoverAlpha));
  return thickness + HoverExtraThickness;
}

/** Handles.GetFadedAxisColor: a handle under the cursor or in hand never fades. */
function fadedColor(col: Color, fade: number, id: number) {
  if ((id !== 0 && id === GUIUtility.hotControl) || id === HandleUtility.nearestControl) fade = 0;
  return Color.lerp(col, Color.clear, fade);
}

/** Handles.GetCameraViewFrom: the line of sight in the handle's own axes. */
function viewVector(position: Vector3, rotation: Quaternion) {
  const c = camera();
  const v = c.orthographic ? c.forward : position.sub(c.position).normalized;
  return Quaternion.inverse(rotation).mulV(v);
}

/** Handles.DrawLine / DrawWireArc: one stroke, thin at thickness 0, in points otherwise. */
function lines(points: Vector3[], thickness: number) {
  if (Event.current.type !== EventType.Repaint || points.length < 2) return;
  const saved = Handles.color;
  Handles.color = saved.withAlpha(saved.a * look().lineAlpha);
  if (points.every((p) => HandleUtility.worldToGUIPointWithDepth(p).z > 0))
    Handles.drawAAPolyLine(Math.max(1, thickness * EditorGUIUtility.pixelsPerPoint), ...points);
  else for (let i = 0; i + 1 < points.length; i++) Handles.drawLine(points[i], points[i + 1], thickness);
  Handles.color = saved;
}

const wireArc = (center: Vector3, normal: Vector3, from: Vector3, angle: number, radius: number, thickness: number) =>
  lines(discSectionPoints(center, normal, from, angle, radius), thickness);

const distanceToArc = (center: Vector3, normal: Vector3, from: Vector3, angle: number, radius: number) =>
  HandleUtility.distanceToPolyLine(...discSectionPoints(center, normal, from, angle, radius));

/** HandleUtility.ClosestPointToArc: the nearest segment on screen, then the point along it. */
function closestPointToArc(center: Vector3, normal: Vector3, from: Vector3, angle: number, radius: number) {
  const v = discSectionPoints(center, normal, from, angle, radius);
  let nearest = 0;
  let best = HandleUtility.distanceToLine(v[0], v[1]);
  for (let i = 2; i < v.length; i++) {
    const d = HandleUtility.distanceToLine(v[i - 1], v[i]);
    if (d < best) {
      best = d;
      nearest = i - 1;
    }
  }
  const a = HandleUtility.worldToGUIPoint(v[nearest]);
  const dir = HandleUtility.worldToGUIPoint(v[nearest + 1]).sub(a);
  let t = Vector2.dot(dir, Event.current.mousePosition.sub(a));
  if (dir.magnitude > 1e-6) t /= dir.sqrMagnitude;
  return Vector3.lerp(v[nearest], v[nearest + 1], Mathf.Clamp01(t));
}

/** HandleUtility.DistanceToCone: the hull of the cone mesh's apex and six base points. */
function distanceToCone(position: Vector3, rotation: Quaternion, size: number) {
  const r = 0.4 * size;
  const base = -0.5 * size;
  const local = [
    new Vector3(0, 0, 0.7 * size),
    new Vector3(r, 0, base),
    new Vector3(-r, 0, base),
    new Vector3(r * 0.5, r * 0.866, base),
    new Vector3(-r * 0.5, r * 0.866, base),
    new Vector3(r * 0.5, -r * 0.866, base),
    new Vector3(-r * 0.5, -r * 0.866, base),
  ];
  return HandleUtility.distanceToPolygon(
    hull(local.map((v) => HandleUtility.worldToGUIPoint(position.add(rotation.mulV(v))))),
  );
}

/** Convex hull, monotone chain. */
function hull(points: Vector2[]) {
  const s = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vector2, a: Vector2, b: Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Vector2[]) => {
    const out: Vector2[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return half(s).concat(half(s.reverse()));
}

// ---- caps ----

/**
 * Handles.ArrowHandleCap: the arrow's line from the cap's position and its cone right past it. While dragged the
 * arrow starts at the pivot, so the line reaches back by the arrow's start.
 */
function arrowCap(arrow: Arrow, reachBack: number): CapFunction {
  return (id, position, rotation, size, type) => {
    const dir = rotation.mulV(Vector3.forward);
    const length = arrow.end - arrow.start + reachBack;
    const lineEnd = position.add(dir.mul(size * length));
    const coneAt = (s: number) => position.add(dir.mul(size * length + s / 2));
    if (type === EventType.Layout) {
      HandleUtility.addControl(id, HandleUtility.distanceToLine(position, lineEnd));
      HandleUtility.addControl(id, distanceToCone(coneAt(size * arrow.cone), rotation, size * arrow.cone));
    } else if (type === EventType.Repaint) {
      let thickness = arrow.thickness;
      let cone = size * arrow.cone;
      if (hovering(id)) {
        thickness += HoverExtraThickness;
        cone *= HoverExtraScale;
      }
      const tip = coneAt(cone);
      const line = [position, lineEnd];
      // Back to front, so the blend reads right.
      if (Vector3.dot(camera().forward, dir) < 0) {
        lines(line, thickness);
        Handles.coneHandleCap(id, tip, rotation, cone, type);
      } else {
        Handles.coneHandleCap(id, tip, rotation, cone, type);
        lines(line, thickness);
      }
    }
  };
}

/** Handles.RectangleHandleCap: an outline, thin at thickness 0, size being half its side. */
const rectangleCap =
  (thickness: number): CapFunction =>
  (id, position, rotation, size, type) => {
    if (type === EventType.Layout)
      HandleUtility.addControl(id, HandleUtility.distanceToRectangle(position, rotation, size));
    else if (type === EventType.Repaint) {
      const r = rotation.mulV(new Vector3(size, 0, 0));
      const u = rotation.mulV(new Vector3(0, size, 0));
      const p = position;
      lines([p.add(r).add(u), p.add(r).sub(u), p.sub(r).sub(u), p.sub(r).add(u), p.add(r).add(u)], thickness);
    }
  };

// ---- Slider1D ----

const slide = {
  origin: Vector3.zero,
  dir: Vector3.forward,
  offset: Vector3.zero,
  startSize: 1,
  startPosition: Vector3.zero,
  startMouse: Vector2.zero,
};

/** HandleUtility.CalcPositionOnConstraint: the cursor ray on a plane through the axis that faces the camera. */
function positionOnConstraint(gui: Vector2, origin: Vector3, dir: Vector3): Vector3 | null {
  const tangent = Vector3.cross(dir, camera().position.sub(origin));
  const normal = Vector3.cross(dir, tangent).normalized;
  const ray = HandleUtility.guiPointToWorldRay(gui);
  const along = Vector3.dot(ray.direction, normal);
  // Near parallel the hit shoots off to infinity, so Unity falls back to screen space there.
  if (!(along > 0.05)) return null;
  const t = Vector3.dot(origin.sub(ray.origin), normal) / along;
  if (!(t > 0)) return null;
  const hit = ray.getPoint(t);
  return origin.add(dir.mul(Vector3.dot(dir, hit.sub(origin)) / dir.sqrMagnitude));
}

/** Mirrors Unity's Slider1D: the grab point stays under the cursor along the axis. */
function slider1D(
  id: number,
  position: Vector3,
  offset: Vector3,
  dir: Vector3,
  size: number,
  cap: CapFunction,
  snap: number,
) {
  const ev = Event.current;
  const look = Quaternion.lookRotation(dir);
  switch (ev.type) {
    case EventType.Layout:
    case EventType.MouseMove:
      cap(id, position.add(offset), look, size, EventType.Layout);
      break;
    case EventType.MouseDown:
      if (HandleUtility.nearestControl === id && ev.button === 0 && GUIUtility.hotControl === 0 && !ev.alt) {
        GUIUtility.hotControl = id;
        const p = positionOnConstraint(ev.mousePosition, position, dir);
        Object.assign(slide, {
          origin: position,
          dir,
          offset: p ? position.sub(p) : Vector3.zero,
          startSize: HandleUtility.getHandleSize(p ?? position),
          startPosition: position,
          startMouse: ev.mousePosition,
        });
        ev.use();
      }
      break;
    case EventType.MouseDrag:
      if (GUIUtility.hotControl !== id) break;
      {
        const p = positionOnConstraint(ev.mousePosition, slide.origin, slide.dir);
        if (p) {
          let world = p.add(slide.offset.mul(HandleUtility.getHandleSize(p) / slide.startSize));
          if (EditorSnapSettings.incrementalSnapActive) {
            const d = world.sub(slide.origin);
            const dist = snapTo(d.magnitude, snap) * Mathf.Sign(Vector3.dot(slide.dir, d));
            world = slide.origin.add(slide.dir.normalized.mul(dist));
          }
          position = world;
          slide.startPosition = position;
          slide.startMouse = ev.mousePosition;
        } else {
          let dist = HandleUtility.calcLineTranslation(slide.startMouse, ev.mousePosition, slide.startPosition, dir);
          if (EditorSnapSettings.incrementalSnapActive) dist = snapTo(dist, snap);
          position = slide.startPosition.add(slide.dir.mul(dist));
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
    case EventType.Repaint: {
      const saved = Handles.color;
      setupColor(id);
      cap(id, position.add(offset), look, size, EventType.Repaint);
      Handles.color = saved;
      break;
    }
  }
  return position;
}

// ---- FreeMove ----

const free = { startMouse: Vector2.zero, currentMouse: Vector2.zero, startPosition: Vector3.zero };

/** Mirrors Unity's FreeMove: the cursor's travel on the camera plane, or the vertex under it while snapping. */
function freeMove(id: number, position: Vector3, size: number, snap: Vector3) {
  const ev = Event.current;
  const c = camera();
  switch (ev.type) {
    case EventType.Layout:
    case EventType.MouseMove:
      rectangleCap(0)(id, position, c.rotation, size, EventType.Layout);
      break;
    case EventType.MouseDown:
      if (HandleUtility.nearestControl === id && ev.button === 0) {
        GUIUtility.hotControl = id;
        free.startMouse = free.currentMouse = ev.mousePosition;
        free.startPosition = position;
        ev.use();
      }
      break;
    case EventType.MouseDrag:
      if (GUIUtility.hotControl !== id) break;
      {
        free.currentMouse = free.currentMouse.add(ev.delta);
        const target = HandleUtility.worldToGUIPoint(free.startPosition).add(free.currentMouse.sub(free.startMouse));
        const ray = HandleUtility.guiPointToWorldRay(target);
        const along = Vector3.dot(ray.direction, c.forward);
        if (Math.abs(along) > 1e-8)
          position = ray.getPoint(Vector3.dot(free.startPosition.sub(ray.origin), c.forward) / along);
        const near = Tools.vertexDragging ? nearestTargetVertex(ev.mousePosition) : null;
        if (near) position = near;
        else if (!Tools.vertexDragging && EditorSnapSettings.incrementalSnapActive && !ev.shift) {
          const d = position.sub(free.startPosition);
          position = free.startPosition.add(new Vector3(snapTo(d.x, snap.x), snapTo(d.y, snap.y), snapTo(d.z, snap.z)));
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
    case EventType.Repaint: {
      const saved = Handles.color;
      setupColor(id);
      rectangleCap(0)(id, position, c.rotation, size, EventType.Repaint);
      Handles.color = saved;
      break;
    }
  }
  return position;
}

// ---- PositionHandle ----

// Which side of the pivot the planes and arrows sit on; frozen while anything is dragged.
const planarOctant = [1, 1, 1];
const axisOctant = [1, 1, 1];
// For each axis, the plane id besides ids[3 + axis] that also moves along it.
const PrevPlane = [5, 3, 4];
let freeMoveMode = false;

/** Handles.DoPositionHandle: Shift or vertex snapping trade the planes for the centre square. */
function positionHandle(ids: number[], position: Vector3, rotation: Quaternion) {
  const ev = Event.current;
  if (ev.type === EventType.Layout) {
    if (Tools.vertexDragging) freeMoveMode = true;
    else if (!dragging()) freeMoveMode = ev.shift;
  }
  return positionHandleInternal(ids, position, rotation, freeMoveMode ? look().freeMove : look().position);
}

/** Mirrors Unity's Handles.DoPositionHandle_Internal; ids are x, y, z, xy, yz, xz, xyz. */
function positionHandleInternal(ids: number[], position: Vector3, rotation: Quaternion, param: PositionParam) {
  const saved = Handles.color;
  const hot = GUIUtility.hotControl;
  const view = viewVector(position, rotation);
  const size = HandleUtility.getHandleSize(position);
  const fade: number[] = [];
  for (let i = 0; i < 3; i++) fade[i] = ids[i] === hot ? 0 : cameraViewLerp(view, Axes[i]);
  for (let i = 0; i < 3; i++) fade[3 + i] = Math.max(fade[i], fade[(i + 1) % 3]);
  const isHot = ids.includes(hot);
  const axisOffset = isHot ? 0 : param.arrow.start;

  for (let i = 0; i < 3; i++) {
    if (!(param.handles & (P.XY << i)) || (isHot && ids[3 + i] !== hot)) continue;
    const f = isHot ? 0 : fade[3 + i];
    if (f <= CameraViewThreshold)
      position = planarHandle(ids[3 + i], i, position, rotation, size * param.planeSize, f, view, param.cameraPlanes);
  }

  // After the planes, so an arrow wins where they overlap.
  for (const i of calcDrawOrder(view)) {
    if (!(param.handles & (1 << i))) continue;
    if (!dragging()) axisOctant[i] = param.cameraAxes && view.get(i) > 0.01 ? -1 : 1;
    const thisHot = isHot && ids[i] === hot;
    const f = thisHot ? 0 : fade[i];
    if (f > CameraViewThreshold) continue;
    let color = fadedColor(look().axis[i], f, ids[i]);
    const dir = rotation.mulV(Axes[i]).mul(axisOctant[i]);
    if (isHot && !thisHot) color = DisabledColor;
    if (isHot && (ids[PrevPlane[i]] === hot || ids[i + 3] === hot)) color = SelectedColor;
    Handles.color = color;
    const snap = EditorSnapSettings.gridSnapActive ? 0 : EditorSnapSettings.move.get(i);
    const cap = arrowCap(param.arrow, isHot ? param.arrow.start : 0);
    position = slider1D(ids[i], position, dir.mul(axisOffset * size), dir, size, cap, snap);
  }

  if (param.handles & P.XYZ && (ids[6] === hot || !isHot)) {
    Handles.color = CenterColor;
    const snap = EditorSnapSettings.gridSnapActive ? Vector3.zero : EditorSnapSettings.move;
    position = freeMove(ids[6], position, size * FreeMoveSizeFactor, snap);
  }
  Handles.color = saved;
  return position;
}

/** Mirrors Unity's Handles.DoPlanarHandle: a square in the quadrant facing the camera. */
function planarHandle(
  id: number,
  axis1: number,
  position: Vector3,
  rotation: Quaternion,
  handleSize: number,
  fade: number,
  view: Vector3,
  cameraOrientation: boolean,
) {
  const axis2 = (axis1 + 1) % 3;
  const normalAxis = (axis1 + 2) % 3;
  let color = fadedColor(look().axis[normalAxis], fade, id);
  const plane = look().plane;
  let faceOpacity = plane.idle;
  if (GUIUtility.hotControl === id) {
    color = SelectedColor;
    faceOpacity = 0.8;
  } else if (hovering(id)) faceOpacity = plane.hover;
  if (!dragging()) for (const a of [axis1, axis2]) planarOctant[a] = cameraOrientation && view.get(a) > 0.01 ? -1 : 1;
  const half = handleSize * 0.5;
  const offset = rotation.mulV(
    new Vector3(planarOctant[0], planarOctant[1], planarOctant[2]).with(normalAxis, 0).mul(half),
  );
  const a1 = rotation.mulV(Axes[axis1]);
  const a2 = rotation.mulV(Axes[axis2]);
  const c = position.add(offset);
  const verts = [
    c.add(a1.add(a2).mul(half)),
    c.add(a2.sub(a1).mul(half)),
    c.sub(a1.add(a2).mul(half)),
    c.add(a1.sub(a2).mul(half)),
  ];
  const saved = Handles.color;
  Handles.color = color;
  // DrawSolidRectangleWithOutline multiplies the face by Handles.color once more.
  Handles.drawSolidRectangleWithOutline(
    verts,
    plane.squared
      ? new Color(color.r * color.r, color.g * color.g, color.b * color.b, color.a * color.a * faceOpacity)
      : color.withAlpha(color.a * faceOpacity),
    Color.clear,
  );
  const snap = EditorSnapSettings.incrementalSnapActive
    ? new Vector2(EditorSnapSettings.move.get(axis1), EditorSnapSettings.move.get(axis2))
    : Vector2.zero;
  const cap: CapFunction = (cid, p, r, s, type) => {
    const before = Handles.color;
    if (type === EventType.Repaint) setupColor(cid);
    rectangleCap(look().planeOutline)(cid, p.add(offset), r, s, type);
    Handles.color = before;
  };
  position = Handles.slider2D(id, position, rotation.mulV(Axes[normalAxis]), a1, a2, half, cap, snap);
  Handles.color = saved;
  return position;
}

// ---- RotationHandle ----

const disc = {
  startMouse: Vector2.zero,
  currentMouse: Vector2.zero,
  startPosition: Vector3.zero,
  startAxis: Vector3.up,
  startRotation: Quaternion.identity,
  dist: 0,
};

/** Mirrors Unity's Handles.DoRotationHandle; ids are x, y, z, the view ring and the free trackball. */
function rotationHandle(ids: number[], rotation: Quaternion, position: Vector3, param: RotationParam) {
  const saved = Handles.color;
  const ev = Event.current;
  const camForward = camera().forward;
  const size = HandleUtility.getHandleSize(position);
  const hot = GUIUtility.hotControl;
  const isHot = ids.includes(hot);
  // First, so it has the lowest priority.
  if (param.handles & R.XYZ && (ids[4] === hot || !isHot)) {
    Handles.color = FreeRotateColor;
    rotation = freeRotate(ids[4], rotation, position, size * param.xyzSize, param.circle);
  }
  for (let i = 0; i < 3; i++) {
    if (!(param.handles & (1 << i))) continue;
    Handles.color = look().axis[i];
    const axis = rotation.mulV(Axes[i]);
    const radius = size * param.axisSize;
    rotation = discHandle(ids[i], rotation, position, axis, radius, true, EditorSnapSettings.rotate, param.thickness);
  }
  if (isHot && ev.type === EventType.Repaint) {
    Handles.color = DisabledColor;
    wireArc(position, camForward, discTangent(camForward), 360, size * param.axisSize, param.thickness);
  }
  if (param.handles & R.Camera && (ids[3] === hot || !isHot)) {
    Handles.color = param.cameraColor;
    const radius = size * param.cameraAxisSize;
    rotation = discHandle(ids[3], rotation, position, camForward, radius, false, 0, look().cameraRingThickness);
  }
  Handles.color = saved;
  return rotation;
}

/** Mirrors Unity's Disc: the front half of a ring, the whole of it and a pie of the turn while dragged. */
function discHandle(
  id: number,
  rotation: Quaternion,
  position: Vector3,
  axis: Vector3,
  size: number,
  cutoffPlane: boolean,
  snap: number,
  lineThickness: number,
) {
  const ev = Event.current;
  const camForward = camera().forward;
  if (Math.abs(Vector3.dot(camForward, axis)) > 0.999) cutoffPlane = false;
  const front = () => Vector3.cross(axis, camForward).normalized;
  switch (ev.type) {
    case EventType.Layout:
    case EventType.MouseMove: {
      const d = cutoffPlane
        ? distanceToArc(position, axis, front(), 180, size)
        : distanceToArc(position, axis, discTangent(axis), 360, size);
      HandleUtility.addControl(id, d * GrabZoneScale);
      break;
    }
    case EventType.MouseDown:
      if (HandleUtility.nearestControl === id && ev.button === 0 && !ev.alt) {
        GUIUtility.hotControl = id;
        disc.startPosition = cutoffPlane
          ? closestPointToArc(position, axis, front(), 180, size)
          : closestPointToArc(position, axis, discTangent(axis), 360, size);
        disc.dist = 0;
        disc.startRotation = rotation;
        disc.startAxis = axis;
        disc.startMouse = disc.currentMouse = ev.mousePosition;
        ev.use();
      }
      break;
    case EventType.MouseDrag:
      if (GUIUtility.hotControl !== id) break;
      {
        const direction = Vector3.cross(axis, position.sub(disc.startPosition)).normalized;
        disc.currentMouse = disc.currentMouse.add(ev.delta);
        const along = HandleUtility.calcLineTranslation(
          disc.startMouse,
          disc.currentMouse,
          disc.startPosition,
          direction,
        );
        disc.dist = discDegrees(along, size);
        if (angleSnap()) disc.dist = snapTo(disc.dist, snap);
        rotation = Quaternion.angleAxis(-disc.dist, disc.startAxis).mul(disc.startRotation);
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
    case EventType.Repaint: {
      const saved = Handles.color;
      const thickness = setupColor(id, lineThickness);
      if (GUIUtility.hotControl === id) drawPie(position, axis, size, snap);
      if (GUIUtility.hotControl === id || !cutoffPlane)
        wireArc(position, axis, discTangent(axis), 360, size, thickness);
      else wireArc(position, axis, front(), 180, size, thickness);
      Handles.color = saved;
      break;
    }
  }
  return rotation;
}

/** The turn so far as a pie from the grabbed point, with the snap ticks when angle snapping is on. */
function drawPie(position: Vector3, axis: Vector3, size: number, snap: number) {
  const saved = Handles.color;
  const from = disc.startPosition.sub(position).normalized;
  const d = -Mathf.Sign(disc.dist) * Mathf.Repeat(Math.abs(disc.dist), 360);
  const to = Quaternion.angleAxis(d, axis).mulV(from);
  Handles.color = SelectedColor;
  lines([position, position.add(from.mul(size))], 0);
  lines([position, position.add(to.mul(size))], 0);
  Handles.color = SelectedColor.withAlpha(SelectedColor.a * 0.2);
  for (let i = 0, turns = Math.floor(Math.abs(disc.dist / 360)); i < turns; i++)
    Handles.drawSolidDisc(position, axis, size);
  Handles.drawSolidArc(position, axis, from, d, size);
  if (angleSnap() && snap > 0) {
    snapMarkers(position, axis, size, 0.1, snap, from);
    snapMarkers(position, axis, size, 0.2, 45, from);
  }
  Handles.color = saved;
}

/** Disc.DrawRotationUnitSnapMarkers: ticks on the rim, fading out when there are more than 72. */
function snapMarkers(position: Vector3, axis: Vector3, size: number, length: number, snap: number, from: Vector3) {
  const iterations = Math.floor(360 / snap);
  const limited = Math.min(iterations, 72);
  const count = Mathf.RoundToInt(limited * 0.5);
  for (let i = -count; i < count; i++) {
    const u = Quaternion.angleAxis(i * snap, axis).mulV(from);
    const alpha = iterations > 72 ? 1 - Mathf.SmoothStep(0, 1, Math.abs(i / (limited - 1) - 0.5) * 2) : SelectedColor.a;
    Handles.color = SelectedColor.withAlpha(alpha);
    lines([position.add(u.mul((1 - length) * size)), position.add(u.mul(size))], 0);
  }
}

/** Mirrors Unity's FreeRotate: a degree per point of drag, about the axis across the drag. */
function freeRotate(id: number, rotation: Quaternion, position: Vector3, size: number, drawCircle: boolean) {
  const ev = Event.current;
  const c = camera();
  switch (ev.type) {
    case EventType.Layout:
    case EventType.MouseMove:
      HandleUtility.addControl(id, HandleUtility.distanceToCircle(position, size) + HandleUtility.kPickDistance);
      break;
    case EventType.MouseDown:
      if (HandleUtility.nearestControl === id && ev.button === 0 && !ev.alt) {
        GUIUtility.hotControl = id;
        ev.use();
      }
      break;
    case EventType.MouseDrag:
      if (GUIUtility.hotControl !== id) break;
      if (ev.delta.magnitude > 0) {
        const dir = c.rotation.mulV(new Vector3(-ev.delta.y, -ev.delta.x, 0)).normalized;
        rotation = Quaternion.angleAxis(ev.delta.magnitude, dir).mul(rotation);
      }
      GUI.changed = true;
      ev.use();
      break;
    case EventType.MouseUp:
      if (GUIUtility.hotControl === id && (ev.button === 0 || ev.button === 2)) {
        GUIUtility.hotControl = 0;
        ev.use();
      }
      break;
    case EventType.Repaint: {
      const saved = Handles.color;
      const lit = hovering(id) || GUIUtility.hotControl === id;
      const trackball = look().trackball;
      // Unity+ fills the trackball where Unity draws a dark circle and dims the disc under the cursor.
      if (trackball) {
        Handles.color = lit ? trackball.hover : trackball.idle;
        if (drawCircle || lit) Handles.drawSolidDisc(position, c.forward, size);
      } else {
        if (drawCircle) wireArc(position, c.forward, discTangent(c.forward), 360, size, setupColor(id));
        if (lit) {
          Handles.color = DimmingColor;
          Handles.drawSolidDisc(position, c.forward, size);
        }
      }
      Handles.color = saved;
      break;
    }
  }
  return rotation;
}

// ---- ScaleHandle ----

const scaling = {
  startMouse: Vector2.zero,
  currentMouse: Vector2.zero,
  startScale: 1,
  // While an axis is dragged its line follows the scale; while the cube is, every line does.
  handleLength: 1,
  drawLength: 1,
  centerDir: Vector3.one,
  initial: Vector3.one,
  multiplier: 1,
};

/** Mirrors Unity's Handles.DoScaleHandle; ids are x, y, z and the uniform cube. */
function scaleHandle(
  ids: number[],
  scale: Vector3,
  position: Vector3,
  rotation: Quaternion,
  handleSize: number,
  param: ScaleParam,
) {
  const saved = Handles.color;
  const ev = Event.current;
  const hot = GUIUtility.hotControl;
  const view = viewVector(position, rotation);
  const isHot = ids.includes(hot);
  let axisOffset = param.axisOffset;
  let lineScale = param.lineScale;
  // A dragged axis is drawn from the centre.
  if (isHot) {
    lineScale += axisOffset;
    axisOffset = 0;
  }
  if (ev.type === EventType.MouseDown) {
    scaling.initial = scale.equals(Vector3.zero) ? Vector3.one : scale;
    scaling.multiplier = 1;
  }
  for (const i of calcDrawOrder(view)) {
    if (!(param.handles & (1 << i))) continue;
    const id = ids[i];
    const f = isHot || id === hot ? 0 : cameraViewLerp(view, Axes[i]);
    if (f > CameraViewThreshold) continue;
    let color = fadedColor(look().axis[i], f, id);
    if (isHot && id !== hot) color = DisabledColor;
    if (ids[3] === hot) color = SelectedColor;
    Handles.color = color;
    const value = scaleAxis(
      id,
      scale.get(i),
      position,
      rotation.mulV(Axes[i]),
      rotation,
      handleSize,
      EditorSnapSettings.scale,
      axisOffset,
      lineScale,
      param,
    );
    scale = scale.with(i, value);
  }
  if (param.handles & S.XYZ && (ids[3] === hot || !isHot)) {
    Handles.color = param.centerColor;
    EditorGUI.beginChangeCheck();
    scaling.multiplier = scaleCenter(
      ids[3],
      scaling.multiplier,
      position,
      rotation,
      handleSize,
      EditorSnapSettings.scale,
    );
    if (EditorGUI.endChangeCheck()) scale = scaling.initial.mul(scaling.multiplier);
  }
  Handles.color = saved;
  return scale;
}

/** Mirrors Unity's SliderScale.DoAxis: a line with a cube, the drag's length along it the factor. */
function scaleAxis(
  id: number,
  scale: number,
  position: Vector3,
  direction: Vector3,
  rotation: Quaternion,
  size: number,
  snap: number,
  handleOffset: number,
  lineScale: number,
  param: ScaleParam,
) {
  const ev = Event.current;
  if (GUIUtility.hotControl === id) scaling.handleLength = (size * scale) / scaling.startScale;
  const offset = direction.mul(size * handleOffset);
  const s = GUIUtility.hotControl === id ? scaling.handleLength : size;
  const start = position.add(offset);
  const cube = position.add(direction.mul(s * scaling.drawLength * lineScale)).add(offset);
  switch (ev.type) {
    case EventType.Layout:
    case EventType.MouseMove:
      HandleUtility.addControl(id, HandleUtility.distanceToLine(start, cube));
      HandleUtility.addControl(id, HandleUtility.distanceToCube(cube, rotation, size * param.cube));
      break;
    case EventType.MouseDown:
      if (HandleUtility.nearestControl === id && ev.button === 0 && !ev.alt) {
        GUIUtility.hotControl = id;
        scaling.startMouse = scaling.currentMouse = ev.mousePosition;
        scaling.startScale = scale;
        ev.use();
      }
      break;
    case EventType.MouseDrag:
      if (GUIUtility.hotControl !== id) break;
      {
        scaling.currentMouse = scaling.currentMouse.add(ev.delta);
        const along = HandleUtility.calcLineTranslation(scaling.startMouse, scaling.currentMouse, position, direction);
        let dist = 1 + along / size;
        if (scaleSnap()) dist = snapTo(dist, snap);
        scale = scaling.startScale * dist;
        GUI.changed = true;
        ev.use();
      }
      break;
    case EventType.MouseUp:
      if (GUIUtility.hotControl === id) {
        GUIUtility.hotControl = 0;
        ev.use();
      }
      break;
    case EventType.Repaint: {
      const saved = Handles.color;
      const thickness = setupColor(id, param.thickness);
      const capSize = size * param.cube * (hovering(id) ? HoverExtraScale : 1);
      const lineEnd = position.add(direction.mul(s * scaling.drawLength * lineScale - capSize * 0.5)).add(offset);
      if (Vector3.dot(camera().forward, direction) < 0) {
        lines([start, lineEnd], thickness);
        Handles.cubeHandleCap(id, cube, rotation, capSize, EventType.Repaint);
      } else {
        Handles.cubeHandleCap(id, cube, rotation, capSize, EventType.Repaint);
        lines([start, lineEnd], thickness);
      }
      Handles.color = saved;
      break;
    }
  }
  return scale;
}

/** Mirrors Unity's SliderScale.DoCenter: up and right grow, down and left shrink. */
function scaleCenter(id: number, value: number, position: Vector3, rotation: Quaternion, size: number, snap: number) {
  const ev = Event.current;
  switch (ev.type) {
    case EventType.Layout:
    case EventType.MouseMove:
      HandleUtility.addControl(id, HandleUtility.distanceToCube(position, rotation, size * 0.15));
      break;
    case EventType.MouseDown:
      if (HandleUtility.nearestControl === id && ev.button === 0 && !ev.alt) {
        GUIUtility.hotControl = id;
        scaling.startScale = value;
        scaling.startMouse = scaling.currentMouse = ev.mousePosition;
        scaling.centerDir = camera().right.add(camera().up).normalized;
        ev.use();
      }
      break;
    case EventType.MouseDrag:
      if (GUIUtility.hotControl !== id) break;
      {
        scaling.currentMouse = scaling.currentMouse.add(ev.delta);
        const along = HandleUtility.calcLineTranslation(
          scaling.startMouse,
          scaling.currentMouse,
          position,
          scaling.centerDir,
        );
        const dist = along / size;
        value = ((scaleSnap() ? snapTo(dist, snap) : dist) + 1) * scaling.startScale;
        scaling.drawLength = value;
        GUI.changed = true;
        ev.use();
      }
      break;
    case EventType.MouseUp:
      if (GUIUtility.hotControl === id) {
        GUIUtility.hotControl = 0;
        scaling.drawLength = 1;
        ev.use();
      }
      break;
    case EventType.Repaint: {
      const saved = Handles.color;
      setupColor(id);
      const capSize = size * 0.15 * (hovering(id) ? HoverExtraScale : 1);
      Handles.cubeHandleCap(id, position, rotation, capSize, EventType.Repaint);
      Handles.color = saved;
      break;
    }
  }
  return value;
}

// ---- TransformHandle ----

let hotCameraAligned = false;
let cameraAlignedStart: Quaternion | null = null;

/** Mirrors Unity's Handles.TransformHandle: only the group in hand is drawn while dragging. */
function transformHandle(
  ids: { p: number[]; r: number[]; s: number[] },
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
) {
  const hot = GUIUtility.hotControl;
  const has = (list: number[]) => list.includes(hot);
  const isHot = has(ids.p) || has(ids.r) || has(ids.s);
  const cameraAligned = (isHot && hotCameraAligned) || (!isHot && Event.current.shift);
  let working = rotation;
  const params = look().transform;
  let param = params.global;
  if (Tools.vertexDragging) param = params.vertex;
  else if (cameraAligned) {
    working = camera().rotation;
    param = params.camera;
  } else if (Tools.pivotRotation === PivotRotation.Local) param = params.local;

  if (isHot) {
    if (has(ids.p)) position = positionHandleInternal(ids.p, position, working, param.p);
    else if (has(ids.r)) {
      const end = rotationHandle(ids.r, working, position, param.r);
      if (cameraAligned) {
        // The camera's axes only lend the rings: the turn lands on the handle's own rotation.
        cameraAlignedStart ??= rotation;
        const initial = ids.r[4] !== hot ? cameraAlignedStart : rotation;
        const [angle, axis] = end.mul(Quaternion.inverse(working)).toAngleAxis();
        rotation = Quaternion.angleAxis(angle, axis).mul(initial);
      } else rotation = end;
    } else scale = scaleHandle(ids.s, scale, position, working, HandleUtility.getHandleSize(position), param.s);
  } else {
    cameraAlignedStart = null;
    rotationHandle(ids.r, working, position, param.r);
    // Position over rotation, scale last so the centre cube wins.
    positionHandleInternal(ids.p, position, working, param.p);
    scaleHandle(ids.s, scale, position, working, HandleUtility.getHandleSize(position), param.s);
  }
  const nowHot = [...ids.p, ...ids.r, ...ids.s].includes(GUIUtility.hotControl);
  if (nowHot && !isHot && cameraAligned) hotCameraAligned = true;
  else if (hotCameraAligned && (!isHot || !nowHot)) hotCameraAligned = false;
  return { position, rotation, scale };
}

function worldVertices(go: GameObject) {
  const m = go.mesh;
  if (!m || !go.visible) return [];
  const t = go.transform;
  return m.vertices.map((v) => t.transformPoint(v));
}

/** HandleUtility.FindNearestVertex: nearest on screen among the objects' vertices in front of the camera. */
export function nearestVertex(objects: Iterable<GameObject>, mouse: Vector2) {
  let best: Vector3 | null = null;
  let bestD = Infinity;
  for (const go of objects)
    for (const p of worldVertices(go)) {
      const g = HandleUtility.worldToGUIPointWithDepth(p);
      if (g.z <= 0) continue;
      const d = (g.x - mouse.x) ** 2 + (g.y - mouse.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  return best;
}

/** What a vertex drag lands on: the nearest vertex of anything but the selection. */
function nearestTargetVertex(mouse: Vector2) {
  const own = new Set(Selection.getTransforms(SelectionMode.Deep).map((t) => t.gameObject));
  const others = [...(Scene.current?.allObjects() ?? [])].filter((o) => o.pickable && !own.has(o));
  return nearestVertex(others, mouse);
}

export const BuiltinHandles = {
  /** Handles.PositionHandle; ids are x, y, z, xy, yz, xz and the centre square. */
  position: positionHandle,
  /** Handles.RotationHandle; ids are x, y, z, the view ring and the trackball. */
  rotation: (ids: number[], rotation: Quaternion, position: Vector3) =>
    rotationHandle(ids, rotation, position, look().rotation),
  /** Handles.ScaleHandle; ids are x, y, z and the uniform cube. */
  scale: (ids: number[], scale: Vector3, position: Vector3, rotation: Quaternion, size: number) =>
    scaleHandle(ids, scale, position, rotation, size, look().scale),
  transform: transformHandle,
  /** A scale drag let go of: every axis line back to its own length. */
  endDrag() {
    scaling.drawLength = 1;
  },
};
