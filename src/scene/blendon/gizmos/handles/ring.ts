// The Rotate gizmo's handles: ring geometry and angle tracking, ring overlays, the rings and the trackball.
import { EditorSnapSettings } from '../../../unity/editor.ts';
import { HandleUtility, Handles } from '../../../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility, MouseButton } from '../../../unity/imgui.ts';
import { Color, Mathf, Plane, Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import { withAlpha, withOpacity } from '../../color.ts';
import { SceneTutorial, SnapCompat } from '../../foundation.ts';
import type { GizmoAxis } from '../axis.ts';
import { GizmoColors } from '../colors.ts';
import { Signal } from '../common/signal.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import { AxisLabelDrawer, DrawOverlays } from '../overlays.ts';
import { DrawPrimitives, GizmoRenderer } from '../rendering.ts';
import type { RotateGizmoSettings } from '../rotate/settings.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { AxisHandle } from './axis-handle.ts';

// Blend window between the screen-space sweep (robust everywhere) and the plane-projected angle
// (well-conditioned only where the view ray meets the ring plane steeply).
const AngleBlendLowT = 0.15;
const AngleBlendHighT = 0.5;

function signedAngle2D(from: Vector2, to: Vector2) {
  return Math.atan2(from.x * to.y - from.y * to.x, Vector2.dot(from, to)) * Mathf.Rad2Deg;
}

export const RingGeometry = {
  referenceDir(axis: Vector3) {
    let r = Vector3.cross(axis, Vector3.up);
    if (r.sqrMagnitude < 0.001) r = Vector3.cross(axis, Vector3.right);
    return r.normalized;
  },

  tryAbsoluteAngle(position: Vector3, axis: Vector3, refDir: Vector3, guiPoint: Vector2): number | null {
    const ray = HandleUtility.guiPointToWorldRay(guiPoint);
    const [hit, dist] = new Plane(axis, position).raycast(ray);
    if (!hit) return null;
    const hitDir = ray.getPoint(dist).sub(position);
    if (hitDir.sqrMagnitude < 1e-8) return null;
    return Vector3.signedAngle(refDir, hitDir, axis);
  },

  rayAxisCosine(axis: Vector3, guiPoint: Vector2) {
    return Vector3.dot(axis.normalized, HandleUtility.guiPointToWorldRay(guiPoint).direction.normalized);
  },

  planeAngleWeight(rayAxisCosine: number) {
    return Mathf.SmoothStep(0, 1, Mathf.InverseLerp(AngleBlendLowT, AngleBlendHighT, Math.abs(rayAxisCosine)));
  },

  /** Screen-space sweep around the ring's centre, sign-calibrated against the ring's own positive direction. */
  incrementalRingAngleDelta(
    position: Vector3,
    axis: Vector3,
    viewDir: Vector3,
    radius: number,
    current: Vector2,
    prev: Vector2,
  ) {
    const center = HandleUtility.worldToGUIPoint(position);
    const raw = signedAngle2D(prev.sub(center), current.sub(center));
    let visibleDir = Vector3.cross(axis, viewDir);
    visibleDir = visibleDir.sqrMagnitude > 1e-6 ? visibleDir.normalized : RingGeometry.referenceDir(axis);
    const p0 = HandleUtility.worldToGUIPoint(position.add(visibleDir.mul(radius)));
    const p1 = HandleUtility.worldToGUIPoint(position.add(Quaternion.angleAxis(1, axis).mulV(visibleDir).mul(radius)));
    const v0 = p0.sub(center),
      v1 = p1.sub(center);
    if (v0.sqrMagnitude < 1e-4 || v1.sqrMagnitude < 1e-4) return 0;
    return raw * Mathf.Sign(signedAngle2D(v0, v1));
  },

  distanceToRingScreen(position: Vector3, axis: Vector3, radius: number, viewDir: Vector3, fullCircle: boolean) {
    const segments = Math.max(Math.ceil(24 * SharedGizmoSettings.Quality), 8);
    const u = RingGeometry.referenceDir(axis);
    const v = Vector3.cross(axis, u).normalized;
    let best = Infinity;
    let prev = Vector3.zero;
    let prevFront = false;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * 2 * Math.PI;
      const dir = u.mul(Math.cos(t)).add(v.mul(Math.sin(t)));
      const world = position.add(dir.mul(radius));
      const front = fullCircle || Vector3.dot(dir, viewDir) < 0;
      if (i > 0 && front && prevFront) best = Math.min(best, HandleUtility.distanceToLine(prev, world));
      prev = world;
      prevFront = front;
    }
    return best;
  },
};

