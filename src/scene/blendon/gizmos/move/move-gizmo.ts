// MoveGizmo: Blendon's Move tool handles (arrows, plane squares, screen ring).
import { Selection, Tool, Tools } from '../../../unity/editor.ts';
import { HandleUtility, Handles, MouseCursor } from '../../../unity/handles.ts';
import { Event, EventType } from '../../../unity/imgui.ts';
import { Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoColors } from '../colors.ts';
import { GizmoController, IndividualOrigins } from '../common/controller.ts';
import { AxisBasis, HandleLayout, ScreenRingCap } from '../common/layout.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { MoveSnap } from '../core/move-snap.ts';
import { ModalNumericState } from '../core/numeric.ts';
import { AxisHandle, ConeAxisHead } from '../handles/axis-handle.ts';
import { FreeRingHandle } from '../handles/free-ring-handle.ts';
import { PlaneHandle } from '../handles/plane-handle.ts';
import { GizmoHud } from '../hud.ts';
import { GizmoRenderer, PlaneOffsetView } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import {
  MoveDragOverlays,
  MoveDragTarget,
  MoveManualConstraint,
  MoveSurfaceSnap,
  dragFollowPosition,
} from './move-parts.ts';
import { MoveGizmoSettings } from './settings.ts';

export class MoveGizmo extends GizmoController {
  readonly settings: MoveGizmoSettings;
  private readonly axisHandles: AxisHandle[];
  // Depth-sorted while idle, frozen for the drag: control ids are positional.
  private readonly axisOrder = [0, 1, 2];
  private readonly planeOrder = [0, 1, 2];
  private readonly manual: MoveManualConstraint;
  /** Normals Z (XY), X (YZ), Y (ZX). */
  private readonly planeHandles: PlaneHandle[];
  private readonly screenRing: FreeRingHandle;
  private readonly surface: MoveSurfaceSnap;
  private readonly target = new MoveDragTarget();
  private surfaceArmedThisDraw = false;
  // V latched for the whole drag: flipping it live would change the layout under the active id.
  private vertexDrag = false;
  private ringHidden = false;

  private static _instance: MoveGizmo | null = null;
  /** The standalone Move tool, driving itself from duringSceneGui. */
  static get instance() {
    if (!MoveGizmo._instance) {
      MoveGizmo._instance = new MoveGizmo(new MoveGizmoSettings(), new GizmoDragCoordinator());
      MoveGizmo._instance.subscribeSceneGui();
    }
    return MoveGizmo._instance;
  }

