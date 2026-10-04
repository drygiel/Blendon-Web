// What Rotate's gizmo and grab share: applying a rotation, X/Y/Z re-constrained tracking, look-at and overlays.
import { Selection } from '../../../unity/editor.ts';
import { HandleUtility, Handles } from '../../../unity/handles.ts';
import { Event } from '../../../unity/imgui.ts';
import { Plane, Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import { SceneTutorial, type ModifierKey } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoColors } from '../colors.ts';
import { AimMode, SurfaceProbe } from '../common/aim-mode.ts';
import { IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { ModalNumericState, type ModalNumericParser } from '../core/numeric.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import { RingAngleTracker, RingOverlays, type RotationRingHandle } from '../handles/ring.ts';
import { GizmoHud } from '../hud.ts';
import { AxisLabelDrawer, DrawOverlays } from '../overlays.ts';
import { DrawPrimitives, GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import type { RotateGizmoSettings } from './settings.ts';

export const RotateMath = {
  /** The active object's rotation as the drag found it. */
  activeSnapshotRotation(coordinator: GizmoDragCoordinator): Quaternion | null {
    const active = Selection.activeTransform;
    if (!active) return null;
    const { transforms, snapshots } = coordinator.snapshot;
    const i = transforms.indexOf(active);
    return i >= 0 ? snapshots[i].rotation : active.rotation;
  },

  applyRotation(coordinator: GizmoDragCoordinator, rot: Quaternion, pivot: Vector3) {
    const { transforms, snapshots } = coordinator.snapshot;
    if (!transforms.length) return;
    const ownOrigins = IndividualOrigins.ownOrigins(coordinator);
    coordinator.snapshot.record('Rotate');
    transforms.forEach((t, i) => {
      t.rotation = rot.mul(snapshots[i].rotation);
      t.position = ownOrigins ? snapshots[i].position : pivot.add(rot.mulV(snapshots[i].position.sub(pivot)));
    });
  },

  applyAxisRotation(
    coordinator: GizmoDragCoordinator,
    numeric: ModalNumericParser,
    angle: number,
    worldAxisDir: Vector3,
    pivot: Vector3,
  ) {
    if (
      IndividualOrigins.localAxes(coordinator, numeric) &&
      coordinator.activeKind === DragKind.Ring &&
      coordinator.activeAxis !== GizmoAxis.Screen
    ) {
      const unit = coordinator.activeAxis.unit;
      const { transforms, snapshots } = coordinator.snapshot;
      const ownOrigins = IndividualOrigins.ownOrigins(coordinator);
      coordinator.snapshot.record('Rotate');
      transforms.forEach((t, i) => {
        const rot = Quaternion.angleAxis(angle, snapshots[i].rotation.mulV(unit));
        t.rotation = rot.mul(snapshots[i].rotation);
        // A shared pivot is orbited about each object's own axis, as Blender does.
        t.position = ownOrigins ? snapshots[i].position : pivot.add(rot.mulV(snapshots[i].position.sub(pivot)));
      });
      return;
    }
    RotateMath.applyRotation(coordinator, Quaternion.angleAxis(angle, worldAxisDir), pivot);
  },

  drawPerObjectAxisLines(coordinator: GizmoDragCoordinator, localAxes: boolean, sharedAxisDir: Vector3) {
    const unit = coordinator.activeAxis.unit;
    const color = coordinator.activeAxis.constrain;
    const { transforms, snapshots } = coordinator.snapshot;
    transforms.forEach((_, i) =>
      DrawOverlays.drawConstraintLine(
        snapshots[i].position,
        localAxes ? snapshots[i].rotation.mulV(unit) : sharedAxisDir,
        color,
      ),
    );
  },
};

export const LookAtRotation = {
  free(eye: Vector3, fromRotation: Quaternion, target: Vector3) {
    let dir = target.sub(eye);
    if (dir.sqrMagnitude < 1e-8) return Quaternion.identity;
    dir = dir.normalized;
    // LookRotation's roll is undefined straight up or down; the shortest rotation has no such singularity.
    const desired =
      Math.abs(Vector3.dot(dir, Vector3.up)) > 0.999
        ? Quaternion.fromToRotation(fromRotation.mulV(Vector3.forward), dir).mul(fromRotation)
        : Quaternion.lookRotation(dir, Vector3.up);
    return desired.mul(Quaternion.inverse(fromRotation));
  },

  axisAngle(eye: Vector3, fromRotation: Quaternion, axis: Vector3, target: Vector3) {
    axis = axis.normalized;
    const forward = Vector3.projectOnPlane(fromRotation.mulV(Vector3.forward), axis);
    const toTarget = Vector3.projectOnPlane(target.sub(eye), axis);
    if (forward.sqrMagnitude < 1e-8 || toTarget.sqrMagnitude < 1e-8) return 0;
    return Vector3.signedAngle(forward, toTarget, axis);
  },
};

/** An X/Y/Z press re-pointed the drag: total travel since the true start is re-measured on the new axis. */
export class RotateManualTracking {
  private readonly coordinator: GizmoDragCoordinator;
  private readonly ringForAxis: (a: GizmoAxis) => RotationRingHandle;
  private readonly ringRadius: () => number;
  private readonly lookAtDriving: () => boolean;
  private readonly applyAngle: (a: number) => void;
  private readonly applyNumeric: () => void;
  private dragOriginMouse = Vector2.zero;
  private refDir = Vector3.right;
  private totalAngle = 0;
  private trackedAxis: GizmoAxis | null = null;
  private trackedAxisDir = Vector3.zero;
  private readonly tracker = new RingAngleTracker();
  active = false;
  axisDir = Vector3.up;

  constructor(
    coordinator: GizmoDragCoordinator,
    ringForAxis: (a: GizmoAxis) => RotationRingHandle,
    ringRadius: () => number,
    lookAtDriving: () => boolean,
    applyAngle: (a: number) => void,
    applyNumeric: () => void,
  ) {
    this.coordinator = coordinator;
    this.ringForAxis = ringForAxis;
    this.ringRadius = ringRadius;
    this.lookAtDriving = lookAtDriving;
    this.applyAngle = applyAngle;
    this.applyNumeric = applyNumeric;
  }

  onDragStart(axisDir?: Vector3) {
    this.dragOriginMouse = this.coordinator.wrap.virtualMousePosition;
    // The ring's own frozen axis, in case digits come before any X/Y/Z.
    if (axisDir) this.axisDir = axisDir;
  }

  deactivate() {
    this.active = false;
  }

  clearSession() {
    this.active = false;
    this.trackedAxis = null;
  }

  forgetTrackedAxis() {
    this.trackedAxis = null;
  }

  computeAnchorDir(axisDir: Vector3): Vector3 | null {
    const pivot = this.coordinator.pivotAtDragStart;
    const ray = HandleUtility.guiPointToWorldRay(this.dragOriginMouse);
    const [hit, d] = new Plane(axisDir, pivot).raycast(ray);
    if (!hit) return null;
    const dir = ray.getPoint(d).sub(pivot);
    return dir.sqrMagnitude > 1e-8 ? dir : null;
  }

  handleConstraintChanged(numeric: ModalNumericParser, spaceRotation: Quaternion) {
    // A plane's identity axis is its excluded one, so both kinds resolve to the rotation axis.
    const [, axis] = numeric.resolveDragTarget();
    this.coordinator.retarget(DragKind.Ring, axis);
    const dir = new AxisBasis(spaceRotation).dir(axis);
    this.axisDir = dir;
    GizmoHud.startRotateDrag(axis, dir);
    if (numeric.state === ModalNumericState.NumericInput) {
      this.active = false;
      this.applyNumeric();
      return;
    }
    this.active = true;
    this.apply();
  }

  apply() {
    const c = this.coordinator;
    if (c.activeKind !== DragKind.Ring || this.lookAtDriving()) return;
    const axisDir = this.axisDir;
    const pivot = c.pivotAtDragStart;
    const current = c.wrap.virtualMousePosition;
    // A Global <-> Local repeat keeps the axis identity but not its world direction.
    if (this.trackedAxis !== c.activeAxis || !axisDir.equals(this.trackedAxisDir)) {
      const anchor = this.computeAnchorDir(axisDir);
      const ring = this.ringForAxis(c.activeAxis);
      this.refDir = anchor?.normalized ?? ring.refDir;
      this.totalAngle = ring.appliedAngle;
      this.trackedAxis = c.activeAxis;
      this.trackedAxisDir = axisDir;
      this.tracker.anchor(pivot, axisDir, this.refDir, current);
    }
    const viewDir = GizmoRenderer.computeViewDir(pivot, GizmoRenderer.currentCamera());
    this.totalAngle += this.tracker.frameDelta(pivot, axisDir, this.refDir, this.ringRadius(), viewDir, current);
    GizmoHud.setAbsoluteDelta(this.totalAngle);
    this.ringForAxis(c.activeAxis).seedManualOverlay(axisDir, this.refDir, this.totalAngle);
    this.applyAngle(this.totalAngle);
  }
}

// Recollecting contacts costs two more scene raycasts; only worth it once the line visibly moved.
const ContactRecollectFraction = 0.002;

/** Alt while rotating: turns the selection to face the surface point (or cursor) under the cursor. */
export class RotateLookAt {
  private readonly aim = new AimMode();
  private readonly coordinator: GizmoDragCoordinator;
  private readonly onRelease: () => void;
  private contactsFrom = Vector3.zero;
  private contactsTo = Vector3.zero;
  private hasContacts = false;
  // Off every surface the aim falls back to the cursor ray; the drawn end needs a finite point.
  private cursorAim = Vector3.zero;
  private cursorTarget = Vector3.zero;
  contacts: { point: Vector3; normal: Vector3 }[] = [];
  targetStale = false;
  rotation = Quaternion.identity;
  angle = 0;

  constructor(coordinator: GizmoDragCoordinator, resumeNativeDrag: () => void) {
    this.coordinator = coordinator;
    this.onRelease = () => {
      this.coordinator.wrap.resume();
      resumeNativeDrag();
      this.clear();
    };
  }

  get held() {
    return this.aim.held;
  }
  get driving() {
    return this.aim.driving;
  }
  get hasTarget() {
    return this.aim.hasTarget || this.targetStale;
  }
  get target() {
    return this.targetStale ? this.cursorTarget : this.aim.target;
  }
  get normal() {
    return this.targetStale ? GizmoRenderer.cameraNormal() : this.aim.normal;
  }
  private get aimTarget() {
    return this.targetStale ? this.cursorAim : this.aim.target;
  }

  update(
    sceneView: SceneView,
    ev: Event,
    enabled: boolean,
    modifier: ModifierKey,
    canDrive: boolean,
    apply: () => void,
  ) {
    this.aim.update(sceneView, ev, enabled, modifier, canDrive, apply, this.onRelease, () => {
      this.coordinator.wrap.suspend();
      SceneTutorial.report('LookAt');
    });
  }

  probeAndCollect(pivot: Vector3) {
    const hit = this.aim.probe(Event.current.mousePosition, this.coordinator.snapshot.transforms);
    this.targetStale = false;
    if (!hit) {
      const t = this.tryCursorTarget(pivot);
      if (t) {
        [this.cursorAim, this.cursorTarget] = t;
        this.targetStale = true;
      }
    }
    if (!this.hasTarget) return false;
    if (this.contactsStale(pivot, this.target)) {
      this.contacts = SurfaceProbe.collectContacts(pivot, this.target, this.coordinator.snapshot.transforms);
      this.contactsFrom = pivot;
      this.contactsTo = this.target;
      this.hasContacts = true;
    }
    return true;
  }

  private tryCursorTarget(pivot: Vector3): [Vector3, Vector3] | null {
    const camera = GizmoRenderer.currentCamera();
    if (!camera) return null;
    const mouse = Event.current.mousePosition;
    const ray = HandleUtility.guiPointToWorldRay(mouse);
    const drawn = ScreenDragSolver.tryCursorOnPlane(
      new Plane(camera.forward, pivot),
      HandleUtility.worldToGUIPoint(pivot),
      mouse,
    );
    if (!drawn) return null;
    return [camera.orthographic ? drawn : pivot.add(ray.direction), drawn];
  }

  private contactsStale(from: Vector3, to: Vector3) {
    if (!this.hasContacts) return true;
    const tol = Math.max(1e-4, to.sub(from).magnitude * ContactRecollectFraction);
    return from.sub(this.contactsFrom).sqrMagnitude > tol * tol || to.sub(this.contactsTo).sqrMagnitude > tol * tol;
  }

  aimFree(pivot: Vector3, fromRotation: Quaternion) {
    this.rotation = LookAtRotation.free(pivot, fromRotation, this.aimTarget);
    return this.rotation;
  }

  aimAxis(pivot: Vector3, fromRotation: Quaternion, axis: Vector3) {
    this.angle = LookAtRotation.axisAngle(pivot, fromRotation, axis, this.aimTarget);
    this.rotation = Quaternion.angleAxis(this.angle, axis);
    return this.angle;
  }

  reset() {
    this.aim.reset();
    this.clear();
  }

  private clear() {
    this.rotation = Quaternion.identity;
    this.angle = 0;
    this.contacts = [];
    this.hasContacts = false;
    this.targetStale = false;
  }
}

export const RotateDragOverlays = {
  drawConstrainedRing(
    axis: GizmoAxis,
    pivot: Vector3,
    axisDir: Vector3,
    refDir: Vector3,
    angle: number,
    size: number,
    settings: RotateGizmoSettings,
    viewDir: Vector3,
  ) {
    const radius = size * settings.AxisLength;
    RingOverlays.drawAngleArc(pivot, axisDir, refDir, angle, GizmoColors.ScreenRing, axis.constrain, radius, settings);
    if (SharedGizmoSettings.AxisLabelsEnabled)
      AxisLabelDrawer.draw(
        RingOverlays.ringLabelPosition(pivot, axisDir, radius, viewDir, settings, size),
        axis.label,
        axis.active,
      );
    // The full circle in the dragged style.
    Handles.color = axis.active;
    const thickness = settings.AxisThicknessHover;
    if (settings.RingDepthGradientEnabled && !(GizmoRenderer.currentCamera()?.orthographic ?? false))
      DrawPrimitives.drawGradientCircle(pivot, axisDir, radius, thickness, viewDir, axis.circleNear, axis.circleFar);
    else DrawPrimitives.drawAACircle(pivot, axisDir, radius, thickness);
  },
};
