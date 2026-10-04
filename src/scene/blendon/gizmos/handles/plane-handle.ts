// PlaneHandle: one plane square of the Move/Scale gizmo, dragging across two axes at once.
import { EditorSnapSettings } from '../../../unity/editor.ts';
import { EditorGUI, HandleUtility, Handles } from '../../../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility } from '../../../unity/imgui.ts';
import { Mathf, Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import { SceneTutorial, SelectionCache } from '../../foundation.ts';
import type { GizmoAxis } from '../axis.ts';
import { MinVisibleFade } from '../colors.ts';
import type { GizmoSettings } from '../common/gizmo-settings.ts';
import { AxisBasis } from '../common/layout.ts';
import { Signal } from '../common/signal.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { MoveSnap } from '../core/move-snap.ts';
import { ModalNumericParser } from '../core/numeric.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import { DrawOverlays } from '../overlays.ts';
import { DrawPrimitives, GizmoRenderer, PlaneOffsetView } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import { PlaneGeometry } from './plane-geometry.ts';
import { AxisHandle } from './axis-handle.ts';
import { VertexGrab } from './vertex-grab.ts';

export class PlaneHandle {
  readonly axis: GizmoAxis;
  private readonly coordinator: GizmoDragCoordinator;
  private readonly kind: DragKind;
  private readonly vertexGrab = new VertexGrab();
  private hasSnapVertex = false;
  private snapVertex = Vector3.zero;
  private dir1 = Vector3.zero;
  private dir2 = Vector3.zero;
  private dragDir1 = Vector3.zero;
  private dragDir2 = Vector3.zero;
  private dragPivot = Vector3.zero;
  private fade = 1;
  // Unsnapped offsets along the plane axes, advanced by precision-scaled increments of the reading.
  private freeA = 0;
  private freeB = 0;
  private readA = 0;
  private readB = 0;
  private hidden = false;
  private lastCapPosition = Vector3.zero;
  private lastPrecision = 1;
  private lastControlId = 0;
  private lastSize = 0;
  private lastVisible = false;
  private normal = Vector3.zero;
  // Which corner is nearest the gizmo centre decides where a triangle puts its right angle.
  private pivot = Vector3.zero;
  private settings!: GizmoSettings;
  private target = Vector3.zero;

  readonly dragStarted = new Signal<[Vector3, Vector3]>();
  readonly dragged = new Signal<[Vector3]>();
  readonly dragEnded = new Signal();

  constructor(axis: GizmoAxis, coordinator: GizmoDragCoordinator, kind: DragKind = DragKind.Plane) {
    this.axis = axis;
    this.coordinator = coordinator;
    this.kind = kind;
  }

  draw(
    settings: GizmoSettings,
    position: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    normal: Vector3,
    size: number,
    snap: Vector2,
    viewDir: Vector3,
    extraHandleOffset = 0,
    hidden = false,
    moveSnap: MoveSnap = MoveSnap.none,
  ): Vector3 {
    const id = GUIUtility.getControlID(FocusType.Passive);
    const dragging = GUIUtility.hotControl === id;
    const fade = dragging ? 1 : GizmoRenderer.planeFade(normal, viewDir, SharedGizmoSettings.ThresholdDegrees);
    if (fade < MinVisibleFade) {
      this.lastVisible = false;
      return Vector3.zero;
    }
    this.settings = settings;
    this.dir1 = dir1;
    this.dir2 = dir2;
    this.normal = normal;
    this.pivot = position;
    this.fade = fade;
    this.hidden = hidden;
    const handlePos = PlaneHandle.getHandlePos(
      settings,
      position,
      dir1,
      dir2,
      this.clampViewDir(position),
      size,
      extraHandleOffset,
    );
    this.lastControlId = id;
    this.lastCapPosition = handlePos;
    this.lastSize = size * settings.PlaneSize;
    this.lastVisible = !hidden;
    const snapshot = this.coordinator.snapshot;
    const wasActive = snapshot.activeDragId === id;
    const dragEvent = Event.current.type === EventType.MouseDrag;
    EditorGUI.beginChangeCheck();
    const suppressedAlt = GizmoRenderer.beginAltGrabOverride(id);
    const raw = Handles.slider2D(id, handlePos, normal, dir1, dir2, size * settings.PlaneSize, this.capFunction, snap);
    GizmoRenderer.endAltGrabOverride(suppressedAlt);
    const changed = EditorGUI.endChangeCheck();
    // Slider2D's own hit fails past the vanishing line; the drag frame is the real signal.
    const moved = changed || (dragEvent && GUIUtility.hotControl === id);
    const snapping = moveSnap.valid ? moveSnap.active : EditorSnapSettings.snapEnabled;
    const precision =
      SharedGizmoSettings.PrecisionHeld && !moveSnap.pickDriven && (moveSnap.valid || !snapping)
        ? SharedGizmoSettings.EffectivePrecisionFactor
        : 1;
    if (moved && GUIUtility.hotControl === id) {
      SceneTutorial.report('HandlePlaneDrag');
      SceneTutorial.noteDragModifiers(snapping, SharedGizmoSettings.PrecisionHeld);
    }
    let target = raw;
    if (moveSnap.valid && GUIUtility.hotControl === id) {
      if (!wasActive) this.target = position;
      else {
        if (!Mathf.Approximately(precision, this.lastPrecision)) this.rebaseGrip();
        if (moved) {
          const vertex =
            VertexSnappingUtility.snapsToTarget &&
            !ModalNumericParser.anyNumericInput &&
            this.kind !== DragKind.ScalePlane
              ? VertexSnappingUtility.tryGetNearestOtherVertex()
              : null;
          if (vertex) {
            this.snapVertex = vertex;
            this.hasSnapVertex = true;
            const carried = this.vertexGrab.track(
              position,
              SelectionCache.deep,
              this.coordinator.wrap.projectionMousePosition,
              this.coordinator.vertexSnapAtDragStart,
            );
            const [axis1, axis2] = AxisBasis.planeAxes(this.axis);
            [this.freeA, this.freeB] = VertexGrab.distancesAcrossPlane(
              vertex.sub(carried).sub(this.dragPivot),
              this.dragDir1,
              this.dragDir2,
              axis1,
              axis2,
            );
            const r = this.tryPlaneTranslation();
            if (r) [this.readA, this.readB] = r;
            this.target = this.dragPivot.add(this.dragDir1.mul(this.freeA)).add(this.dragDir2.mul(this.freeB));
            snapshot.rebaseRaw(position);
          } else {
            this.hasSnapVertex = false;
            const r = this.tryPlaneTranslation();
            if (r) {
              this.freeA += (r[0] - this.readA) * precision;
              this.freeB += (r[1] - this.readB) * precision;
              [this.readA, this.readB] = r;
              const [a, b] = moveSnap.snapPlane(this.dragPivot, this.dragDir1, this.dragDir2, this.freeA, this.freeB);
              this.target = this.dragPivot.add(this.dragDir1.mul(a)).add(this.dragDir2.mul(b));
            }
          }
        }
      }
      this.lastPrecision = precision;
      target = this.target;
    }
    if (
      dragging &&
      this.hasSnapVertex &&
      VertexSnappingUtility.snapsToTarget &&
      !ModalNumericParser.anyNumericInput &&
      Event.current.type === EventType.Repaint &&
      (this.coordinator.activeKind === DragKind.Axis || this.coordinator.activeKind === DragKind.Plane)
    )
      DrawOverlays.drawAxisAlignedConnector(position, this.snapVertex);
    const delta = snapshot.preciseDelta(id, target, moved, moveSnap.valid ? 1 : precision);
    if (!wasActive && snapshot.activeDragId === id) {
      this.coordinator.begin(this.kind, position, this.axis);
      this.dragPivot = position;
      this.dragDir1 = dir1;
      this.dragDir2 = dir2;
      this.freeA = this.freeB = 0;
      this.target = position;
      this.hasSnapVertex = false;
      this.lastPrecision = precision;
      this.vertexGrab.release();
      this.readA = this.readB = 0;
      this.dragStarted.invoke(dir1, dir2);
    }
    if (wasActive && snapshot.activeDragId !== id) {
      this.coordinator.end();
      this.dragEnded.invoke();
      this.coordinator.clickGate.endHandleDrag(() => snapshot.cancel());
    }
    if (GUIUtility.hotControl === id && moved) this.dragged.invoke(delta);
    return delta;
  }

  private tryPlaneTranslation(): [number, number] | null {
    const targetScreen = this.coordinator.wrap.virtualMousePosition.add(this.coordinator.screenGrip);
    // The drag-start pivot, so the result depends on the cursor and not the path to it.
    const referenceScreen = HandleUtility.worldToGUIPoint(this.dragPivot);
    return ScreenDragSolver.trySolvePlane(this.dragPivot, this.dragDir1, this.dragDir2, referenceScreen, targetScreen);
  }

  private rebaseGrip() {
    if (this.coordinator.retargeted) return;
    this.coordinator.rebaseScreenGrip(
      this.dragPivot.add(this.dragDir1.mul(this.freeA)).add(this.dragDir2.mul(this.freeB)),
    );
    this.readA = this.freeA;
    this.readB = this.freeB;
  }

  /** Planes draw under the arrows but must still win a press inside their own shape. */
  reassertHitPriority() {
    if (!this.lastVisible) return;
    const t = Event.current.type;
    if (t !== EventType.Layout && t !== EventType.MouseMove) return;
    HandleUtility.addControl(
      this.lastControlId,
      PlaneGeometry.distance(
        this.settings.PlaneShape,
        this.pivot,
        this.lastCapPosition,
        this.dir1,
        this.dir2,
        this.normal,
        this.lastSize,
      ),
    );
  }

  // Frozen to the drag-start view during any drag; idle, held for the length of a navigation gesture.
  private clampViewDir(position: Vector3) {
    return this.coordinator.activeKind !== DragKind.None
      ? this.coordinator.viewDirAtDragStart
      : PlaneOffsetView.viewDir(position, GizmoRenderer.currentCamera());
  }

  static getHandlePos(
    settings: GizmoSettings,
    position: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    viewDir: Vector3,
    size: number,
    extraHandleOffset: number,
  ) {
    const handlePos = GizmoRenderer.clampPlaneOffset(
      position,
      dir1,
      dir2,
      viewDir,
      size,
      settings.PlaneOffset,
      settings.PlaneSize,
    );
    // Added after the clamp so it grows freely from the clamped base.
    return handlePos.add(dir1.add(dir2).mul(extraHandleOffset));
  }

  drawMirrored(
    settings: GizmoSettings,
    position: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    normal: Vector3,
    _viewDir: Vector3,
    size: number,
    extraHandleOffset = 0,
  ) {
    if (Event.current.type !== EventType.Repaint) return;
    if (this.coordinator.activeKind !== this.kind || this.coordinator.activeAxis !== this.axis) return;
    this.drawRepaintOnly(
      settings,
      position,
      dir1,
      dir2,
      normal,
      this.clampViewDir(position),
      size,
      extraHandleOffset,
      0,
      1,
    );
  }

  drawStatic(
    settings: GizmoSettings,
    position: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    normal: Vector3,
    size: number,
    viewDir: Vector3,
  ) {
    if (Event.current.type !== EventType.Repaint) return;
    const fade = GizmoRenderer.planeFade(normal, viewDir, SharedGizmoSettings.ThresholdDegrees);
    if (fade < MinVisibleFade) return;
    this.drawRepaintOnly(settings, position, dir1, dir2, normal, viewDir, size, 0, AxisHandle.NoControl, fade);
  }

  private drawRepaintOnly(
    settings: GizmoSettings,
    position: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    normal: Vector3,
    clampViewDir: Vector3,
    size: number,
    extraHandleOffset: number,
    controlId: number,
    fade: number,
  ) {
    this.settings = settings;
    this.dir1 = dir1;
    this.dir2 = dir2;
    this.normal = normal;
    this.pivot = position;
    this.fade = fade;
    this.hidden = false;
    const handlePos = PlaneHandle.getHandlePos(settings, position, dir1, dir2, clampViewDir, size, extraHandleOffset);
    this.capFunction(
      controlId,
      handlePos,
      Quaternion.lookRotation(normal, dir2),
      size * settings.PlaneSize,
      EventType.Repaint,
    );
  }

  private readonly capFunction = (
    controlId: number,
    capPosition: Vector3,
    _rotation: Quaternion,
    size: number,
    eventType: EventType,
  ) => {
    if (this.hidden) return;
    switch (eventType) {
      case EventType.Repaint: {
        const corners = PlaneGeometry.corners(
          this.settings.PlaneShape,
          this.pivot,
          capPosition,
          this.dir1,
          this.dir2,
          size,
        );
        const c = this.coordinator;
        const isDragged = c.activeKind === this.kind && c.activeAxis === this.axis;
        if (c.activeKind !== DragKind.None && !isDragged) return;
        const hover = !isDragged && GUIUtility.hotControl === 0 && HandleUtility.nearestControl === controlId;
        const baseColor = isDragged ? this.axis.active : hover ? this.axis.hover : this.axis.color;
        DrawPrimitives.drawPlaneShape(
          corners,
          corners.length,
          baseColor,
          this.fade,
          this.settings.PlaneOutlineThickness,
          isDragged,
        );
        break;
      }
      case EventType.Layout:
      case EventType.MouseMove:
        HandleUtility.addControl(
          controlId,
          PlaneGeometry.distance(
            this.settings.PlaneShape,
            this.pivot,
            capPosition,
            this.dir1,
            this.dir2,
            this.normal,
            size,
          ),
        );
        break;
    }
  };
}
