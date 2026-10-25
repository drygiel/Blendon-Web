// RotateGrab: R spins the selection about the view axis with the cursor, X/Y/Z pick a world/local axis, and the
// Look At key aims that axis at a surface like a ring drag.
import { ShortcutManager, Tool, type ShortcutArguments } from '../../../unity/editor.ts';
import { HandleUtility, MouseCursor } from '../../../unity/handles.ts';
import { Event, EventType } from '../../../unity/imgui.ts';
import { Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { SceneCamera, SceneView } from '../../../unity/sceneview.ts';
import { ShortcutTips } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GrabSession, IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { ModalNumericState } from '../core/numeric.ts';
import { RotateSnap } from '../core/rotate-snap.ts';
import { RingAngleTracker, RingGeometry } from '../handles/ring.ts';
import { GizmoHud } from '../hud.ts';
import { DrawOverlays } from '../overlays.ts';
import { GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { RotateDragOverlays, RotateLookAt, RotateManualTracking, RotateMath } from './rotate-parts.ts';
import { RotateGizmo } from './rotate-gizmo.ts';

export class RotateGrab extends GrabSession {
  static readonly ShortcutId = 'Blendon/Rotate/Grab';
  private readonly lookAt: RotateLookAt;
  // See RotateMath.frozenLocalSpace.
  private activeAtStart: Quaternion | null = null;
  // Cursor-driven, typed or aimed.
  private appliedAngle = 0;
  // An axis key while aiming, see onConstraintChanged.
  private reaimPending = false;
  // Accumulated from blended per-frame deltas, so a sweep past 180 keeps counting instead of wrapping.
  private axisDir = Vector3.forward;
  private refDir = Vector3.right;
  // Unwrapped, angle zero points there on every axis.
  private startMouse = Vector2.zero;
  private totalAngle = 0;
  private readonly tracker = new RingAngleTracker();

  private static _instance: RotateGrab | null = null;
  static get instance() {
    return (RotateGrab._instance ??= new RotateGrab());
  }

  private constructor() {
    super(new GizmoDragCoordinator());
    this.lookAt = new RotateLookAt(this.coordinator, () => this.resumeFromAim());
    this.subscribeSceneGui();
  }

  static install() {
    ShortcutManager.register(
      RotateGrab.ShortcutId,
      (args: ShortcutArguments) => {
        RotateGrab.instance.request(args);
        ShortcutTips.note(RotateGrab.ShortcutId);
      },
      false,
      'R',
    );
  }

  private static get settings() {
    return RotateGizmo.instance.settings;
  }
  protected get bindingId() {
    return RotateGrab.ShortcutId;
  }
  protected get enabled() {
    return RotateGrab.settings.Enabled;
  }
  protected get toolType() {
    return Tool.Rotate;
  }
  protected get grabKind() {
    return DragKind.Ring;
  }
  protected get dragCursor() {
    return MouseCursor.Orbit;
  }
  protected override get altArmed() {
    return this.lookAt.held;
  }
  // The free sweep turns about the view axis, which has no local meaning - the screen ring's identity.
  protected override get grabAxis() {
    return GizmoAxis.Screen;
  }

  protected ownsDragKind(kind: DragKind) {
    return kind === DragKind.Ring || kind === DragKind.Trackball;
  }

  gizmoPosition() {
    return this.coordinator.pivotAtDragStart;
  }

  protected override localSpaceRotation() {
    return RotateMath.frozenLocalSpace(this.activeAtStart);
  }

  // A deferred Global under a Local pivot toggle would read the rotation this session is spinning.
  protected override defaultSpaceRotation() {
    return RotateMath.frozenDefaultSpace(this.coordinator, this.numeric, this.activeAtStart);
  }

  protected onSessionBegan(_sceneView: SceneView, camera: SceneCamera, pivot: Vector3) {
    this.activeAtStart = RotateMath.activeRotation();
    this.totalAngle = 0;
    this.appliedAngle = 0;
    this.startMouse = this.coordinator.wrap.virtualMousePosition;
    this.seedTracking(camera.forward, pivot);
    GizmoHud.startRotateDrag(GizmoAxis.Screen, this.axisDir);
  }

  private seedTracking(axisDir: Vector3, pivot: Vector3) {
    this.axisDir = axisDir;
    // Angle zero points at the start's cursor, as on a gizmo ring; a grazing ray falls back to the ring basis.
    this.refDir =
      RotateManualTracking.anchorDir(pivot, axisDir, this.startMouse)?.normalized ?? RingGeometry.referenceDir(axisDir);
    this.tracker.anchor(pivot, axisDir, this.refDir, this.coordinator.wrap.virtualMousePosition);
  }

  // First, so the Look At key takes effect on the event that carries it. Typed digits beat the cursor.
  protected override onInputPass(sceneView: SceneView, ev: Event) {
    const s = RotateGrab.settings;
    this.lookAt.update(
      sceneView,
      ev,
      s.LookAtEnabled,
      s.LookAtModifier,
      this.numeric.state !== ModalNumericState.NumericInput,
      () => this.applyLookAt(),
    );
    if (!this.reaimPending) return;
    this.reaimPending = false;
    if (this.lookAt.driving) this.applyLookAt();
  }

  // Turns the sweep's axis, the view's or X/Y/Z, as far as it goes toward the surface under the cursor.
  private applyLookAt() {
    const c = this.coordinator;
    const pivot = c.pivotAtDragStart;
    if (!this.lookAt.probeAndCollect(pivot)) return;
    // The active object's aim, for the readout and the sweep after the key. Each object may aim on its own.
    this.appliedAngle = this.lookAt.aimAxis(pivot, this.localSpaceRotation(), this.axisDir);
    GizmoHud.setAbsoluteDelta(this.appliedAngle);
    if (!RotateMath.applyPerObjectLookAt(c, this.numeric, this.lookAt, this.axisDir, pivot))
      RotateMath.applyRotation(c, this.lookAt.rotation, pivot);
  }

  // Key let go: the sweep goes on from the aimed angle, anchored on the cursor so nothing jumps. Each object aimed
  // on its own goes on from its own aim.
  private resumeFromAim() {
    if (this.lookAt.hasTarget) this.totalAngle = this.lookAt.angle;
    this.seedTracking(this.axisDir, this.coordinator.pivotAtDragStart);
  }

  protected override endSession() {
    this.lookAt.reset();
    this.reaimPending = false;
    this.activeAtStart = null;
    super.endSession();
  }

  protected followCursor() {
    // Look At owns the angle while its key is held.
    if (this.lookAt.driving) return;
    const pivot = this.coordinator.pivotAtDragStart;
    const viewDir = GizmoRenderer.computeViewDir(pivot, GizmoRenderer.currentCamera());
    const frameDelta = this.tracker.frameDelta(
      pivot,
      this.axisDir,
      this.refDir,
      this.ringRadius(),
      viewDir,
      this.coordinator.wrap.virtualMousePosition,
    );
    this.totalAngle += frameDelta * RotateSnap.precisionScale;
    this.apply(RotateSnap.snap(this.totalAngle));
  }

  // Typed degrees turn every object alike from the snapshot. The cursor's angle goes on from each one's aim.
  private apply(angle: number, typed = false) {
    this.appliedAngle = angle;
    GizmoHud.setAbsoluteDelta(angle);
    const c = this.coordinator;
    RotateMath.applyAxisRotation(c, this.numeric, angle, this.axisDir, c.pivotAtDragStart, typed ? null : this.lookAt);
  }

  private ringRadius() {
    return (
      HandleUtility.getHandleSize(this.coordinator.pivotAtDragStart) *
      SharedGizmoSettings.Size *
      RotateGrab.settings.AxisLength
    );
  }

  protected applyNumeric() {
    this.apply(this.numeric.currentParsedValue, true);
  }

  protected onConstraintChanged() {
    const c = this.coordinator;
    const pivot = c.pivotAtDragStart;
    let [, axis] = this.numeric.resolveDragTarget();
    if (this.numeric.isUnconstrained) axis = GizmoAxis.Screen;
    c.retarget(DragKind.Ring, axis);
    const dir =
      axis === GizmoAxis.Screen
        ? c.activeViewNormal
        : new AxisBasis(this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit)).dir(axis);
    GizmoHud.startRotateDrag(axis, dir);
    this.seedTracking(dir, pivot);
    // Re-applied at once so the switch shows on the key press; typed digits stay authoritative.
    if (this.numeric.state === ModalNumericState.NumericInput) this.applyNumeric();
    else if (this.lookAt.driving) {
      // The sweep's angle would undo the aim. A relayed key has no GUI pass to probe in, so aim on the next.
      this.reaimPending = true;
      c.activeSceneView?.repaint();
    } else this.apply(RotateSnap.snap(this.totalAngle));
  }

  protected drawSessionOverlays(sceneView: SceneView) {
    if (Event.current.type !== EventType.Repaint) return;
    const c = this.coordinator;
    const pivot = c.pivotAtDragStart;
    // Look At draws to the surface it aims at. The sweep draws to the unwrapped cursor, so the line matches the
    // angle across wraps.
    if (this.lookAt.driving && this.lookAt.hasTarget)
      DrawOverlays.drawLookAtLine(
        pivot,
        this.lookAt.target,
        this.lookAt.normal,
        this.lookAt.contacts,
        this.lookAt.targetStale,
      );
    else DrawOverlays.drawCursorLineToGui(pivot, sceneView.camera, c.wrap.virtualMousePosition);
    if (c.activeAxis === GizmoAxis.Screen) return;
    const size = HandleUtility.getHandleSize(pivot) * SharedGizmoSettings.Size;
    RotateDragOverlays.drawConstrainedRing(
      c.activeAxis,
      pivot,
      this.axisDir,
      this.refDir,
      this.appliedAngle,
      size,
      RotateGrab.settings,
      GizmoRenderer.computeViewDir(pivot, sceneView.camera),
    );
    if (IndividualOrigins.perObjectLines(c, this.numeric)) {
      RotateMath.drawPerObjectAxisLines(c, IndividualOrigins.localAxes(c, this.numeric), this.axisDir);
      return;
    }
    DrawOverlays.drawConstraintLine(pivot, this.axisDir, c.activeAxis.constrain);
  }
}
