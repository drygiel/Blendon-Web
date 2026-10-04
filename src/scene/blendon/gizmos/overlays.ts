// DrawOverlays, DrawGhosts and AxisLabelDrawer: drag feedback drawn around a gizmo.
// The canvas has no depth buffer, so the plugin's occluded (zTest Greater) passes are left out.
import { GUI, HandleUtility, Handles } from '../../unity/handles.ts';
import { Event, EventType } from '../../unity/imgui.ts';
import { Color, Mathf, Plane, Rect, Vector2, Vector3 } from '../../unity/math.ts';
import { Camera, SceneView, type SceneCamera } from '../../unity/sceneview.ts';
import { withFade } from '../color.ts';
import { GizmoAxis } from './axis.ts';
import { GizmoColors } from './colors.ts';
import { PlaneGeometry } from './handles/plane-geometry.ts';
import type { MoveSnap } from './core/move-snap.ts';
import type { PlaneHandleShape } from './common/gizmo-settings.ts';
import { DrawPrimitives, GizmoRenderer } from './rendering.ts';
import { SharedGizmoSettings } from './shared-settings.ts';

const CursorLineThickness = 0.6;
const DashPixels = 5;
const GapPixels = 4;
const LookAtDiscRadius = 0.28;
const LookAtContactScale = 0.5;

const isRepaint = () => Event.current.type === EventType.Repaint;

function viewDepth(point: Vector3) {
  const cam = Camera.current;
  if (!cam || cam.orthographic) return 1;
  return Vector3.dot(point.sub(cam.position), cam.forward);
}

// Maps a fraction of the line's screen length to the matching world point.
function perspectivePoint(a: Vector3, b: Vector3, depthA: number, depthB: number, s: number) {
  const denominator = depthB + s * (depthA - depthB);
  if (depthA <= 0 || depthB <= 0 || Math.abs(denominator) < 1e-5) return Vector3.lerp(a, b, s);
  return Vector3.lerpUnclamped(a, b, (s * depthA) / denominator);
}

const surfaceDiscRadius = (pivot: Vector3) => HandleUtility.getHandleSize(pivot) * LookAtDiscRadius;

function nudgeTowardCamera(point: Vector3) {
  const cam = Camera.current;
  if (!cam) return point;
  const toCam = cam.orthographic ? cam.forward.neg() : cam.position.sub(point).normalized;
  return point.add(toCam.mul(HandleUtility.getHandleSize(point) * 0.01));
}

function drawSurfaceDisc(point: Vector3, normal: Vector3, radius: number, thickness: number) {
  const discNormal = normal.sqrMagnitude > 1e-6 ? normal.normalized : GizmoRenderer.cameraNormal();
  point = nudgeTowardCamera(point);
  Handles.color = GizmoColors.LookAtSurface;
  DrawPrimitives.drawAASolidDisc(point, discNormal, radius);
  Handles.color = GizmoColors.LookAtLine;
  DrawPrimitives.drawAACircle(point, discNormal, radius, thickness * 0.6);
}

function viewportBounds() {
  const margin = 32;
  const view = SceneView.currentDrawingSceneView;
  if (!view) return Rect.zero;
  const vp = view.cameraViewport;
  return new Rect(-margin, -margin, vp.width + margin * 2, vp.height + margin * 2);
}

function isOnScreen(worldPoint: Vector3, viewport: Rect) {
  if (viewport.width <= 0) return true;
  const cam = Camera.current;
  if (cam && !cam.orthographic && Vector3.dot(worldPoint.sub(cam.position), cam.forward) <= 0) return false;
  return viewport.contains(HandleUtility.worldToGUIPoint(worldPoint));
}

