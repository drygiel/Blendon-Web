// ScaleGizmo: Blendon's Scale tool (box-tipped axes, plane squares, uniform-scale rings).
import { EditorSnapSettings, PivotRotation, Tool, Tools } from '../../../unity/editor.ts';
import { HandleUtility, Handles, MouseCursor } from '../../../unity/handles.ts';
import { Event, EventType } from '../../../unity/imgui.ts';
import { Color, Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoColors } from '../colors.ts';
import { GizmoController, IndividualOrigins } from '../common/controller.ts';
import { AxisBasis, HandleLayout, ScreenRingCap } from '../common/layout.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { ModalNumericState } from '../core/numeric.ts';
import { AxisHandle, CubeAxisHead } from '../handles/axis-handle.ts';
import { FreeRingHandle } from '../handles/free-ring-handle.ts';
import { PlaneHandle } from '../handles/plane-handle.ts';
import { GizmoHud } from '../hud.ts';
import { DrawOverlays } from '../overlays.ts';
import { DrawPrimitives, GizmoRenderer, PlaneOffsetView } from '../rendering.ts';
import { SelectionPivot } from '../selection-pivot.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { ScaleDragOverlays, ScaleDragSession, ScaleMath } from './scale-parts.ts';
import { ScaleGizmoSettings } from './settings.ts';

// The applied ratio's magnitude: a mirrored scale keeps tracking instead of freezing at the floor.
const appliedRatio = () => Math.max(Math.abs(1 + GizmoHud.totalDelta.x), ScaleMath.MinRatio);

export class ScaleGizmo extends GizmoController {
  readonly settings: ScaleGizmoSettings;
  private readonly axisHandles: AxisHandle[];
  private readonly axisOrder = [0, 1, 2];
  private readonly planeHandles: PlaneHandle[];
  private readonly planeOrder = [0, 1, 2];
  private readonly screenRing: FreeRingHandle;
  private readonly session: ScaleDragSession;

  private static _instance: ScaleGizmo | null = null;
  static get instance() {
    if (!ScaleGizmo._instance) {
      ScaleGizmo._instance = new ScaleGizmo(new ScaleGizmoSettings(), new GizmoDragCoordinator());
      ScaleGizmo._instance.subscribeSceneGui();
    }
    return ScaleGizmo._instance;
  }

  constructor(settings: ScaleGizmoSettings, coordinator: GizmoDragCoordinator) {
    super(coordinator);
    this.settings = settings;
    this.session = new ScaleDragSession(coordinator, this.numeric);
    this.axisHandles = GizmoAxis.all.map((a) => new AxisHandle(a, CubeAxisHead, coordinator, DragKind.ScaleAxis));
    this.planeHandles = [GizmoAxis.Z, GizmoAxis.X, GizmoAxis.Y].map(
      (a) => new PlaneHandle(a, coordinator, DragKind.ScalePlane),
    );
    this.screenRing = new FreeRingHandle(coordinator, DragKind.ScaleRing);
    for (const a of this.axisHandles) this.wireAxis(a);
    this.wirePlane(this.planeHandles[0], GizmoAxis.X, GizmoAxis.Y);
    this.wirePlane(this.planeHandles[1], GizmoAxis.Y, GizmoAxis.Z);
    this.wirePlane(this.planeHandles[2], GizmoAxis.Z, GizmoAxis.X);
    this.screenRing.dragStarted.add(() => {
      GizmoHud.startFreeDrag(true);
      this.session.begin(this.coordinator.pivotAtDragStart, Vector3.zero);
      // A typed factor scales uniformly, as the ring itself does.
      this.numeric.beginMouseTransform(GizmoAxis.Screen);
    });
    this.screenRing.dragged.add(() => this.onDragged());
    this.screenRing.dragEnded.add(() => this.endDragSession());
    coordinator.onCancelled(() => this.endDragSession());
    this.numeric.onConfirm = () => {
      this.coordinator.forceRelease();
      this.endDragSession();
    };
    this.numeric.onCancel = () => this.coordinator.cancel();
    this.numeric.onConstraintChanged = () => this.handleNumericConstraintChanged();
    // The numeric session's Global/Local label follows the same forced-local rule as the gizmo.
    this.numeric.defaultSpaceIsLocal = () =>
      this.settings.AxisForceLocalOrientation || Tools.pivotRotation === PivotRotation.Local;
  }

  protected get toolType() {
    return Tool.Scale;
  }
  protected get enabled() {
    return this.settings.Enabled;
  }

  // The slider only drives hit-testing and ownership; scale comes from the cursor's distance ratio.
  private onDragged() {
    if (this.numeric.state === ModalNumericState.NumericInput) return;
    this.session.apply();
  }

