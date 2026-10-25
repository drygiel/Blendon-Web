// What Rotate's gizmo and grab share: applying a rotation, X/Y/Z re-constrained tracking, look-at and overlays.
import { Selection, Tools } from '../../../unity/editor.ts';
import { HandleUtility, Handles } from '../../../unity/handles.ts';
import { Event } from '../../../unity/imgui.ts';
import { Plane, Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import { TransformTraits, TutorialTransform, type ModifierKey } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoColors } from '../colors.ts';
import { AimMode, SurfaceProbe } from '../common/aim-mode.ts';
import { IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { ModalNumericState, type ModalNumericParser } from '../core/numeric.ts';
import { RotateSnap } from '../core/rotate-snap.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import { RingAngleTracker, RingOverlays, type RotationRingHandle } from '../handles/ring.ts';
import { GizmoHud } from '../hud.ts';
import { AxisLabelDrawer, DrawOverlays } from '../overlays.ts';
import { DrawPrimitives, GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import type { RotateGizmoSettings } from './settings.ts';

export const RotateMath = {
  /** The active object's rotation now, null with nothing active. Taken as a drag begins. */
  activeRotation(): Quaternion | null {
    return Selection.activeTransform?.rotation ?? null;
  },

  /** Local space at the active object's drag-start rotation, for the whole drag. Shared with RotateGrab. */
  frozenLocalSpace(activeAtStart: Quaternion | null) {
    return activeAtStart ?? RotateMath.activeRotation() ?? Tools.handleRotation;
  },

  /** A deferred Global under a Local pivot toggle freezes like Local, the live one is being turned. */
  frozenDefaultSpace(coordinator: GizmoDragCoordinator, numeric: ModalNumericParser, activeAtStart: Quaternion | null) {
    return coordinator.activeKind !== DragKind.None && numeric.resolveDeferredIsLocal()
      ? RotateMath.frozenLocalSpace(activeAtStart)
      : Tools.handleRotation;
  },

  /** With carried, each object's own released free aim is composed after rot, which goes on from the active one's. */
  applyRotation(
    coordinator: GizmoDragCoordinator,
    rot: Quaternion,
    pivot: Vector3,
    carried: RotateLookAt | null = null,
  ) {
    const { transforms, snapshots } = coordinator.snapshot;
    if (!transforms.length) return;
    if (!carried?.carries) carried = null;
    const ownOrigins = IndividualOrigins.ownOrigins(coordinator);
    coordinator.snapshot.record('Rotate');
    transforms.forEach((t, i) => {
      const turn = carried ? rot.mul(carried.carriedTurn(i)) : rot;
      t.rotation = turn.mul(snapshots[i].rotation);
      t.position = ownOrigins ? snapshots[i].position : pivot.add(turn.mulV(snapshots[i].position.sub(pivot)));
    });
  },

  /** With carried, each object turns on from its own released aim, by the angle the active one turns past its aim. */
  applyAxisRotation(
    coordinator: GizmoDragCoordinator,
    numeric: ModalNumericParser,
    angle: number,
    worldAxisDir: Vector3,
    pivot: Vector3,
    carried: RotateLookAt | null = null,
  ) {
    const ownAxes = RotateMath.ownAxes(coordinator, numeric);
    if (!carried?.carries) carried = null;
    if (!ownAxes && !carried) {
      RotateMath.applyRotation(coordinator, Quaternion.angleAxis(angle, worldAxisDir), pivot);
      return;
    }
    const unit = coordinator.activeAxis.unit;
    const { transforms, snapshots } = coordinator.snapshot;
    const ownOrigins = IndividualOrigins.ownOrigins(coordinator);
    coordinator.snapshot.record('Rotate');
    transforms.forEach((t, i) => {
      const axis = ownAxes ? snapshots[i].rotation.mulV(unit) : worldAxisDir;
      const rot = Quaternion.angleAxis(carried ? angle + carried.carriedAngle(i) : angle, axis);
      t.rotation = rot.mul(snapshots[i].rotation);
      // A shared pivot is orbited by each object's own turn, as Blender does.
      t.position = ownOrigins ? snapshots[i].position : pivot.add(rot.mulV(snapshots[i].position.sub(pivot)));
    });
  },

  // Only a ring has one axis to localize, and the view axis has no local counterpart.
  ownAxes(coordinator: GizmoDragCoordinator, numeric: ModalNumericParser) {
    return (
      IndividualOrigins.localAxes(coordinator, numeric) &&
      coordinator.activeKind === DragKind.Ring &&
      coordinator.activeAxis !== GizmoAxis.Screen
    );
  },

  /**
   * Look-at that aims each object on its own: from its own origin under Individual Origins, about its own axis with
   * per-object axes. False when the selection turns as one. Each aim is noted for the hand-back on release.
   */
  applyPerObjectLookAt(
    coordinator: GizmoDragCoordinator,
    numeric: ModalNumericParser,
    lookAt: RotateLookAt,
    sharedAxisDir: Vector3,
    pivot: Vector3,
  ) {
    lookAt.forgetOwnAims();
    const ownOrigins = IndividualOrigins.ownOrigins(coordinator);
    const ownAxes = RotateMath.ownAxes(coordinator, numeric);
    if (!ownOrigins && !ownAxes) return false;
    const free = coordinator.activeKind === DragKind.Trackball;
    const unit = coordinator.activeAxis.unit;
    const { transforms, snapshots } = coordinator.snapshot;
    coordinator.snapshot.record('Rotate');
    transforms.forEach((t, i) => {
      // Each aims its own +Z from where it turns about.
      const from = snapshots[i].rotation;
      const eye = ownOrigins ? snapshots[i].position : pivot;
      let angle = 0;
      let rot: Quaternion;
      if (free) rot = lookAt.freeFrom(eye, from);
      else {
        const axis = ownAxes ? from.mulV(unit) : sharedAxisDir;
        angle = lookAt.axisAngleFrom(eye, from, axis);
        rot = Quaternion.angleAxis(angle, axis);
      }
      lookAt.noteOwnAim(angle, rot);
      t.rotation = rot.mul(from);
      t.position = ownOrigins ? snapshots[i].position : pivot.add(rot.mulV(snapshots[i].position.sub(pivot)));
    });
    return true;
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

/**
 * An X/Y/Z press re-pointed the drag: the angle so far carries over to the new axis, as in the R grab and Blender.
 * Precision and rotate snap work as in a ring drag.
 */
export class RotateManualTracking {
  private readonly coordinator: GizmoDragCoordinator;
  private readonly ringForAxis: (a: GizmoAxis) => RotationRingHandle;
  private readonly ringRadius: () => number;
  private readonly lookAtDriving: () => boolean;
  private readonly applyAngle: (a: number) => void;
  private readonly applyNumeric: () => void;
  // Angle so far at the last axis key, for the next re-seed. Null re-seeds from the ring, after look-at.
  private carried: number | null = null;
  private dragOriginMouse = Vector2.zero;
  private refDir = Vector3.right;
  private totalAngle = 0;
  private trackedAxis: GizmoAxis | null = null;
  private trackedAxisDir = Vector3.zero;
  private readonly tracker = new RingAngleTracker();
  active = false;
  axisDir = Vector3.up;
  /** What the cursor last turned the drag by, through the ring or here. A hand-back to the mouse reads it. */
  mouseAngle = 0;

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
    // Every end path, so a lock from this drag can't freeze the rings of the next one.
    coordinator.onEnded(() => this.clearSession());
  }

  onDragStart(axisDir?: Vector3) {
    this.clearSession();
    this.mouseAngle = 0;
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
    this.carried = null;
  }

  forgetTrackedAxis() {
    this.trackedAxis = null;
    this.carried = null;
  }

  /** The ring drove the drag itself, or was re-anchored on this angle. */
  noteRingAngle(angle: number) {
    this.mouseAngle = angle;
  }

  /** Backspace emptied the typed value: the cursor turns on from mouseAngle, anchored where it is now. */
  resumeMouse() {
    const c = this.coordinator;
    if (c.activeKind !== DragKind.Ring || this.lookAtDriving()) return;
    if (this.active) {
      this.carried = this.mouseAngle;
      this.trackedAxis = null;
      this.apply();
      return;
    }
    const angle = this.mouseAngle;
    this.ringForAxis(c.activeAxis).resumeNativeDrag(angle);
    GizmoHud.setAbsoluteDelta(angle);
    this.applyAngle(angle);
  }

  computeAnchorDir(axisDir: Vector3): Vector3 | null {
    return RotateManualTracking.anchorDir(this.coordinator.pivotAtDragStart, axisDir, this.dragOriginMouse);
  }

  /** Pivot to startMouse in the axis plane, angle 0 on any axis of one drag. Null when grazing. */
  static anchorDir(pivot: Vector3, axisDir: Vector3, startMouse: Vector2): Vector3 | null {
    const ray = HandleUtility.guiPointToWorldRay(startMouse);
    const [hit, d] = new Plane(axisDir, pivot).raycast(ray);
    if (!hit) return null;
    const dir = ray.getPoint(d).sub(pivot);
    return dir.sqrMagnitude > 1e-8 ? dir : null;
  }

  handleConstraintChanged(numeric: ModalNumericParser, spaceRotation: Quaternion) {
    // A plane's identity axis is its excluded one, so both kinds resolve to the rotation axis.
    const [, axis] = numeric.resolveDragTarget();
    const c = this.coordinator;
    // Read before the retarget: the active ring shows what the drag turns by now. A trackball turn starts at 0.
    const angleSoFar = c.activeKind === DragKind.Ring ? this.ringForAxis(c.activeAxis).appliedAngle : 0;
    c.retarget(DragKind.Ring, axis);
    const dir = new AxisBasis(spaceRotation).dir(axis);
    this.axisDir = dir;
    GizmoHud.startRotateDrag(axis, dir);
    // The pressed ring still holds hotControl on its old axis, so it stays locked under the digits too.
    this.active = true;
    if (numeric.state === ModalNumericState.NumericInput) {
      this.applyNumeric();
      return;
    }
    this.carried = angleSoFar;
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
      this.totalAngle = this.carried ?? ring.appliedAngle;
      this.carried = null;
      this.trackedAxis = c.activeAxis;
      this.trackedAxisDir = axisDir;
      this.tracker.anchor(pivot, axisDir, this.refDir, current);
    }
    const viewDir = GizmoRenderer.computeViewDir(pivot, GizmoRenderer.currentCamera());
    this.totalAngle +=
      this.tracker.frameDelta(pivot, axisDir, this.refDir, this.ringRadius(), viewDir, current) *
      RotateSnap.precisionScale;
    const angle = RotateSnap.snap(this.totalAngle);
    this.mouseAngle = angle;
    GizmoHud.setAbsoluteDelta(angle);
    this.ringForAxis(c.activeAxis).seedManualOverlay(axisDir, this.refDir, angle);
    this.applyAngle(angle);
  }
}

// Recollecting contacts costs two more scene raycasts; only worth it once the line visibly moved.
const ContactRecollectFraction = 0.002;

/**
 * Alt while rotating: turns the selection to face the surface point (or cursor) under the cursor. Keeps the aim
 * for the hand-back on release, and each object's own aim past it.
 */
export class RotateLookAt {
  private readonly aim = new AimMode();
  private readonly coordinator: GizmoDragCoordinator;
  private readonly onRelease: () => void;
  // Each object's own aim past the active one's, kept from a release to the drag's end.
  private carried: { angle: number; turn: Quaternion }[] = [];
  // Each object's own aim in the last apply, in snapshot order. Empty when all aimed as one.
  private ownAims: { angle: number; turn: Quaternion }[] = [];
  private contactsFrom = Vector3.zero;
  private contactsTo = Vector3.zero;
  private hasContacts = false;
  // Off every surface the aim falls back to the cursor ray's direction (null in ortho); the drawn end is finite.
  private cursorAimDir: Vector3 | null = null;
  private cursorTarget = Vector3.zero;
  contacts: { point: Vector3; normal: Vector3 }[] = [];
  targetStale = false;
  rotation = Quaternion.identity;
  angle = 0;

  constructor(coordinator: GizmoDragCoordinator, resumeNativeDrag: () => void) {
    this.coordinator = coordinator;
    this.onRelease = () => {
      this.coordinator.wrap.resume();
      this.carryOwnAims();
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
  /** A released aim turned each object on its own, so the sweep goes on from each one's aim. */
  get carries() {
    return this.carried.length > 0;
  }

  /** How far object index's own aim turned past the active one's, about the same axis. */
  carriedAngle(index: number) {
    return this.carried[index]?.angle ?? 0;
  }

  /** The same for a free aim, composed after the trackball's turn. */
  carriedTurn(index: number) {
    return this.carried[index]?.turn ?? Quaternion.identity;
  }

  // What an object turning about eye turns to. The drawn target only when it's real.
  private aimTarget(eye: Vector3) {
    if (!this.targetStale) return this.aim.target;
    return this.cursorAimDir ? eye.add(this.cursorAimDir) : this.cursorTarget;
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
      TutorialTransform.note(TransformTraits.LookAt);
    });
  }

  probeAndCollect(pivot: Vector3) {
    const hit = this.aim.probe(Event.current.mousePosition, this.coordinator.snapshot.transforms);
    this.targetStale = false;
    if (!hit) {
      const t = this.tryCursorTarget(pivot);
      if (t) {
        [this.cursorAimDir, this.cursorTarget] = t;
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

  // A finite plane point would collapse onto the pivot and spin, except in ortho where it's the only aim that responds.
  private tryCursorTarget(pivot: Vector3): [Vector3 | null, Vector3] | null {
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
    return [camera.orthographic ? null : ray.direction, drawn];
  }

  private contactsStale(from: Vector3, to: Vector3) {
    if (!this.hasContacts) return true;
    const tol = Math.max(1e-4, to.sub(from).magnitude * ContactRecollectFraction);
    return from.sub(this.contactsFrom).sqrMagnitude > tol * tol || to.sub(this.contactsTo).sqrMagnitude > tol * tol;
  }

  aimFree(pivot: Vector3, fromRotation: Quaternion) {
    this.rotation = this.freeFrom(pivot, fromRotation);
    return this.rotation;
  }

  aimAxis(pivot: Vector3, fromRotation: Quaternion, axis: Vector3) {
    this.angle = this.axisAngleFrom(pivot, fromRotation, axis);
    this.rotation = Quaternion.angleAxis(this.angle, axis);
    return this.angle;
  }

  /** One object's own free aim from eye. Leaves the hand-back alone. */
  freeFrom(eye: Vector3, fromRotation: Quaternion) {
    return LookAtRotation.free(eye, fromRotation, this.aimTarget(eye));
  }

  /** One object's own turn about axis. Leaves the hand-back alone. */
  axisAngleFrom(eye: Vector3, fromRotation: Quaternion, axis: Vector3) {
    return LookAtRotation.axisAngle(eye, fromRotation, axis, this.aimTarget(eye));
  }

  /** Starts an apply. One that aims each object on its own notes every one in snapshot order. */
  forgetOwnAims() {
    this.ownAims = [];
  }

  noteOwnAim(angle: number, turn: Quaternion) {
    this.ownAims.push({ angle, turn });
  }

  // Relative to the active object's aim, which the sweep goes on from. No target: this hold aimed nothing.
  private carryOwnAims() {
    if (!this.hasTarget) return;
    const inverse = Quaternion.inverse(this.rotation);
    this.carried = this.ownAims.map(({ angle, turn }) => ({ angle: angle - this.angle, turn: inverse.mul(turn) }));
  }

  reset() {
    this.aim.reset();
    this.clear();
    this.carried = [];
  }

  private clear() {
    this.rotation = Quaternion.identity;
    this.angle = 0;
    this.ownAims = [];
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
    if (SharedGizmoSettings.SnapTicksEnabled && RotateSnap.active)
      RingOverlays.drawSnapTicks(pivot, axisDir, refDir, radius);
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