// Tick k sits at origin + dir * (phase + k * tickSpacing).
function drawTicks(
  origin: Vector3,
  dir: Vector3,
  perp: Vector3,
  signedDistance: number,
  phase: number,
  spacing: number,
) {
  if (spacing <= 0 || perp.sqrMagnitude < 1e-8) return;
  perp = perp.normalized;
  const s = SharedGizmoSettings;
  const precision = s.PrecisionHeld;
  const windowRadius = 50;
  const centerIndex = Mathf.RoundToInt((signedDistance - phase) / spacing);
  const thickness = s.ScreenRingThickness;
  const viewport = viewportBounds();
  for (let k = centerIndex - windowRadius; k <= centerIndex + windowRadius; k++) {
    const isMajor = !precision || k % 2 === 0;
    const center = origin.add(dir.mul(phase + k * spacing));
    if (!isOnScreen(center, viewport)) continue;
    const tickScale = HandleUtility.getHandleSize(center) * s.Size;
    const gap = 0.3 * tickScale * s.SnapTickGap;
    const len = 0.3 * tickScale * s.SnapTickLength * (isMajor ? 1 : 0.6);
    const color = isMajor ? GizmoColors.SnapTickMajor : GizmoColors.SnapTickMinor;
    Handles.color = withFade(color, 1 - Math.abs(k - centerIndex) / windowRadius);
    DrawPrimitives.drawThickLine(
      center.sub(perp.mul(gap)),
      center.sub(perp.mul(gap + len)),
      thickness * (isMajor ? 0.8 : 0.6),
    );
  }
}

export const DrawOverlays = {
  drawCursorLineToGui(center: Vector3, camera: SceneCamera | null, guiPoint: Vector2) {
    if (!camera || !isRepaint()) return;
    const plane = new Plane(camera.forward, center);
    const ray = HandleUtility.guiPointToWorldRay(guiPoint);
    const [hit, dist] = plane.raycast(ray);
    if (!hit) return;
    DrawOverlays.drawCursorLine(center, ray.getPoint(dist));
  },

  drawCursorLine(center: Vector3, worldPoint: Vector3) {
    if (!isRepaint()) return;
    DrawOverlays.drawDashedLine(center, worldPoint, CursorLineThickness, GizmoColors.CursorLine);
  },

  /** Anchored at a with a fixed pixel period, so a growing line only extends its trailing dash. */
  drawDashedLine(a: Vector3, b: Vector3, thickness: number, color: Color) {
    const pixelLength = HandleUtility.worldToGUIPoint(b).sub(HandleUtility.worldToGUIPoint(a)).magnitude;
    if (pixelLength < 1e-3) return;
    const depthA = viewDepth(a);
    const depthB = viewDepth(b);
    Handles.color = color;
    for (let start = 0; start < pixelLength; start += DashPixels + GapPixels) {
      const end = Math.min(start + DashPixels, pixelLength);
      const p0 = perspectivePoint(a, b, depthA, depthB, start / pixelLength);
      const p1 = perspectivePoint(a, b, depthA, depthB, end / pixelLength);
      DrawPrimitives.drawThickLine(p0, p1, thickness);
    }
  },

  drawLookAtLine(
    from: Vector3,
    to: Vector3,
    normal: Vector3,
    contacts: { point: Vector3; normal: Vector3 }[],
    stale = false,
  ) {
    if (!isRepaint()) return;
    const thickness = SharedGizmoSettings.ScreenRingThickness * 0.8;
    const radius = surfaceDiscRadius(from);
    Handles.color = GizmoColors.LookAtLine;
    if (stale) DrawOverlays.drawDashedLine(from, to, thickness, Handles.color);
    else DrawPrimitives.drawThickLine(from, to, thickness);
    if (stale) return;
    for (const c of contacts) drawSurfaceDisc(c.point, c.normal, radius * LookAtContactScale, thickness);
    drawSurfaceDisc(to, normal, radius, thickness);
  },

  drawSurfaceMarker(point: Vector3, normal: Vector3, pivot: Vector3) {
    if (!isRepaint()) return;
    drawSurfaceDisc(point, normal, surfaceDiscRadius(pivot), SharedGizmoSettings.ScreenRingThickness * 0.8);
  },

  drawAxisAlignedConnector(from: Vector3, to: Vector3) {
    const afterX = new Vector3(to.x, from.y, from.z);
    const afterZ = new Vector3(to.x, from.y, to.z);
    DrawOverlays.drawCursorLine(from, afterX);
    DrawOverlays.drawCursorLine(afterX, afterZ);
    DrawOverlays.drawCursorLine(afterZ, to);
  },

  drawPlaneConstraintLines(origin: Vector3, planeAxis: GizmoAxis, dir1: Vector3, dir2: Vector3) {
    const [c1, c2] =
      planeAxis === GizmoAxis.Z
        ? [GizmoAxis.X.constrain, GizmoAxis.Y.constrain]
        : planeAxis === GizmoAxis.X
          ? [GizmoAxis.Y.constrain, GizmoAxis.Z.constrain]
          : [GizmoAxis.Z.constrain, GizmoAxis.X.constrain];
    DrawOverlays.drawConstraintLine(origin, dir1, c1);
    DrawOverlays.drawConstraintLine(origin, dir2, c2);
  },

  drawConstraintLine(origin: Vector3, dir: Vector3, color: Color) {
    const extent = 100;
    const InfiniteLineDistance = 1e6;
    const total = Math.ceil(SharedGizmoSettings.qualityLerp(4, 90));
    Handles.color = color;
    // t^2 spacing clusters points near the pivot where the line is most visible.
    const pts: Vector3[] = [];
    for (let i = 0; i < total; i++) {
      const t = (i / (total - 1)) * 2 - 1;
      pts.push(origin.add(dir.mul(Mathf.Sign(t) * t * t * extent)));
    }
    const thickness = SharedGizmoSettings.ConstraintLineThickness;
    DrawPrimitives.drawThickPolyline(thickness, false, pts, total);
    Handles.drawLine(pts[0], pts[0].sub(dir.mul(InfiniteLineDistance)), thickness);
    Handles.drawLine(pts[total - 1], pts[total - 1].add(dir.mul(InfiniteLineDistance)), thickness);
  },

  bestSnapTickPerpendicular(a: Vector3, b: Vector3) {
    const viewDir = GizmoRenderer.cameraNormal();
    return Math.abs(Vector3.dot(a, viewDir)) <= Math.abs(Vector3.dot(b, viewDir)) ? a : b;
  },

  drawLinearSnapTicks(origin: Vector3, dir: Vector3, perp: Vector3, signedDistance: number, snap: MoveSnap) {
    const lattice = snap.tryLattice(origin, dir);
    if (lattice) drawTicks(origin, dir, perp, signedDistance, lattice.phase, lattice.spacing);
  },

  drawLinearSnapTicksStep(origin: Vector3, dir: Vector3, perp: Vector3, signedDistance: number, snap: number) {
    if (snap <= 0) return;
    drawTicks(origin, dir, perp, signedDistance, 0, SharedGizmoSettings.PrecisionHeld ? snap * 0.5 : snap);
  },
};