/** Cursor-angle bookkeeping for "rotate to cursor": the screen sweep blended with the plane angle. */
export class RingAngleTracker {
  private prevMouse = Vector2.zero;
  private prevAngle = 0;
  // Which side of the ring plane's screen horizon the cursor was on.
  private prevRayCos = 0;
  private hasPrevAngle = false;

  anchor(position: Vector3, axis: Vector3, refDir: Vector3, mouse: Vector2) {
    const a = RingGeometry.tryAbsoluteAngle(position, axis, refDir, mouse);
    this.hasPrevAngle = a != null;
    this.prevAngle = a ?? 0;
    this.prevRayCos = RingGeometry.rayAxisCosine(axis, mouse);
    this.prevMouse = mouse;
  }

  frameDelta(position: Vector3, axis: Vector3, refDir: Vector3, radius: number, viewDir: Vector3, current: Vector2) {
    const screenDelta = RingGeometry.incrementalRingAngleDelta(
      position,
      axis,
      viewDir,
      radius,
      current,
      this.prevMouse,
    );
    this.prevMouse = current;
    const rayCos = RingGeometry.rayAxisCosine(axis, current);
    const angle = RingGeometry.tryAbsoluteAngle(position, axis, refDir, current);
    // A previous frame without an angle, or a jump across the horizon, would diff against something unrelated.
    const usable = angle != null && this.hasPrevAngle && rayCos * this.prevRayCos > 0;
    const weight = usable ? RingGeometry.planeAngleWeight(rayCos) : 0;
    const planeDelta = usable ? Mathf.DeltaAngle(this.prevAngle, angle) : 0;
    if (angle != null) this.prevAngle = angle;
    this.prevRayCos = rayCos;
    this.hasPrevAngle = angle != null;
    return Mathf.Lerp(screenDelta, planeDelta, weight);
  }
}

function drawArcWedge(
  center: Vector3,
  axis: Vector3,
  refDir: Vector3,
  angle: number,
  radius: number,
  color: Color,
  alpha: number,
) {
  Handles.color = withAlpha(color, alpha);
  const steps = Math.max(1, Math.ceil(Math.abs(angle) / 4));
  let prev = center.add(refDir.mul(radius));
  for (let i = 1; i <= steps; i++) {
    const point = center.add(Quaternion.angleAxis(angle * (i / steps), axis).mulV(refDir.mul(radius)));
    DrawPrimitives.drawTriangle(center, prev, point);
    prev = point;
  }
}