  /** Also the Transform gizmo's move part, with injected settings and a shared coordinator. */
  constructor(settings: MoveGizmoSettings, coordinator: GizmoDragCoordinator) {
    super(coordinator);
    this.settings = settings;
    this.surface = new MoveSurfaceSnap(coordinator, this.target);
    this.manual = new MoveManualConstraint(coordinator, this.target, this.surface, this.numeric);
    this.axisHandles = GizmoAxis.all.map((a) => new AxisHandle(a, ConeAxisHead, coordinator));
    this.planeHandles = [GizmoAxis.Z, GizmoAxis.X, GizmoAxis.Y].map((a) => new PlaneHandle(a, coordinator));
    this.screenRing = new FreeRingHandle(coordinator, DragKind.FreeRing);
    for (const a of this.axisHandles) this.wireAxis(a);
    this.wirePlane(this.planeHandles[0], GizmoAxis.X, GizmoAxis.Y);
    this.wirePlane(this.planeHandles[1], GizmoAxis.Y, GizmoAxis.Z);
    this.wirePlane(this.planeHandles[2], GizmoAxis.Z, GizmoAxis.X);
    this.screenRing.dragStarted.add(() => {
      this.vertexDrag = VertexSnappingUtility.isActive;
      GizmoHud.startFreeDrag();
      this.numeric.beginMouseTransform(null);
      this.manual.onDragStart();
    });
    this.screenRing.dragged.add((d) => this.onHandleDragged(d));
    this.screenRing.dragEnded.add(() => this.endDragSession());
    coordinator.onCancelled(() => this.endDragSession());
    this.numeric.onConfirm = () => {
      this.coordinator.forceRelease();
      this.endDragSession();
    };
    this.numeric.onCancel = () => this.coordinator.cancel();
    this.numeric.onConstraintChanged = () =>
      this.manual.handleConstraintChanged(
        this.numeric,
        new AxisBasis(this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit)),
      );
  }

  get surfaceSnapArmed() {
    return this.surface.held;
  }
  protected get toolType() {
    return Tool.Move;
  }
  protected get enabled() {
    return this.settings.Enabled;
  }
  protected override get altArmed() {
    return this.surface.held;
  }

  private onHandleDragged(delta: Vector3) {
    if (this.numeric.state === ModalNumericState.NumericInput || this.manual.active || this.surface.driving) return;
    this.applyDelta(delta);
  }

  private wireAxis(axis: AxisHandle) {
    axis.dragStarted.add((dir) => {
      this.target.axisDir = dir;
      this.target.axisId = axis.axis;
      this.vertexDrag = VertexSnappingUtility.isActive;
      GizmoHud.startAxisDrag(axis.axis, dir);
      this.numeric.beginMouseTransform(axis.axis);
      this.manual.onDragStart();
    });
    axis.dragged.add((d) => this.onHandleDragged(d));
    axis.dragEnded.add(() => this.endDragSession());
  }

  private wirePlane(plane: PlaneHandle, axis1: GizmoAxis, axis2: GizmoAxis) {
    plane.dragStarted.add((dir1, dir2) => {
      const t = this.target;
      t.planeDir1 = dir1;
      t.planeDir2 = dir2;
      t.planeAxis1 = axis1;
      t.planeAxis2 = axis2;
      this.vertexDrag = VertexSnappingUtility.isActive;
      GizmoHud.startPlaneDrag(axis1, dir1, axis2, dir2);
      // X is excluded from the YZ plane, so typed digits default to an axis the plane spans.
      this.numeric.beginMouseTransform(null, plane.axis === GizmoAxis.X ? GizmoAxis.Z : GizmoAxis.X);
      this.manual.onDragStart();
    });
    plane.dragged.add((d) => this.onHandleDragged(d));
    plane.dragEnded.add(() => this.endDragSession());
  }

  private endDragSession() {
    GizmoHud.end();
    this.numeric.reset();
    this.manual.deactivate();
    this.vertexDrag = false;
    this.surface.reset();
  }

  gizmoPosition() {
    return dragFollowPosition(this.coordinator);
  }

  protected override localSpaceRotation() {
    return Selection.activeTransform ? Selection.activeTransform.rotation : Tools.handleRotation;
  }

  drawHandles(sceneView: SceneView, isOwner: boolean, hidden = false) {
    const position = this.gizmoPosition();
    // Follows the parser's space, so a mid-drag X X visibly reorients the gizmo.
    const rotation = this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit);
    const size = HandleUtility.getHandleSize(position) * SharedGizmoSettings.Size;
    const camera = sceneView.camera;
    const viewDir = GizmoRenderer.computeViewDir(position, camera);
    if (isOwner) this.coordinator.updateActiveView(camera);
    const basis = new AxisBasis(rotation);
    const ev = Event.current;
    const s = this.settings;
    // Before the lattice is read: surface snapping stands the vertex pull down.
    if (!hidden && isOwner)
      this.surface.update(
        sceneView,
        ev,
        s.SurfaceSnapEnabled,
        s.SurfaceSnapModifier,
        this.numeric.state === ModalNumericState.NumericInput,
      );
    // One lattice per pass, so the ticks drawn and the points landed on never disagree.
    const moveSnap = MoveSnap.current(this.coordinator.pivotAtDragStart, rotation);
    this.manual.snap = moveSnap;
    if (!hidden && isOwner) {
      if (this.handleRmbCancelAndNumeric(ev, () => this.applyNumericDelta())) return;
      if (
        this.manual.active &&
        this.numeric.state === ModalNumericState.MouseTransforming &&
        ev.type === EventType.MouseDrag
      )
        this.manual.applyManualDrag();
    }
    const vertexMode = this.coordinator.vertexModeActive;
    this.surfaceArmedThisDraw = !hidden && this.surface.held && this.coordinator.activeKind === DragKind.None;
    const k = this.coordinator.activeKind;
    if (!hidden) {
      MoveDragOverlays.draw(
        this.coordinator,
        s,
        basis,
        this.target,
        this.surface,
        this.vertexDrag,
        moveSnap,
        position,
        ConeAxisHead,
        IndividualOrigins.localAxes(this.coordinator, this.numeric),
        false,
      );
      if (k === DragKind.Axis || k === DragKind.Plane || k === DragKind.FreeRing)
        GizmoController.showDragCursor(sceneView, MouseCursor.MoveArrow);
    }
    if (isOwner) {
      HandleLayout.drawPlanesAndAxes(
        position,
        size,
        camera,
        basis,
        s.PlaneEnabled,
        s.PlaneOffset,
        s.PlaneSize,
        this.planeHandles,
        this.planeOrder,
        this.axisOrder,
        this.coordinator.activeKind === DragKind.None,
        PlaneOffsetView.viewDir(position, camera),
        (i, dir1, dir2, normal) =>
          this.planeHandles[i].draw(s, position, dir1, dir2, normal, size, Vector2.zero, viewDir, 0, hidden, moveSnap),
        (i, dir) => this.axisHandles[i].draw(s, position, dir, size, s.AxisOffset, 0, viewDir, 0, hidden, moveSnap),
      );
      // Surface snapping forces the ring on, and a ring drag it started keeps it for its id's sake.
      const drawRing =
        s.ScreenRingEnabled || this.surfaceArmedThisDraw || this.coordinator.activeKind === DragKind.FreeRing;
      if (vertexMode) this.drawScreen(position, size, moveSnap, hidden, true);
      else if (drawRing) this.drawScreen(position, size, moveSnap, hidden, false);
    }
  }

  private applyDelta(delta: Vector3) {
    if (delta.equals(Vector3.zero)) return;
    GizmoHud.accumulateDelta(delta);
    const { transforms, snapshots } = this.coordinator.snapshot;
    if (!transforms.length) return;
    this.coordinator.snapshot.record('Move');
    const k = this.coordinator.activeKind;
    if (IndividualOrigins.localAxes(this.coordinator, this.numeric) && (k === DragKind.Axis || k === DragKind.Plane)) {
      const local = this.localDeltaComponents(delta);
      transforms.forEach((t, i) => (t.position = t.position.add(snapshots[i].rotation.mulV(local))));
      return;
    }
    for (const t of transforms) t.position = t.position.add(delta);
  }

  // The shared world delta in the drag's own constraint axes, rebuilt in identity-local space.
  private localDeltaComponents(delta: Vector3) {
    const t = this.target;
    if (this.coordinator.activeKind === DragKind.Axis) return t.axisId.unit.mul(Vector3.dot(delta, t.axisDir));
    return t.planeAxis1.unit
      .mul(Vector3.dot(delta, t.planeDir1))
      .add(t.planeAxis2.unit.mul(Vector3.dot(delta, t.planeDir2)));
  }

  private applyNumericDelta() {
    this.manual.applyNumericDelta(
      this.numeric,
      this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit),
    );
  }

  // The ring and its vertex-mode square share one FreeRingHandle; only the cap differs.
  private drawScreen(position: Vector3, size: number, moveSnap: MoveSnap, hidden: boolean, square: boolean) {
    this.ringHidden = hidden;
    this.screenRing.draw(position, size, Vector3.zero, square ? this.squareCap : this.ringCap, moveSnap);
  }

  private readonly ringCap = (id: number, position: Vector3, _r: Quaternion, size: number, type: EventType) =>
    this.drawScreenCap(id, position, size, type, false);
  private readonly squareCap = (id: number, position: Vector3, _r: Quaternion, size: number, type: EventType) =>
    this.drawScreenCap(id, position, size, type, true);

  private drawScreenCap(controlId: number, position: Vector3, size: number, eventType: EventType, square: boolean) {
    // The native handle and its id still run while hidden, so downstream ids never shift.
    if (this.ringHidden) return;
    const normal = ScreenRingCap.facingNormal(this.coordinator, DragKind.FreeRing);
    const radius = size * this.settings.ScreenRingRadius;
    const shared = SharedGizmoSettings;
    switch (eventType) {
      case EventType.Repaint: {
        // While surface snap drives, the object flies to the cursor's surface point without its ring.
        if (this.surface.driving) break;
        const { active, hover, visible } = ScreenRingCap.state(this.coordinator, DragKind.FreeRing, controlId);
        if (!visible) return;
        // Armed surface snap reads as active: the ring is the thing to grab.
        Handles.color =
          active || this.surfaceArmedThisDraw
            ? GizmoColors.ScreenRingActive
            : hover
              ? GizmoColors.ScreenRingHover
              : GizmoColors.ScreenRing;
        const thickness =
          hover && this.surfaceArmedThisDraw
            ? shared.ScreenRingThicknessHover + 1.2
            : hover || this.surfaceArmedThisDraw
              ? shared.ScreenRingThicknessHover
              : shared.ScreenRingThickness;
        ScreenRingCap.drawShape(position, normal, radius, thickness, square);
        break;
      }
      case EventType.Layout:
      case EventType.MouseMove:
        // The square's inside is distance 0, so grabbing anywhere in it starts the snap drag.
        if (square) ScreenRingCap.hitTestSquare(controlId, position, normal, radius);
        else ScreenRingCap.hitTestCircle(controlId, position, radius);
        break;
    }
  }
}
