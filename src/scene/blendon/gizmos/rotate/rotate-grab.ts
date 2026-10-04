// RotateGrab: R spins the selection about the view axis with the cursor, X/Y/Z pick a world/local axis.
import { ShortcutManager, Tool, Tools, type ShortcutArguments } from '../../../unity/editor.ts';
import { HandleUtility, MouseCursor } from '../../../unity/handles.ts';
import { Event, EventType } from '../../../unity/imgui.ts';
import { Plane, Vector3 } from '../../../unity/math.ts';
import type { SceneCamera, SceneView } from '../../../unity/sceneview.ts';
import { GizmoAxis } from '../axis.ts';
import { GrabSession, IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { ModalNumericState } from '../core/numeric.ts';
import { RingAngleTracker, RingGeometry } from '../handles/ring.ts';
import { GizmoHud } from '../hud.ts';
import { DrawOverlays } from '../overlays.ts';
import { GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { RotateDragOverlays, RotateMath } from './rotate-parts.ts';
import { RotateGizmo } from './rotate-gizmo.ts';

export class RotateGrab extends GrabSession {
  static readonly ShortcutId = 'Blendon/Grab Rotate';
  private appliedAngle = 0;
  // Accumulated from blended per-frame deltas, so a sweep past 180 keeps counting instead of wrapping.
  private axisDir = Vector3.forward;
  private refDir = Vector3.right;
  private totalAngle = 0;
  private readonly tracker = new RingAngleTracker();

  private static _instance: RotateGrab | null = null;
  static get instance() {
    return (RotateGrab._instance ??= new RotateGrab());
  }

  private constructor() {
    super(new GizmoDragCoordinator());
    this.subscribeSceneGui();
  }

  static install() {
    ShortcutManager.register(
      RotateGrab.ShortcutId,
      (args: ShortcutArguments) => RotateGrab.instance.request(args),
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
    return RotateMath.activeSnapshotRotation(this.coordinator) ?? Tools.handleRotation;
  }

  // A deferred Global under a Local pivot toggle would read the rotation this session is spinning.
  protected override defaultSpaceRotation() {
    return this.numeric.resolveDeferredIsLocal() ? this.localSpaceRotation() : Tools.handleRotation;
  }

  protected onSessionBegan(_sceneView: SceneView, camera: SceneCamera, pivot: Vector3) {
    this.totalAngle = 0;
    this.appliedAngle = 0;
    this.seedTracking(camera.forward, pivot);
    GizmoHud.startRotateDrag(GizmoAxis.Screen, this.axisDir);
  }

  private seedTracking(axisDir: Vector3, pivot: Vector3) {
    this.axisDir = axisDir;
    const mouse = this.coordinator.wrap.virtualMousePosition;
    const ray = HandleUtility.guiPointToWorldRay(mouse);
    const [hit, dist] = new Plane(axisDir, pivot).raycast(ray);
    let anchor: Vector3 | null = null;
    if (hit) {
      const dir = ray.getPoint(dist).sub(pivot);
      if (dir.sqrMagnitude > 1e-8) anchor = dir.normalized;
    }
    // Pivot to cursor is angle zero; a grazing ray falls back to the ring basis.
    this.refDir = anchor ?? RingGeometry.referenceDir(axisDir);
    this.tracker.anchor(pivot, axisDir, this.refDir, mouse);
  }

  protected followCursor() {
    const pivot = this.coordinator.pivotAtDragStart;
    const viewDir = GizmoRenderer.computeViewDir(pivot, GizmoRenderer.currentCamera());
    this.totalAngle += this.tracker.frameDelta(
      pivot,
      this.axisDir,
      this.refDir,
      this.ringRadius(),
      viewDir,
      this.coordinator.wrap.virtualMousePosition,
    );
    this.apply(this.totalAngle);
  }

  private apply(angle: number) {
    this.appliedAngle = angle;
    GizmoHud.setAbsoluteDelta(angle);
    RotateMath.applyAxisRotation(
      this.coordinator,
      this.numeric,
      angle,
      this.axisDir,
      this.coordinator.pivotAtDragStart,
    );
  }

  private ringRadius() {
    return (
      HandleUtility.getHandleSize(this.coordinator.pivotAtDragStart) *
      SharedGizmoSettings.Size *
      RotateGrab.settings.AxisLength
    );
  }

  protected applyNumeric() {
    this.apply(this.numeric.currentParsedValue);
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
    else this.apply(this.totalAngle);
  }

  protected drawSessionOverlays(sceneView: SceneView) {
    if (Event.current.type !== EventType.Repaint) return;
    const c = this.coordinator;
    const pivot = c.pivotAtDragStart;
    DrawOverlays.drawCursorLineToGui(pivot, sceneView.camera, c.wrap.virtualMousePosition);
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
