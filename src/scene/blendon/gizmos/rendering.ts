// GizmoRenderer, PlaneOffsetView and DrawPrimitives: the drawing layer every gizmo shares.
import { EditorGUIUtility, HandleUtility, Handles } from '../../unity/handles.ts';
import { Event, EventType, GUIUtility, MouseButton } from '../../unity/imgui.ts';
import { Color, Mathf, Quaternion, Vector3 } from '../../unity/math.ts';
import { Camera, SceneView, type SceneCamera } from '../../unity/sceneview.ts';
import { withAlpha, withOpacity } from '../color.ts';
import { ViewNavigationState } from '../navigation/state.ts';
import { GizmoColors } from './colors.ts';
import { SharedGizmoSettings } from './shared-settings.ts';

export const GizmoRenderer = {
  /** 1 broadside, 0 within thresholdDegrees of edge-on. */
  axisFade(axisDirection: Vector3, viewDir: Vector3, thresholdDegrees: number) {
    if (thresholdDegrees <= 0) return 1;
    let angle = Vector3.angle(viewDir, axisDirection);
    angle = Math.min(angle, 180 - angle);
    return Mathf.Clamp01(angle / thresholdDegrees);
  },

  /** 1 along its normal, 0 within thresholdDegrees of edge-on. */
  planeFade(normal: Vector3, viewDir: Vector3, thresholdDegrees: number) {
    if (thresholdDegrees <= 0) return 1;
    let angle = Vector3.angle(viewDir, normal);
    angle = Math.min(angle, 180 - angle);
    return Mathf.Clamp01((90 - angle) / thresholdDegrees);
  },

  computeViewDir(position: Vector3, camera: SceneCamera | null) {
    return !camera
      ? Vector3.forward
      : camera.orthographic
        ? camera.forward
        : position.sub(camera.position).normalized;
  },

  currentCamera(): SceneCamera | null {
    return SceneView.currentDrawingSceneView?.camera ?? Camera.current;
  },

  cameraNormal() {
    return Camera.current?.forward ?? Vector3.forward;
  },

  /** Farthest first, so the nearest draws last and wins layering and hit ties. */
  sortByDepth(p0: Vector3, p1: Vector3, p2: Vector3, camera: SceneCamera | null, order: number[]) {
    const depth = [0, 0, 0];
    if (camera) {
      depth[0] = Vector3.dot(p0.sub(camera.position), camera.forward);
      depth[1] = Vector3.dot(p1.sub(camera.position), camera.forward);
      depth[2] = Vector3.dot(p2.sub(camera.position), camera.forward);
    }
    order[0] = 0;
    order[1] = 1;
    order[2] = 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2 - i; j++)
        if (depth[order[j]] < depth[order[j + 1]]) [order[j], order[j + 1]] = [order[j + 1], order[j]];
  },

  sortAxesByDepth(position: Vector3, size: number, camera: SceneCamera | null, axisDirs: Vector3[], order: number[]) {
    GizmoRenderer.sortByDepth(
      position.add(axisDirs[0].mul(size)),
      position.add(axisDirs[1].mul(size)),
      position.add(axisDirs[2].mul(size)),
      camera,
      order,
    );
  },

  sortPlanesByDepth(
    position: Vector3,
    planeOffset: number,
    planeSize: number,
    size: number,
    camera: SceneCamera | null,
    dir1s: Vector3[],
    dir2s: Vector3[],
    viewDir: Vector3,
    order: number[],
  ) {
    const c = (i: number) =>
      GizmoRenderer.clampPlaneOffset(position, dir1s[i], dir2s[i], viewDir, size, planeOffset, planeSize);
    GizmoRenderer.sortByDepth(c(0), c(1), c(2), camera, order);
  },

  clampPlaneOffset(
    position: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    viewDir: Vector3,
    size: number,
    planeOffset: number,
    planeSize: number,
  ) {
    return position
      .add(dir1.mul(clampAxisOffset(dir1, viewDir, planeOffset, planeSize) * size))
      .add(dir2.mul(clampAxisOffset(dir2, viewDir, planeOffset, planeSize) * size));
  },

  /** Slider handles refuse hotControl while Alt is held; this lets a handle win the press anyway. */
  beginAltGrabOverride(id: number) {
    const evt = Event.current;
    const suppress =
      evt.type === EventType.MouseDown &&
      evt.alt &&
      evt.button === MouseButton.LeftMouse &&
      GUIUtility.hotControl === 0 &&
      HandleUtility.nearestControl === id;
    if (suppress) evt.alt = false;
    return suppress;
  },

  endAltGrabOverride(wasSuppressed: boolean) {
    if (wasSuppressed) Event.current.alt = true;
  },
};