export const DrawGhosts = {
  drawGhostCenterDot(origin: Vector3, size: number) {
    Handles.color = GizmoColors.Ghost;
    DrawPrimitives.drawAASolidDisc(origin, GizmoRenderer.cameraNormal(), DrawPrimitives.centerDotRadiusFactor() * size);
  },

  drawGhostPlane(
    gizmoPos: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    viewDir: Vector3,
    size: number,
    planeOffset: number,
    planeHalfSize: number,
    planeLineThickness: number,
    shape: PlaneHandleShape,
  ) {
    const handlePos = GizmoRenderer.clampPlaneOffset(gizmoPos, dir1, dir2, viewDir, size, planeOffset, planeHalfSize);
    const corners = PlaneGeometry.corners(shape, gizmoPos, handlePos, dir1, dir2, size * planeHalfSize);
    Handles.color = GizmoColors.GhostPlane;
    DrawPrimitives.drawPolygon(corners, corners.length);
    Handles.color = GizmoColors.Ghost;
    DrawPrimitives.drawThickPolygon(planeLineThickness, corners, corners.length);
  },

  drawGhostRing(origin: Vector3, size: number, ringRadius: number, ringThickness: number, normal: Vector3) {
    Handles.color = GizmoColors.Ghost;
    DrawPrimitives.drawAACircle(origin, normal, size * ringRadius, ringThickness);
  },
};

const AXIS_LABEL_FONT = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

export const AxisLabelDrawer = {
  draw(worldPosition: Vector3, label: string, color: Color) {
    if (!isRepaint()) return;
    const g = HandleUtility.worldToGUIPointWithDepth(worldPosition);
    if (g.z <= 0) return;
    // Unity centres a MiddleCenter label's sized rect on the point.
    GUI.label(new Rect(g.x, g.y - 7, 0, 14), label, {
      fontSize: 10,
      bold: true,
      color,
      align: 'center',
      font: AXIS_LABEL_FONT,
    });
  },
};