export const RingOverlays = {
  drawAngleArc(
    center: Vector3,
    axis: Vector3,
    refDir: Vector3,
    angle: number,
    fillColor: Color,
    lineColor: Color,
    radius: number,
    settings: RotateGizmoSettings,
  ) {
    const shared = SharedGizmoSettings;
    if (settings.AngleArcEnabled && Math.abs(angle) > 0.01) {
      const targetAlpha = settings.AngleArcOpacity * shared.Opacity;
      if (settings.DynamicOpacity) {
        const abs = Math.abs(angle);
        const sign = angle < 0 ? -1 : 1;
        const laps = abs / 360;
        const wrapped = Mathf.Repeat(abs, 360);
        // Each full lap washes the disc a little more.
        const washCap = Math.min(settings.AngleArcOpacity * 1.5, 0.6);
        const washAlpha = washCap * (1 - Math.pow(1 - 0.35, laps)) * shared.Opacity;
        if (washAlpha > 0.001) {
          Handles.color = withAlpha(fillColor, washAlpha);
          DrawPrimitives.drawAASolidDisc(center, axis, radius);
        }
        const transitionDeg = 40;
        const inTransition = Math.floor(laps) >= 1 && wrapped < transitionDeg;
        const t = inTransition ? wrapped / transitionDeg : 1;
        if (inTransition) drawArcWedge(center, axis, refDir, 360 * sign, radius, fillColor, targetAlpha * (1 - t));
        drawArcWedge(
          center,
          axis,
          refDir,
          wrapped * sign,
          radius,
          fillColor,
          inTransition ? targetAlpha * t : targetAlpha,
        );
      } else drawArcWedge(center, axis, refDir, angle, radius, fillColor, targetAlpha);
    }
    // The start (ghost) radius and the current one.
    Handles.color = lineColor;
    DrawPrimitives.drawThickLine(center, center.add(refDir.mul(radius)), shared.ScreenRingThickness * 0.8);
    const current = Quaternion.angleAxis(angle, axis).mulV(refDir);
    Handles.color = withAlpha(lineColor, shared.Opacity);
    DrawPrimitives.drawThickLine(center, center.add(current.mul(radius)), shared.ScreenRingThickness + 1);
  },

  drawSnapTicks(center: Vector3, axis: Vector3, refDir: Vector3, ringRadius: number) {
    const s = SharedGizmoSettings;
    const precision = s.PrecisionHeld;
    const tickAngle = precision ? EditorSnapSettings.rotate * 0.5 : EditorSnapSettings.rotate;
    const count = Math.max(1, Mathf.RoundToInt(360 / tickAngle));
    const inner = ringRadius * (1 + s.SnapTickGap);
    const majorOuter = inner + ringRadius * s.SnapTickLength;
    const minorOuter = inner + ringRadius * s.SnapTickLength * 0.6;
    for (let i = 0; i < count; i++) {
      const isMajor = !precision || i % 2 === 0;
      const dir = Quaternion.angleAxis(i * tickAngle, axis).mulV(refDir);
      Handles.color = isMajor ? GizmoColors.SnapTickMajor : GizmoColors.SnapTickMinor;
      DrawPrimitives.drawThickLine(
        center.add(dir.mul(inner)),
        center.add(dir.mul(isMajor ? majorOuter : minorOuter)),
        s.ScreenRingThickness * (isMajor ? 0.6 : 0.4),
      );
    }
  },

  ringLabelPosition(
    center: Vector3,
    axis: Vector3,
    radius: number,
    viewDir: Vector3,
    settings: RotateGizmoSettings,
    size: number,
  ) {
    const visible = Vector3.cross(axis, viewDir);
    const dir = visible.sqrMagnitude > 1e-6 ? visible.normalized : RingGeometry.referenceDir(axis);
    return center.add(dir.mul(radius + Mathf.Lerp(0.1, 0.13, settings.AxisThickness / 10) * size));
  },

  drawFrontHalfRing(position: Vector3, axis: Vector3, radius: number, thickness: number, viewDir: Vector3) {
    const u = RingGeometry.referenceDir(axis);
    const v = Vector3.cross(axis, u).normalized;
    const du = Vector3.dot(u, viewDir);
    const dv = Vector3.dot(v, viewDir);
    if (Math.abs(du) < 0.05 && Math.abs(dv) < 0.05) {
      DrawPrimitives.drawAACircle(position, axis, radius, thickness);
      return;
    }
    // Silhouette where dot(radial, viewDir) = 0; [t0, t0 + 180] is the half facing the camera.
    let t0 = Math.atan2(-du, dv) * Mathf.Rad2Deg;
    const mid = (t0 + 90) * Mathf.Deg2Rad;
    if (Vector3.dot(u.mul(Math.cos(mid)).add(v.mul(Math.sin(mid))), viewDir) > 0) t0 += 180;
    const segs = Math.ceil(SharedGizmoSettings.qualityLerp(4, 60));
    const pts: Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = (t0 + (i / segs) * 180) * Mathf.Deg2Rad;
      pts.push(
        position.add(
          u
            .mul(Math.cos(t))
            .add(v.mul(Math.sin(t)))
            .mul(radius),
        ),
      );
    }
    DrawPrimitives.drawThickPolyline(thickness, false, pts);
  },
};

const isOrthographicView = () => GizmoRenderer.currentCamera()?.orthographic ?? false;