// viewDir points camera->gizmo, so the camera is on dir's positive side when their dot is negative.
function clampAxisOffset(dir: Vector3, viewDir: Vector3, planeOffset: number, planeSize: number) {
  const sign = Vector3.dot(dir, viewDir) <= 0 ? 1 : -1;
  return Math.max(planeOffset, sign * planeSize);
}

/** The camera pose plane handles clamp against, held for the whole navigation gesture. */
export const PlaneOffsetView = {
  latched: null as { position: Vector3; forward: Vector3; orthographic: boolean } | null,

  viewDir(position: Vector3, camera: SceneCamera | null) {
    if (!camera) return Vector3.forward;
    if (!ViewNavigationState.inProgress || !PlaneOffsetView.latched)
      PlaneOffsetView.latched = { position: camera.position, forward: camera.forward, orthographic: camera.orthographic };
    const p = PlaneOffsetView.latched;
    return p.orthographic ? p.forward : position.sub(p.position).normalized;
  },
};

// ---- DrawPrimitives ------------------------------------------------------------------------------------

const MinCenterDotRadiusFactor = 0.03;

function halfWidthWorldWith(worldPoint: Vector3, pixelThickness: number, cameraRight: Vector3) {
  const a = HandleUtility.worldToGUIPoint(worldPoint);
  const b = HandleUtility.worldToGUIPoint(worldPoint.add(cameraRight));
  const ppw = b.sub(a).magnitude;
  return ppw < 1e-5 ? pixelThickness * 0.5 * 0.01 : (pixelThickness * 0.5) / ppw;
}

function planeAxes(normal: Vector3): [Vector3, Vector3] {
  let a = Vector3.cross(normal, Vector3.up).normalized;
  if (a.sqrMagnitude < 0.001) a = Vector3.cross(normal, Vector3.right).normalized;
  return [a, Vector3.cross(normal, a)];
}

function circlePoints(segments: number, center: Vector3, normal: Vector3, radius: number) {
  const [a, b] = planeAxes(normal);
  const pts: Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push(center.add(a.mul(Math.cos(t)).add(b.mul(Math.sin(t))).mul(radius)));
  }
  return pts;
}

/** One measurement of the camera, answering per point how much world a GUI point covers there. */
export class ScreenScale {
  readonly forward: Vector3;
  readonly right: Vector3;
  readonly cameraPosition: Vector3;
  readonly orthographic: boolean;
  private readonly pointsPerPixel: number;
  private readonly worldPerPointUnit: number;

  private constructor(cam: SceneCamera) {
    this.forward = cam.forward;
    this.right = cam.right;
    this.cameraPosition = cam.position;
    this.orthographic = cam.orthographic;
    this.pointsPerPixel = Math.max(1, EditorGUIUtility.pixelsPerPoint);
    this.worldPerPointUnit = halfWidthWorldWith(this.cameraPosition.add(this.forward), 2, this.right);
  }

  static tryBegin(): ScreenScale | null {
    const cam = Camera.current;
    if (!cam) return null;
    const s = new ScreenScale(cam);
    return s.worldPerPointUnit > 0 ? s : null;
  }

  depth(p: Vector3) {
    return Vector3.dot(p.sub(this.cameraPosition), this.forward);
  }

  halfWidth(depth: number, pixelThickness: number) {
    const per = this.orthographic ? this.worldPerPointUnit : this.worldPerPointUnit * Math.max(depth, 1e-4);
    return pixelThickness * 0.5 * per;
  }