  private wireAxis(axis: AxisHandle) {
    axis.dragStarted.add((dir) => {
      GizmoHud.startAxisDrag(axis.axis, dir, true);
      this.session.begin(this.coordinator.pivotAtDragStart, dir.normalized);
      this.numeric.beginMouseTransform(axis.axis);
    });
    axis.dragged.add(() => this.onDragged());
    axis.dragEnded.add(() => this.endDragSession());
  }

  private wirePlane(plane: PlaneHandle, axis1: GizmoAxis, axis2: GizmoAxis) {
    plane.dragStarted.add((dir1, dir2) => {
      GizmoHud.startPlaneDrag(axis1, dir1, axis2, dir2, true);
      this.session.begin(this.coordinator.pivotAtDragStart, Vector3.cross(dir1, dir2).normalized);
      this.numeric.beginMouseTransform(null, plane.axis === GizmoAxis.X ? GizmoAxis.Z : GizmoAxis.X);
    });
    plane.dragged.add(() => this.onDragged());
    plane.dragEnded.add(() => this.endDragSession());
  }

  private endDragSession() {
    GizmoHud.end();
    this.numeric.reset();
    this.session.endDrag();
  }

  private get ownDrag() {
    const k = this.coordinator.activeKind;
    return k === DragKind.ScaleAxis || k === DragKind.ScalePlane || k === DragKind.ScaleRing;
  }

  // The scale pivot is fixed for the whole drag.
  gizmoPosition() {
    return this.ownDrag
      ? this.coordinator.pivotAtDragStart
      : SelectionPivot.getPosition(SharedGizmoSettings.PivotPoint);
  }

  protected override localSpaceRotation() {
    return ScaleMath.objectRotation();
  }

  // Only Force Local Orientation overrides the handle rotation toggle; V never reorients the gizmo.
  protected override defaultSpaceRotation() {
    return this.settings.AxisForceLocalOrientation ? ScaleMath.objectRotation() : Tools.handleRotation;
  }