export class RotationRingHandle {
  readonly axisId: GizmoAxis;
  readonly isScreenRing: boolean;
  private readonly coordinator: GizmoDragCoordinator;
  private dragAxis = Vector3.up;
  private dragAxisColor = Color.white;
  private dragRadius = 1;
  // The linear (not rotate-to-cursor) mode, locked at the press.
  private linearAxisIsScreenX = true;
  private linearDegPerPixel = 1;
  private linearSign = 1;
  private prevRingMousePos = Vector2.zero;
  private totalAngle = 0;
  private readonly tracker = new RingAngleTracker();
  private viewDir = Vector3.forward;
  refDir = Vector3.right;
  appliedAngle = 0;
  /** Set while the gizmo drives the angle itself (digits, re-constrain, look-at). */
  angleLocked = false;

  readonly dragStarted = new Signal<[Vector3]>();
  readonly dragged = new Signal<[Vector3, number]>();
  readonly dragEnded = new Signal();

  constructor(axisId: GizmoAxis, isScreenRing: boolean, coordinator: GizmoDragCoordinator) {
    this.axisId = axisId;
    this.isScreenRing = isScreenRing;
    this.coordinator = coordinator;
  }

  draw(
    position: Vector3,
    axis: Vector3,
    radius: number,
    settings: RotateGizmoSettings,
    viewDir: Vector3,
    hidden = false,
  ) {
    const id = GUIUtility.getControlID(FocusType.Passive);
    this.viewDir = viewDir;
    const c = this.coordinator;
    const isDragged = c.activeKind === DragKind.Ring && c.activeAxis === this.axisId;
    const isActive = c.snapshot.activeDragId === id;
    // The ring holding hotControl stays let through after a mid-drag axis switch retargeted elsewhere.
    if (c.activeKind !== DragKind.None && !isDragged && !isActive) return;
    const ev = Event.current;
    switch (ev.type) {
      case EventType.Layout:
      case EventType.MouseMove:
        if (!hidden && (isDragged || c.activeKind === DragKind.None)) {
          const viewAligned = Math.abs(Vector3.dot(axis, viewDir)) > 0.997;
          const full = c.activeKind === DragKind.Ring || this.isScreenRing || viewAligned;
          HandleUtility.addControl(id, RingGeometry.distanceToRingScreen(position, axis, radius, viewDir, full));
        }
        break;
      case EventType.Repaint:
        if (!hidden && (isDragged || c.activeKind === DragKind.None))
          this.drawAxisCircle(id, position, axis, radius, settings, viewDir);
        break;
      case EventType.MouseDown:
        if (
          ev.button === MouseButton.LeftMouse &&
          HandleUtility.nearestControl === id &&
          c.snapshot.activeDragId === 0
        ) {
          GUIUtility.hotControl = id;
          this.beginRingDrag(id, position, axis, radius);
          ev.use();
        }
        break;
      case EventType.MouseDrag:
        if (isActive && GUIUtility.hotControl === id) {
          if (!this.angleLocked) this.updateRingDrag(position, settings);
          ev.use();
        }
        break;
      case EventType.MouseUp:
        if (isActive && GUIUtility.hotControl === id && ev.button === MouseButton.LeftMouse) {
          GUIUtility.hotControl = 0;
          this.endRingDrag();
          c.clickGate.endHandleDrag(() => c.snapshot.cancel());
          ev.use();
        }
        break;
    }
  }

  drawStatic(position: Vector3, axis: Vector3, radius: number, settings: RotateGizmoSettings, viewDir: Vector3) {
    if (Event.current.type !== EventType.Repaint) return;
    this.viewDir = viewDir;
    this.drawAxisCircle(AxisHandle.NoControl, position, axis, radius, settings, viewDir);
  }

  drawDragOverlay(
    position: Vector3,
    size: number,
    settings: RotateGizmoSettings,
    viewDir: Vector3,
    drawConstraintLine = true,
  ) {
    const c = this.coordinator;
    if (c.activeKind !== DragKind.Ring || c.activeAxis !== this.axisId) return;
    const s = SharedGizmoSettings;
    const arcRadius = this.isScreenRing ? size * settings.ScreenRingRadius : size * settings.AxisLength;
    RingOverlays.drawAngleArc(
      position,
      this.dragAxis,
      this.refDir,
      this.appliedAngle,
      GizmoColors.ScreenRing,
      this.dragAxisColor,
      arcRadius,
      settings,
    );
    if (!this.isScreenRing && drawConstraintLine)
      DrawOverlays.drawConstraintLine(position, this.dragAxis, this.dragAxisColor);
    if (s.SnapTicksEnabled && SnapCompat.angleSnapEnabled && EditorSnapSettings.rotate > 0)
      RingOverlays.drawSnapTicks(position, this.dragAxis, this.refDir, arcRadius);
    if (!this.isScreenRing && s.AxisLabelsEnabled)
      AxisLabelDrawer.draw(
        RingOverlays.ringLabelPosition(position, this.dragAxis, arcRadius, viewDir, settings, size),
        this.axisId.label,
        this.axisId.active,
      );
  }

