// RotateGizmo: Blendon's Rotate tool (axis rings, screen ring, trackball).
import { Tool, Tools } from '../../../unity/editor.ts';
import { HandleUtility, MouseCursor } from '../../../unity/handles.ts';
import { Event, EventType, GUIUtility } from '../../../unity/imgui.ts';
import { Quaternion, Vector3 } from '../../../unity/math.ts';
import type { SceneCamera, SceneView } from '../../../unity/sceneview.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoController, IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { ModalNumericState } from '../core/numeric.ts';
import { RotationRingHandle, TrackballHandle } from '../handles/ring.ts';
import { GizmoHud } from '../hud.ts';
import { DrawOverlays } from '../overlays.ts';
import { GizmoRenderer } from '../rendering.ts';
import { SelectionPivot } from '../selection-pivot.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { RotateLookAt, RotateManualTracking, RotateMath } from './rotate-parts.ts';
import { RotateGizmoSettings } from './settings.ts';

export class RotateGizmo extends GizmoController {
  readonly settings: RotateGizmoSettings;
  private readonly lookAt: RotateLookAt;
  private readonly manual: RotateManualTracking;
  // Depth-sorted while idle, frozen for the drag: control ids are positional.
  private readonly ringOrder = [0, 1, 2];
  private readonly screenRing: RotationRingHandle;
  private readonly trackball: TrackballHandle;
  private readonly rings: RotationRingHandle[];

  private static _instance: RotateGizmo | null = null;
  static get instance() {
    if (!RotateGizmo._instance) {
      RotateGizmo._instance = new RotateGizmo(new RotateGizmoSettings(), new GizmoDragCoordinator());
      RotateGizmo._instance.subscribeSceneGui();
    }
    return RotateGizmo._instance;
  }