  drawHandles(sceneView: SceneView, isOwner: boolean) {
    const position = this.gizmoPosition();
    const rotation = this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit);
    const size = HandleUtility.getHandleSize(position) * SharedGizmoSettings.Size;
    const camera = sceneView.camera;
    const viewDir = GizmoRenderer.computeViewDir(position, camera);
    const c = this.coordinator;
    if (isOwner) c.updateActiveView(camera);
    const basis = new AxisBasis(rotation);
    const snap = EditorSnapSettings.scale;
    const ev = Event.current;
    if (isOwner && this.handleRmbCancelAndNumeric(ev, () => this.applyNumericScale())) return;
    const vertexMode = c.vertexModeActive;
    const s = this.settings;
    ScaleDragOverlays.draw(
      c,
      s,
      basis,
      size,
      snap,
      this.session.vertexDrag,
      this.session.ratioDelta,
      CubeAxisHead,
      IndividualOrigins.localAxes(c, this.numeric),
    );
    if (this.ownDrag && isOwner)
      DrawOverlays.drawCursorLineToGui(c.pivotAtDragStart, camera, c.wrap.virtualMousePosition);
    if (this.ownDrag) GizmoController.showDragCursor(sceneView, MouseCursor.ScaleArrow);
    if (!isOwner) return;
    HandleLayout.drawPlanesAndAxes(
      position,
      size,
      camera,
      basis,
      s.PlaneEnabled && !vertexMode,
      s.PlaneOffset,
      s.PlaneSize,
      this.planeHandles,
      this.planeOrder,
      this.axisOrder,
      c.activeKind === DragKind.None,
      PlaneOffsetView.viewDir(position, camera),
      (i, dir1, dir2, normal) => {
        const p = this.planeHandles[i];
        // The dragged square slides outward so it tracks the applied ratio.
        const extra =
          c.activeKind === DragKind.ScalePlane && c.activeAxis === p.axis
            ? s.PlaneOffset * size * this.session.ratioDelta
            : 0;
        p.draw(s, position, dir1, dir2, normal, size, new Vector2(snap, snap), viewDir, extra);
      },
      (i, dir) => {
        const a = this.axisHandles[i];
        const extra =
          c.activeKind === DragKind.ScaleAxis && c.activeAxis === a.axis
            ? s.AxisLength * size * this.session.ratioDelta
            : 0;
        // Zero length hides shaft and box instead of piling three cubes on the pivot.
        a.draw(s, position, dir, size, s.AxisOffset, snap, viewDir, extra, s.AxisLength <= 0);
      },
    );
    const snap3 = new Vector3(snap, snap, snap);
    // Vertex mode replaces the ring with the square snap handle, as on the Move tool.
    if (vertexMode) this.screenRing.draw(position, size, snap3, this.squareCap);
    else if (s.ScreenRingEnabled)
      this.screenRing.draw(position, size, snap3, (id, pos, _r, sz, type) => this.ringCap(id, pos, rotation, sz, type));
  }

  private applyNumericScale() {
    this.session.applyNumeric(
      this.numeric,
      this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit),
    );
  }

  private handleNumericConstraintChanged() {
    const [kind, axis] = this.numeric.resolveDragTarget();
    this.coordinator.retarget(kind === DragKind.Axis ? DragKind.ScaleAxis : DragKind.ScalePlane, axis);
    const basis = new AxisBasis(this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit));
    if (kind === DragKind.Axis) {
      const dir = basis.dir(axis);
      this.session.retarget(dir.normalized);
      GizmoHud.startAxisDrag(axis, dir, true);
    } else {
      const [dir1, dir2] = basis.planeDirs(axis);
      const [axis1, axis2] = AxisBasis.planeAxes(axis);
      this.session.retarget(Vector3.cross(dir1, dir2).normalized);
      GizmoHud.startPlaneDrag(axis1, dir1, axis2, dir2, true);
    }
    this.session.apply();
  }

  private static applyCapColor(active: boolean, hover: boolean, idle: Color) {
    Handles.color = active ? GizmoColors.CenterDotActive : hover ? GizmoColors.CenterDotHover : idle;
  }

  // Zero inner radius swaps the circle for a lit box; zero outer radius drops the outer ring.
  private ringCap(controlId: number, position: Vector3, rotation: Quaternion, size: number, eventType: EventType) {
    const s = this.settings;
    const shared = SharedGizmoSettings;
    const normal = ScreenRingCap.facingNormal(this.coordinator, DragKind.ScaleRing);
    const inner = size * s.ScreenRingRadius;
    const outer = size * s.OuterScreenRingRadius;
    const box = size * s.AxisHeadSize;
    const boxMode = s.ScreenRingRadius <= 0;
    const showOuter = s.OuterRingInteractive && s.OuterScreenRingRadius > 0;
    switch (eventType) {
      case EventType.Repaint: {
        const { active, hover, visible } = ScreenRingCap.state(this.coordinator, DragKind.ScaleRing, controlId);
        if (!visible) return;
        ScaleGizmo.applyCapColor(active, hover, s.ScreenRingColor);
        if (active) {
          // The inner ring follows the applied ratio.
          if (boxMode) Handles.cubeHandleCap(controlId, position, rotation, box * appliedRatio(), eventType);
          else DrawPrimitives.drawAACircle(position, normal, inner * appliedRatio(), shared.ScreenRingThickness);
        } else {
          if (showOuter) DrawPrimitives.drawAACircle(position, normal, outer, shared.ScreenRingThickness);
          if (boxMode) Handles.cubeHandleCap(controlId, position, rotation, box * 1.5, eventType);
          else DrawPrimitives.drawAACircle(position, normal, inner, shared.ScreenRingThickness);
        }
        break;
      }
      case EventType.Layout:
      case EventType.MouseMove:
        if (showOuter) {
          // DistanceToCircle is 0 inside too, so the outer line distance is measured explicitly.
          const center = HandleUtility.worldToGUIPoint(position);
          const right = GizmoRenderer.currentCamera()?.right ?? Vector3.right;
          const outerPx = Vector2.distance(center, HandleUtility.worldToGUIPoint(position.add(right.mul(outer))));
          const cursor = Vector2.distance(Event.current.mousePosition, center);
          HandleUtility.addControl(controlId, Math.abs(cursor - outerPx));
          // Inside the outer ring it is the 5 px default that only a direct axis/plane hover beats.
          if (cursor < outerPx) HandleUtility.addControl(controlId, 5);
        }
        if (boxMode) Handles.cubeHandleCap(controlId, position, rotation, box, eventType);
        else ScreenRingCap.hitTestCircle(controlId, position, inner);
        break;
    }
  }

  // The vertex-snapping stand-in: a square whose inside hit-tests as distance 0.
  private readonly squareCap = (
    controlId: number,
    position: Vector3,
    _r: Quaternion,
    size: number,
    eventType: EventType,
  ) => {
    const normal = ScreenRingCap.facingNormal(this.coordinator, DragKind.ScaleRing);
    let half = size * this.settings.ScreenRingRadius;
    if (eventType === EventType.Repaint) {
      const { active, hover, visible } = ScreenRingCap.state(this.coordinator, DragKind.ScaleRing, controlId);
      if (!visible) return;
      ScaleGizmo.applyCapColor(active, hover, GizmoColors.ScreenRing);
      if (active) half *= appliedRatio();
      DrawPrimitives.drawScreenSquare(position, normal, half, SharedGizmoSettings.ScreenRingThickness);
    } else if (eventType === EventType.Layout || eventType === EventType.MouseMove)
      ScreenRingCap.hitTestSquare(controlId, position, normal, half);
  };
}