  private beginRingDrag(id: number, position: Vector3, axis: Vector3, radius: number) {
    const c = this.coordinator;
    c.snapshot.setActiveDragId(id);
    c.begin(DragKind.Ring, position, this.axisId);
    SceneTutorial.report('HandleRingDrag');
    this.dragAxis = axis;
    this.dragRadius = radius;
    this.dragAxisColor = this.axisId.constrain;
    this.totalAngle = 0;
    this.appliedAngle = 0;
    // Angle zero points at the cursor, even on a near edge-on ring.
    this.refDir = RingGeometry.referenceDir(axis);
    const hit = ScreenDragSolver.tryCursorOnPlane(
      new Plane(axis, position),
      HandleUtility.worldToGUIPoint(position),
      c.wrap.projectionMousePosition,
    );
    if (hit) {
      const d = hit.sub(position);
      if (d.sqrMagnitude > 1e-8) this.refDir = d.normalized;
    }
    this.prevRingMousePos = c.wrap.virtualMousePosition;
    this.tracker.anchor(position, axis, this.refDir, this.prevRingMousePos);
    // The linear mode drives off whichever screen axis the ring's tangent mostly runs along at the press.
    const tangent = Vector3.cross(axis, this.refDir).normalized;
    const center = HandleUtility.worldToGUIPoint(position);
    const tv = HandleUtility.worldToGUIPoint(position.add(tangent.mul(radius))).sub(center);
    this.linearAxisIsScreenX = Math.abs(tv.x) >= Math.abs(tv.y);
    const comp = this.linearAxisIsScreenX ? tv.x : tv.y;
    this.linearSign = Math.abs(comp) > 1e-4 ? Mathf.Sign(comp) : 1;
    this.linearDegPerPixel = 180 / (2 * Math.max(tv.magnitude, 1));
    this.dragStarted.invoke(axis);
  }

  private updateRingDrag(position: Vector3, settings: RotateGizmoSettings) {
    const s = SharedGizmoSettings;
    const current = this.coordinator.wrap.virtualMousePosition;
    let frameDelta: number;
    if (settings.RotateToCursorEnabled)
      frameDelta = this.tracker.frameDelta(
        position,
        this.dragAxis,
        this.refDir,
        this.dragRadius,
        this.viewDir,
        current,
      );
    else {
      const raw = this.linearAxisIsScreenX ? current.x - this.prevRingMousePos.x : current.y - this.prevRingMousePos.y;
      frameDelta = raw * this.linearSign * this.linearDegPerPixel;
    }
    this.prevRingMousePos = current;
    const precision = s.PrecisionHeld;
    if (precision) frameDelta *= s.EffectivePrecisionFactor;
    this.totalAngle += frameDelta;
    // The total is snapped, not each frame's step, which would drift.
    const snap = precision ? EditorSnapSettings.rotate * 0.5 : EditorSnapSettings.rotate;
    this.appliedAngle =
      SnapCompat.angleSnapEnabled && EditorSnapSettings.rotate > 0
        ? Mathf.Round(this.totalAngle / snap) * snap
        : this.totalAngle;
    this.dragged.invoke(this.dragAxis, this.appliedAngle);
  }

  private endRingDrag() {
    this.coordinator.snapshot.setActiveDragId(0);
    this.coordinator.end();
    this.dragEnded.invoke();
  }

  seedManualOverlay(axis: Vector3, refDir: Vector3, appliedAngle: number) {
    this.dragAxis = axis;
    this.refDir = refDir;
    this.appliedAngle = appliedAngle;
    this.dragAxisColor = this.axisId.constrain;
  }