  constructor(settings: RotateGizmoSettings, coordinator: GizmoDragCoordinator) {
    super(coordinator);
    this.settings = settings;
    this.rings = GizmoAxis.all.map((a) => new RotationRingHandle(a, false, coordinator));
    this.screenRing = new RotationRingHandle(GizmoAxis.Screen, true, coordinator);
    this.trackball = new TrackballHandle(coordinator);
    this.manual = new RotateManualTracking(
      coordinator,
      (a) => this.ringForAxis(a),
      () => this.ringRadius(),
      () => this.lookAt.driving,
      (angle) => this.applyAxisRotation(angle, this.manual.axisDir),
      () => this.applyNumericRotation(),
    );
    this.lookAt = new RotateLookAt(coordinator, () => this.resumeNativeDrag());
    for (const r of [...this.rings, this.screenRing]) this.wireRing(r);
    this.trackball.dragStarted.add(() => {
      GizmoHud.startRotateFreeDrag();
      this.numeric.beginMouseTransform(null);
      this.manual.onDragStart();
    });
    this.trackball.dragged.add((rot) => {
      if (this.angleDriven) return;
      GizmoHud.setAbsoluteDelta(TrackballHandle.rotationVector(rot));
      RotateMath.applyRotation(this.coordinator, rot, this.coordinator.pivotAtDragStart);
    });
    this.trackball.dragEnded.add(() => this.endDragSession());
    coordinator.onCancelled(() => this.endDragSession());
    this.numeric.onConfirm = () => {
      this.coordinator.forceRelease();
      this.endDragSession();
    };
    this.numeric.onCancel = () => this.coordinator.cancel();
    this.numeric.onConstraintChanged = () =>
      this.manual.handleConstraintChanged(
        this.numeric,
        this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit),
      );
  }

  get lookAtArmed() {
    return this.lookAt.held;
  }
  protected get toolType() {
    return Tool.Rotate;
  }
  protected get enabled() {
    return this.settings.Enabled;
  }
  protected override get altArmed() {
    return this.lookAt.held;
  }

  // Digits, an X/Y/Z re-constrain or look-at own the angle; the handles' own updates stand down.
  private get angleDriven() {
    return this.numeric.state === ModalNumericState.NumericInput || this.manual.active || this.lookAt.driving;
  }

  private wireRing(ring: RotationRingHandle) {
    ring.dragStarted.add((axis) => {
      GizmoHud.startRotateDrag(ring.axisId, axis);
      // The screen ring has no fixed world axis, so typed digits treat it as free.
      this.numeric.beginMouseTransform(ring.isScreenRing ? null : ring.axisId);
      this.manual.onDragStart(axis);
    });
    ring.dragged.add((axis, angle) => {
      if (this.angleDriven) return;
      GizmoHud.setAbsoluteDelta(angle);
      this.applyAxisRotation(angle, axis);
    });
    ring.dragEnded.add(() => this.endDragSession());
  }

  private endDragSession() {
    GizmoHud.end();
    this.numeric.reset();
    this.manual.clearSession();
    this.lookAt.reset();
  }

  // Pinned to the drag-start pivot: a live one would feed a moving centre back into the angle.
  gizmoPosition() {
    return this.coordinator.activeKind !== DragKind.None
      ? this.coordinator.pivotAtDragStart
      : SelectionPivot.getPosition(SharedGizmoSettings.PivotPoint);
  }

  // Local space stays on the drag-start rotation, not the one this drag is already changing.
  protected override localSpaceRotation() {
    return RotateMath.activeSnapshotRotation(this.coordinator) ?? Tools.handleRotation;
  }

  protected override defaultSpaceRotation() {
    return this.coordinator.activeKind !== DragKind.None && this.numeric.resolveDeferredIsLocal()
      ? this.localSpaceRotation()
      : Tools.handleRotation;
  }

  drawHandles(sceneView: SceneView, isOwner: boolean) {
    const position = this.gizmoPosition();
    // Every ring follows the parser's space, so a mid-drag X X visibly reorients them.
    const rotation = this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit);
    const size = HandleUtility.getHandleSize(position) * SharedGizmoSettings.Size;
    const camera = sceneView.camera;
    const viewDir = GizmoRenderer.computeViewDir(position, camera);
    const c = this.coordinator;
    if (isOwner) c.updateActiveView(camera);
    const basis = new AxisBasis(rotation);
    const ev = Event.current;
    if (isOwner) this.updateLookAt(sceneView, ev);
    const locked = this.angleDriven;
    for (const r of [...this.rings, this.screenRing]) r.angleLocked = locked;
    if (isOwner) {
      // The rings and trackball hold hotControl by hand; a lost one ends the drag here.
      if (
        c.snapshot.activeDragId !== 0 &&
        GUIUtility.hotControl !== c.snapshot.activeDragId &&
        (c.activeKind === DragKind.Ring || c.activeKind === DragKind.Trackball)
      ) {
        c.snapshot.setActiveDragId(0);
        c.end();
        this.endDragSession();
      }
      if (this.handleRmbCancelAndNumeric(ev, () => this.applyNumericRotation())) return;
      if (
        this.manual.active &&
        this.numeric.state === ModalNumericState.MouseTransforming &&
        ev.type === EventType.MouseDrag
      )
        this.manual.apply();
    }
    if (c.activeKind === DragKind.Ring) {
      if (ev.type === EventType.Repaint) {
        // Per-object lines replace the single constraint line through the pivot.
        const pivotLine = !IndividualOrigins.perObjectLines(c, this.numeric);
        for (const r of [...this.rings, this.screenRing])
          r.drawDragOverlay(position, size, this.settings, viewDir, pivotLine);
        this.drawPerObjectRotationAxisLines();
      }
      if (isOwner) this.drawDragCursorLine(camera);
    } else if (c.activeKind === DragKind.Trackball && isOwner) this.drawDragCursorLine(camera);
    if (c.activeKind === DragKind.Ring || c.activeKind === DragKind.Trackball)
      GizmoController.showDragCursor(sceneView, MouseCursor.Orbit);
    // While look-at is armed the view-axis ring has nothing to offer; the trackball aims freely instead.
    const lookAtArmed = this.lookAt.held && c.activeKind === DragKind.None;
    const s = this.settings;
    if (s.TrackballEnabled) this.trackball.draw(position, size * s.TrackballRadius, s, lookAtArmed);
    if (s.ScreenRingEnabled) {
      const normal =
        c.activeKind === DragKind.Ring && c.activeAxis === GizmoAxis.Screen
          ? c.activeViewNormal
          : GizmoRenderer.cameraNormal();
      this.screenRing.draw(position, normal, size * s.ScreenRingRadius, s, viewDir, lookAtArmed);
    }
    const axisDirs = [basis.right, basis.up, basis.forward];
    if (c.activeKind === DragKind.None) GizmoRenderer.sortAxesByDepth(position, size, camera, axisDirs, this.ringOrder);
    for (const i of this.ringOrder) this.rings[i].draw(position, axisDirs[i], size * s.AxisLength, s, viewDir);
  }

  private applyNumericRotation() {
    const c = this.coordinator;
    if (c.activeKind === DragKind.Ring && c.activeAxis !== GizmoAxis.Screen) {
      // The frozen axis: a fresh Local read would follow the rotation this drag already applied.
      const axisDir = this.manual.axisDir;
      const angle = this.numeric.currentParsedValue;
      const ring = this.ringForAxis(c.activeAxis);
      const refDir = this.manual.computeAnchorDir(axisDir)?.normalized ?? ring.refDir;
      ring.seedManualOverlay(axisDir, refDir, angle);
      this.applyAxisRotation(angle, axisDir);
      return;
    }
    const reference = this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit);
    const v = this.numeric.currentParsedVector3;
    const rot = Quaternion.angleAxis(v.x, reference.mulV(Vector3.right))
      .mul(Quaternion.angleAxis(v.y, reference.mulV(Vector3.up)))
      .mul(Quaternion.angleAxis(v.z, reference.mulV(Vector3.forward)));
    RotateMath.applyRotation(c, rot, c.pivotAtDragStart);
  }

  private applyAxisRotation(angle: number, axisDir: Vector3) {
    RotateMath.applyAxisRotation(this.coordinator, this.numeric, angle, axisDir, this.coordinator.pivotAtDragStart);
  }

  private ringRadius() {
    return (
      HandleUtility.getHandleSize(this.coordinator.pivotAtDragStart) *
      SharedGizmoSettings.Size *
      this.settings.AxisLength
    );
  }

  private ringForAxis(axis: GizmoAxis) {
    return this.rings[Math.max(0, axis.index)];
  }

  private activeRing() {
    return this.coordinator.activeAxis === GizmoAxis.Screen
      ? this.screenRing
      : this.ringForAxis(this.coordinator.activeAxis);
  }

  private updateLookAt(sceneView: SceneView, ev: Event) {
    const k = this.coordinator.activeKind;
    const canDrive =
      this.numeric.state !== ModalNumericState.NumericInput && (k === DragKind.Ring || k === DragKind.Trackball);
    this.lookAt.update(sceneView, ev, this.settings.LookAtEnabled, this.settings.LookAtModifier, canDrive, () =>
      this.applyLookAtRotation(),
    );
  }

  // The trackball turns the whole object; a ring only as far as its one axis allows.
  private applyLookAtRotation() {
    const c = this.coordinator;
    const pivot = c.pivotAtDragStart;
    if (!this.lookAt.probeAndCollect(pivot)) return;
    const from = RotateMath.activeSnapshotRotation(c) ?? Tools.handleRotation;
    if (c.activeKind === DragKind.Trackball)
      GizmoHud.setAbsoluteDelta(TrackballHandle.rotationVector(this.lookAt.aimFree(pivot, from)));
    else {
      const axis = this.manual.axisDir;
      const angle = this.lookAt.aimAxis(pivot, from, axis);
      GizmoHud.setAbsoluteDelta(angle);
      // The ring's own arc is frozen while locked, so it is seeded with what look-at applied.
      const ring = this.activeRing();
      ring.seedManualOverlay(axis, ring.refDir, angle);
    }
    RotateMath.applyRotation(c, this.lookAt.rotation, pivot);
  }

  // Re-anchors the handle that owns the drag to the cursor, seeded with look-at's last result.
  private resumeNativeDrag() {
    const c = this.coordinator;
    if (c.activeKind === DragKind.Trackball) {
      if (this.lookAt.hasTarget) this.trackball.resumeNativeDrag(this.lookAt.rotation);
    } else if (c.activeKind === DragKind.Ring) {
      const ring = this.activeRing();
      ring.resumeNativeDrag(this.lookAt.hasTarget ? this.lookAt.angle : ring.appliedAngle);
      this.manual.forgetTrackedAxis();
    }
  }

  private drawPerObjectRotationAxisLines() {
    const c = this.coordinator;
    if (c.activeAxis === GizmoAxis.Screen || !IndividualOrigins.perObjectLines(c, this.numeric)) return;
    RotateMath.drawPerObjectAxisLines(c, IndividualOrigins.localAxes(c, this.numeric), this.manual.axisDir);
  }

  // Look-at draws to the real surface point; otherwise a dotted line to the cursor.
  private drawDragCursorLine(camera: SceneCamera) {
    const c = this.coordinator;
    if (this.lookAt.driving && this.lookAt.hasTarget)
      DrawOverlays.drawLookAtLine(
        c.pivotAtDragStart,
        this.lookAt.target,
        this.lookAt.normal,
        this.lookAt.contacts,
        this.lookAt.targetStale,
      );
    else DrawOverlays.drawCursorLineToGui(c.pivotAtDragStart, camera, c.wrap.virtualMousePosition);
  }
}