  worldPerDevicePixel(depth: number) {
    return this.halfWidth(depth, 2) / this.pointsPerPixel;
  }
}

export const DrawPrimitives = {
  drawTriangle(a: Vector3, b: Vector3, c: Vector3) {
    Handles.drawAAConvexPolygon(a, b, c);
  },

  drawQuad(a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
    Handles.drawAAConvexPolygon(a, b, c, d);
  },

  halfWidthWorld(worldPoint: Vector3, pixelThickness: number) {
    const cam = Camera.current;
    return cam ? halfWidthWorldWith(worldPoint, pixelThickness, cam.right) : pixelThickness * 0.5 * 0.01;
  },

  drawThickLine(a: Vector3, b: Vector3, thickness: number) {
    const right = Camera.current?.right ?? Vector3.right;
    drawSegment(
      a,
      b,
      GizmoRenderer.cameraNormal(),
      halfWidthWorldWith(a, thickness, right),
      halfWidthWorldWith(b, thickness, right),
    );
  },

  drawThickSegment(a: Vector3, b: Vector3, viewDir: Vector3, hwA: number, hwB: number) {
    drawSegment(a, b, viewDir, hwA, hwB);
  },

  drawThickPolyline(thickness: number, closed: boolean, points: Vector3[], count = points.length) {
    if (count < 2) return;
    const viewDir = GizmoRenderer.cameraNormal();
    const right = Camera.current?.right ?? Vector3.right;
    const hw: number[] = [];
    for (let i = 0; i < count; i++) hw.push(halfWidthWorldWith(points[i], thickness, right));
    const segments = closed ? count : count - 1;
    for (let i = 0; i < segments; i++) {
      const next = i + 1 === count ? 0 : i + 1;
      drawSegment(points[i], points[next], viewDir, hw[i], hw[next]);
    }
  },

  drawAASolidDisc(center: Vector3, normal: Vector3, radius: number) {
    let segments = Math.trunc(SharedGizmoSettings.qualityLerp(8, 48));
    segments = Math.trunc(Mathf.Lerp(8, segments, radius / 0.05));
    Handles.drawAAConvexPolygon(...circlePoints(segments, center, normal, radius));
  },

  drawAACircle(center: Vector3, normal: Vector3, radius: number, thickness: number) {
    const segments = Math.ceil(SharedGizmoSettings.qualityLerp(8, 144));
    DrawPrimitives.drawThickPolyline(thickness, true, circlePoints(segments, center, normal, radius));
  },

  circleSegments() {
    return Math.ceil(SharedGizmoSettings.qualityLerp(8, 144));
  },

  planeAxes,

  drawScreenSquare(center: Vector3, normal: Vector3, halfSize: number, thickness: number) {
    DrawPrimitives.drawThickPolyline(thickness, true, squarePoints(center, normal, halfSize));
  },

  drawAASolidSquare(center: Vector3, normal: Vector3, halfSize: number) {
    Handles.drawAAConvexPolygon(...squarePoints(center, normal, halfSize));
  },

  drawPlaneShape(corners: Vector3[], count: number, baseColor: Color, fade: number, lineThickness: number, active = false) {
    Handles.color = withOpacity(baseColor, active ? 0.8 : fade * 0.5);
    DrawPrimitives.drawPolygon(corners, count);
    Handles.color = active ? withAlpha(baseColor, 1) : withOpacity(baseColor, fade);
    DrawPrimitives.drawThickPolygon(lineThickness, corners, count);
  },

  drawPolygon(corners: Vector3[], count: number) {
    Handles.drawAAConvexPolygon(...corners.slice(0, count));
  },

  drawThickPolygon(thickness: number, corners: Vector3[], count: number) {
    DrawPrimitives.drawThickPolyline(thickness, true, corners.slice(0, count));
  },

  centerDotRadiusFactor(scale = 1) {
    return Math.max(scale * SharedGizmoSettings.CenterDotRadius, MinCenterDotRadiusFactor);
  },

  /** The outlined pivot dot in the current Handles.color. */
  drawCenterDot(position: Vector3, scale = 1) {
    const normal = GizmoRenderer.cameraNormal();
    const size = scale * HandleUtility.getHandleSize(position) * SharedGizmoSettings.CenterDotRadius;
    const color = Handles.color;
    Handles.color = withAlpha(GizmoColors.Outline, color.a);
    DrawPrimitives.drawAASolidDisc(position, normal, size * SharedGizmoSettings.CenterDotOutlineThickness);
    Handles.color = color;
    DrawPrimitives.drawAASolidDisc(position, normal, size);
  },

  drawCenterSquare(position: Vector3, scale = 1) {
    const normal = GizmoRenderer.cameraNormal();
    const size = scale * HandleUtility.getHandleSize(position) * SharedGizmoSettings.CenterDotRadius;
    const color = Handles.color;
    Handles.color = withAlpha(GizmoColors.Outline, color.a);
    DrawPrimitives.drawAASolidSquare(position, normal, size * SharedGizmoSettings.CenterDotOutlineThickness);
    Handles.color = color;
    DrawPrimitives.drawAASolidSquare(position, normal, size);
  },

  /** A ring blending nearColor (camera side) into farColor (far side). */
  drawGradientCircle(
    center: Vector3,
    normal: Vector3,
    radius: number,
    thickness: number,
    viewDir: Vector3,
    nearColor: Color,
    farColor: Color,
  ) {
    const segments = DrawPrimitives.circleSegments();
    const [a, b] = planeAxes(normal);
    const right = Camera.current?.right ?? Vector3.right;
    const dirs: Vector3[] = [],
      pts: Vector3[] = [],
      hw: number[] = [];
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const d = a.mul(Math.cos(t)).add(b.mul(Math.sin(t)));
      dirs.push(d);
      pts.push(center.add(d.mul(radius)));
      hw.push(halfWidthWorldWith(pts[i], thickness, right));
    }
    const camDir = viewDir.sqrMagnitude > 1e-8 ? viewDir.normalized : GizmoRenderer.cameraNormal();
    const camNorm = GizmoRenderer.cameraNormal();
    const inPlane = camDir.sub(normal.mul(Vector3.dot(camDir, normal))).magnitude;
    const facingScale = inPlane > 1e-4 ? 1 / inPlane : 0;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const f0 = Mathf.Clamp01((-Vector3.dot(dirs[i], camDir) * facingScale + 1) * 0.5);
      const f1 = Mathf.Clamp01((-Vector3.dot(dirs[next], camDir) * facingScale + 1) * 0.5);
      Handles.color = Color.lerp(farColor, nearColor, (f0 + f1) * 0.5);
      drawSegment(pts[i], pts[next], camNorm, hw[i], hw[next]);
    }
  },
};

function squarePoints(center: Vector3, normal: Vector3, halfSize: number) {
  const rot = Quaternion.lookRotation(normal);
  const right = rot.mulV(Vector3.right).mul(halfSize);
  const up = rot.mulV(Vector3.up).mul(halfSize);
  return [center.sub(right).sub(up), center.add(right).sub(up), center.add(right).add(up), center.sub(right).add(up)];
}

// A camera-facing quad, ends pushed out a hair so consecutive segments overlap at the joint.
function drawSegment(p0: Vector3, p1: Vector3, viewDir: Vector3, hw0: number, hw1: number) {
  let dir = p1.sub(p0);
  if (dir.sqrMagnitude < 1e-12) return;
  dir = dir.normalized;
  let perp = Vector3.cross(dir, viewDir);
  if (perp.sqrMagnitude < 1e-10) return;
  perp = perp.normalized;
  p0 = p0.sub(dir.mul(0.0003));
  p1 = p1.add(dir.mul(0.0003));
  Handles.drawAAConvexPolygon(p0.sub(perp.mul(hw0)), p1.sub(perp.mul(hw1)), p1.add(perp.mul(hw1)), p0.add(perp.mul(hw0)));
}