  resumeNativeDrag(angle: number) {
    const current = this.coordinator.wrap.virtualMousePosition;
    this.totalAngle = angle;
    this.appliedAngle = angle;
    this.prevRingMousePos = current;
    this.tracker.anchor(this.coordinator.pivotAtDragStart, this.dragAxis, this.refDir, current);
  }

  // The front half while idle, the full circle (with an optional depth gradient) while dragged.
  private drawAxisCircle(
    controlId: number,
    position: Vector3,
    axis: Vector3,
    radius: number,
    settings: RotateGizmoSettings,
    viewDir: Vector3,
  ) {
    const c = this.coordinator;
    const s = SharedGizmoSettings;
    const active = c.activeKind === DragKind.Ring && c.activeAxis === this.axisId;
    const hover = !active && GUIUtility.hotControl === 0 && HandleUtility.nearestControl === controlId;
    if (this.isScreenRing)
      Handles.color = active
        ? GizmoColors.CenterDotActive
        : hover
          ? GizmoColors.CenterDotHover
          : settings.ScreenRingColor;
    else Handles.color = active ? this.axisId.active : hover ? this.axisId.hover : this.axisId.color;
    let thickness = this.isScreenRing ? s.ScreenRingThickness : settings.AxisThickness;
    if (active || hover) thickness = this.isScreenRing ? s.ScreenRingThicknessHover : settings.AxisThicknessHover;
    const anyRingDrag = c.activeKind === DragKind.Ring;
    if (!this.isScreenRing && !anyRingDrag) RingOverlays.drawFrontHalfRing(position, axis, radius, thickness, viewDir);
    else if (!this.isScreenRing && settings.RingDepthGradientEnabled && !isOrthographicView())
      DrawPrimitives.drawGradientCircle(
        position,
        axis,
        radius,
        thickness,
        viewDir,
        this.axisId.circleNear,
        this.axisId.circleFar,
      );
    else DrawPrimitives.drawAACircle(position, axis, radius, thickness);
  }
}

// How much brighter the fill sits while look-at is armed.
const LookAtOpacityBoost = 1.1;

export class TrackballHandle {
  private readonly coordinator: GizmoDragCoordinator;
  private appliedPitch = 0;
  private appliedYaw = 0;
  private prevMousePos = Vector2.zero;
  private totalPitch = 0;
  private totalYaw = 0;
  private totalRotation = Quaternion.identity;

  readonly dragStarted = new Signal();
  readonly dragged = new Signal<[Quaternion]>();
  readonly dragEnded = new Signal();

  constructor(coordinator: GizmoDragCoordinator) {
    this.coordinator = coordinator;
  }

  static drawStatic(position: Vector3, radius: number, settings: RotateGizmoSettings) {
    if (Event.current.type !== EventType.Repaint) return;
    Handles.color = withOpacity(GizmoColors.TrackBall, settings.TrackballOpacity);
    DrawPrimitives.drawAASolidDisc(position, GizmoRenderer.cameraNormal(), radius);
  }

  draw(position: Vector3, radius: number, settings: RotateGizmoSettings, lookAtArmed = false) {
    const id = GUIUtility.getControlID(FocusType.Passive);
    const c = this.coordinator;
    const isActive = c.snapshot.activeDragId === id;
    const anyDrag = c.activeKind !== DragKind.None;
    if (anyDrag && !isActive) return;
    const ev = Event.current;
    switch (ev.type) {
      case EventType.Layout:
      case EventType.MouseMove: {
        if (anyDrag) break;
        // A fallback at 5 px anywhere inside, which any tight ring hover still beats.
        const center = HandleUtility.worldToGUIPoint(position);
        const right = GizmoRenderer.currentCamera()?.right ?? Vector3.right;
        const radiusPx = Vector2.distance(center, HandleUtility.worldToGUIPoint(position.add(right.mul(radius))));
        if (Vector2.distance(ev.mousePosition, center) < radiusPx) HandleUtility.addControl(id, 5);
        break;
      }
      case EventType.Repaint: {
        if (anyDrag) break;
        const active = GUIUtility.hotControl === id;
        const hover = !active && GUIUtility.hotControl === 0 && HandleUtility.nearestControl === id;
        let alpha = 0.01;
        if (hover) alpha = Math.min(settings.TrackballOpacity * 1.5, 0.3);
        else if (lookAtArmed) alpha = Math.min(settings.TrackballOpacity * LookAtOpacityBoost, 0.1);
        Handles.color = withOpacity(GizmoColors.TrackBall, alpha);
        DrawPrimitives.drawAASolidDisc(position, GizmoRenderer.cameraNormal(), radius);
        break;
      }
      case EventType.MouseDown:
        if (
          ev.button === MouseButton.LeftMouse &&
          HandleUtility.nearestControl === id &&
          c.snapshot.activeDragId === 0
        ) {
          GUIUtility.hotControl = id;
          this.beginDrag(id, position);
          ev.use();
        }
        break;
      case EventType.MouseDrag:
        if (isActive && GUIUtility.hotControl === id) {
          this.updateDrag(position, radius);
          ev.use();
        }
        break;
      case EventType.MouseUp:
        if (isActive && GUIUtility.hotControl === id && ev.button === MouseButton.LeftMouse) {
          GUIUtility.hotControl = 0;
          c.snapshot.setActiveDragId(0);
          c.end();
          this.dragEnded.invoke();
          c.clickGate.endHandleDrag(() => c.snapshot.cancel());
          ev.use();
        }
        break;
    }
  }

  private beginDrag(id: number, position: Vector3) {
    const c = this.coordinator;
    c.snapshot.setActiveDragId(id);
    c.begin(DragKind.Trackball, position);
    this.prevMousePos = c.wrap.virtualMousePosition;
    this.totalRotation = Quaternion.identity;
    this.totalYaw = this.totalPitch = this.appliedYaw = this.appliedPitch = 0;
    this.dragStarted.invoke();
  }

  private updateDrag(position: Vector3, radius: number) {
    const current = this.coordinator.wrap.virtualMousePosition;
    const delta = current.sub(this.prevMousePos);
    this.prevMousePos = current;
    const cam = GizmoRenderer.currentCamera();
    if (!cam) return;
    // Crossing the whole diameter turns 180 degrees.
    const center = HandleUtility.worldToGUIPoint(position);
    const screenRadius = Math.max(
      HandleUtility.worldToGUIPoint(position.add(cam.right.mul(radius))).sub(center).magnitude,
      1,
    );
    const degPerPixel = 180 / (2 * screenRadius);
    let yaw = -delta.x * degPerPixel;
    let pitch = -delta.y * degPerPixel;
    const s = SharedGizmoSettings;
    const precision = s.PrecisionHeld;
    if (precision) {
      yaw *= s.EffectivePrecisionFactor;
      pitch *= s.EffectivePrecisionFactor;
    }
    // Running totals snapped fresh each frame; only the change in the snapped value is applied.
    this.totalYaw += yaw;
    this.totalPitch += pitch;
    let snappedYaw = this.totalYaw,
      snappedPitch = this.totalPitch;
    if (SnapCompat.angleSnapEnabled && EditorSnapSettings.rotate > 0) {
      const snap = precision ? EditorSnapSettings.rotate * 0.5 : EditorSnapSettings.rotate;
      snappedYaw = Mathf.Round(this.totalYaw / snap) * snap;
      snappedPitch = Mathf.Round(this.totalPitch / snap) * snap;
    }
    const angleY = snappedYaw - this.appliedYaw;
    const angleX = snappedPitch - this.appliedPitch;
    this.appliedYaw = snappedYaw;
    this.appliedPitch = snappedPitch;
    const frame = Quaternion.angleAxis(angleY, cam.up).mul(Quaternion.angleAxis(angleX, cam.right));
    this.totalRotation = frame.mul(this.totalRotation);
    this.dragged.invoke(this.totalRotation);
  }

  resumeNativeDrag(rotation: Quaternion) {
    this.totalRotation = rotation;
    this.prevMousePos = this.coordinator.wrap.virtualMousePosition;
    this.totalYaw = this.totalPitch = this.appliedYaw = this.appliedPitch = 0;
  }

  /** Shortest-path axis * angle, for the HUD. */
  static rotationVector(rot: Quaternion) {
    const [angle, axis] = rot.toAngleAxis();
    return Number.isNaN(axis.x) ? Vector3.zero : axis.mul(angle > 180 ? angle - 360 : angle);
  }
}
