// What Move's gizmo and grab share: the drag target, surface snap, the X/Y/Z re-pointed drag and the overlays.
import { Selection } from '../../../unity/editor.ts';
import { HandleUtility, Handles } from '../../../unity/handles.ts';
import { Event, EventType } from '../../../unity/imgui.ts';
import { Mathf, Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import { withFade } from '../../color.ts';
import { SceneTutorial, SelectionCache, type ModifierKey } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoColors } from '../colors.ts';
import { AimMode, SurfaceSnapping } from '../common/aim-mode.ts';
import { IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { MoveSnap } from '../core/move-snap.ts';
import { ModalNumericParser } from '../core/numeric.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import type { AxisHeadStyle } from '../handles/axis-handle.ts';
import { VertexGrab } from '../handles/vertex-grab.ts';
import { GizmoHud } from '../hud.ts';
import { DrawGhosts, DrawOverlays } from '../overlays.ts';
import { DrawPrimitives } from '../rendering.ts';
import { SelectionPivot } from '../selection-pivot.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import type { MoveGizmoSettings } from './settings.ts';

export class MoveDragTarget {
  axisDir = Vector3.zero;
  axisId = GizmoAxis.X;
  /** Which lattice component each plane dir snaps against. */
  planeAxis1 = GizmoAxis.X;
  planeAxis2 = GizmoAxis.Y;
  planeDir1 = Vector3.zero;
  planeDir2 = Vector3.zero;
}

/** Where the gizmo stands: on the selection's live position while one of Move's drags runs. */
export function dragFollowPosition(coordinator: GizmoDragCoordinator): Vector3 {
  const k = coordinator.activeKind;
  if (k !== DragKind.Axis && k !== DragKind.Plane && k !== DragKind.FreeRing)
    return SelectionPivot.getPosition(SharedGizmoSettings.PivotPoint);
  const { transforms, snapshots } = coordinator.snapshot;
  const active = Selection.activeTransform;
  for (let i = 0; i < transforms.length; i++)
    if (transforms[i] === active)
      return coordinator.pivotAtDragStart.add(transforms[i].position.sub(snapshots[i].position));
  if (transforms.length) return coordinator.pivotAtDragStart.add(transforms[0].position.sub(snapshots[0].position));
  return coordinator.pivotAtDragStart;
}

export class MoveSurfaceSnap {
  private readonly aim = new AimMode();
  private readonly coordinator: GizmoDragCoordinator;
  private readonly target: MoveDragTarget;

  constructor(coordinator: GizmoDragCoordinator, target: MoveDragTarget) {
    this.coordinator = coordinator;
    this.target = target;
  }

  get held() {
    return this.aim.held;
  }
  get driving() {
    return this.aim.driving;
  }
  get hasTarget() {
    return this.aim.hasTarget;
  }
  get surfacePoint() {
    return this.aim.target;
  }
  get surfaceNormal() {
    return this.aim.normal;
  }

  update(sceneView: SceneView, ev: Event, enabled: boolean, modifier: ModifierKey, numericLive: boolean) {
    // Typed digits own the position outright while live.
    const k = this.coordinator.activeKind;
    const canDrive = !numericLive && (k === DragKind.Axis || k === DragKind.Plane || k === DragKind.FreeRing);
    this.aim.update(sceneView, ev, enabled, modifier, canDrive, () => this.apply());
    // The surface and the vertex under the cursor answer the same question; one stands down for the other.
    VertexSnappingUtility.suspendForSurfaceSnap(this, this.aim.driving);
  }

  reset() {
    this.aim.reset();
    VertexSnappingUtility.suspendForSurfaceSnap(this, false);
  }

  // The ring lands the pivot on the point; an axis or plane drag closes only what its constraint can reach.
  private apply() {
    this.aim.probe(Event.current.mousePosition, this.coordinator.snapshot.transforms);
    if (!this.aim.hasTarget) return;
    SceneTutorial.report('SurfaceSnap');
    const { transforms, snapshots } = this.coordinator.snapshot;
    if (!transforms.length) return;
    let delta = SurfaceSnapping.delta(this.coordinator.pivotAtDragStart, this.aim.target);
    if (this.coordinator.activeKind === DragKind.Axis)
      delta = SurfaceSnapping.projectOnAxis(delta, this.target.axisDir);
    else if (this.coordinator.activeKind === DragKind.Plane)
      delta = SurfaceSnapping.projectOnPlane(delta, this.target.planeDir1, this.target.planeDir2);
    this.coordinator.snapshot.record('Move');
    transforms.forEach((t, i) => (t.position = snapshots[i].position.add(delta)));
    GizmoHud.setAbsoluteDelta(delta);
  }
}

/** A drag re-pointed by X/Y/Z: the handle still holds hotControl, this computes where the selection goes. */
export class MoveManualConstraint {
  private readonly coordinator: GizmoDragCoordinator;
  private readonly numeric: ModalNumericParser;
  private readonly surface: MoveSurfaceSnap;
  private readonly target: MoveDragTarget;
  private readonly vertexGrab = new VertexGrab();
  private readA = 0;
  private readB = 0;
  private readDistance = 0;
  private freeA = 0;
  private freeB = 0;
  private freeDistance = 0;
  // A switch takes total travel since the drag start, as in Blender; later frames advance step by step.
  private anchored = false;
  private lastPrecision = 1;
  active = false;
  hasSnapVertex = false;
  snapVertex = Vector3.zero;
  snap: MoveSnap = MoveSnap.none;

  constructor(
    coordinator: GizmoDragCoordinator,
    target: MoveDragTarget,
    surface: MoveSurfaceSnap,
    numeric: ModalNumericParser,
  ) {
    this.coordinator = coordinator;
    this.target = target;
    this.surface = surface;
    this.numeric = numeric;
  }

  onDragStart() {
    this.resetReadings();
    this.vertexGrab.release();
    this.hasSnapVertex = false;
  }

  deactivate() {
    this.active = false;
    this.hasSnapVertex = false;
  }

  handleConstraintChanged(numeric: ModalNumericParser, basis: AxisBasis) {
    const [kind, axis] = numeric.resolveDragTarget();
    this.coordinator.retarget(kind, axis);
    const t = this.target;
    if (kind === DragKind.Axis) {
      const dir = basis.dir(axis);
      t.axisDir = dir;
      t.axisId = axis;
      GizmoHud.startAxisDrag(axis, dir);
    } else {
      const [dir1, dir2] = basis.planeDirs(axis);
      const [axis1, axis2] = AxisBasis.planeAxes(axis);
      t.planeDir1 = dir1;
      t.planeDir2 = dir2;
      t.planeAxis1 = axis1;
      t.planeAxis2 = axis2;
      GizmoHud.startPlaneDrag(axis1, dir1, axis2, dir2);
    }
    this.active = true;
    this.resetReadings();
    // Precision slowed the selection off the grip; the new constraint picks up from where it is.
    this.lastPrecision = this.precision();
    if (this.lastPrecision < 1) this.coordinator.rebaseScreenGrip(dragFollowPosition(this.coordinator));
    this.applyManualDrag();
  }

  private resetReadings() {
    this.readA = this.readB = this.readDistance = 0;
    this.anchored = false;
  }

  private precision() {
    const s = SharedGizmoSettings;
    return s.PrecisionHeld && !this.snap.pickDriven ? s.EffectivePrecisionFactor : 1;
  }

  private rebaseGrip() {
    if (!this.anchored) return;
    const origin = this.coordinator.pivotAtDragStart;
    if (this.coordinator.activeKind === DragKind.Axis) {
      this.coordinator.rebaseScreenGrip(origin.add(this.target.axisDir.mul(this.freeDistance)));
      this.readDistance = this.freeDistance;
    } else {
      this.coordinator.rebaseScreenGrip(
        origin.add(this.target.planeDir1.mul(this.freeA)).add(this.target.planeDir2.mul(this.freeB)),
      );
      this.readA = this.freeA;
      this.readB = this.freeB;
    }
  }

  private targetScreen(): Vector2 {
    return this.coordinator.wrap.virtualMousePosition.add(this.coordinator.screenGrip);
  }

  applyManualDrag() {
    if (this.surface.driving) return;
    const { transforms, snapshots } = this.coordinator.snapshot;
    if (!transforms.length) return;
    const precision = this.precision();
    if (!Mathf.Approximately(precision, this.lastPrecision)) this.rebaseGrip();
    this.lastPrecision = precision;
    const t = this.target;
    const origin = this.coordinator.pivotAtDragStart;
    let delta: Vector3;
    let local: Vector3;
    if (this.coordinator.activeKind === DragKind.Axis) {
      const previous = this.readDistance;
      const reading = ScreenDragSolver.trySolveAxis(origin, t.axisDir, this.targetScreen(), this.readDistance);
      if (reading == null) return;
      this.readDistance = reading;
      this.freeDistance = this.anchored ? this.freeDistance + (reading - previous) * precision : reading;
      this.anchored = true;
      let dist = this.freeDistance;
      const gap = this.tryVertexGap();
      if (gap) dist = VertexGrab.distanceAlongAxis(gap, t.axisDir, t.axisId);
      else dist = this.snap.snapAlong(origin, t.axisDir, dist);
      delta = t.axisDir.mul(dist);
      local = t.axisId.unit.mul(dist);
    } else {
      const [prevA, prevB] = [this.readA, this.readB];
      const r = ScreenDragSolver.trySolvePlane(
        origin,
        t.planeDir1,
        t.planeDir2,
        HandleUtility.worldToGUIPoint(origin),
        this.targetScreen(),
      );
      if (!r) return;
      [this.readA, this.readB] = r;
      if (this.anchored) {
        this.freeA += (r[0] - prevA) * precision;
        this.freeB += (r[1] - prevB) * precision;
      } else [this.freeA, this.freeB] = r;
      this.anchored = true;
      let [a, b] = [this.freeA, this.freeB];
      const gap = this.tryVertexGap();
      if (gap) [a, b] = VertexGrab.distancesAcrossPlane(gap, t.planeDir1, t.planeDir2, t.planeAxis1, t.planeAxis2);
      else [a, b] = this.snap.snapPlane(origin, t.planeDir1, t.planeDir2, a, b);
      delta = t.planeDir1.mul(a).add(t.planeDir2.mul(b));
      local = t.planeAxis1.unit.mul(a).add(t.planeAxis2.unit.mul(b));
    }
    const individual = IndividualOrigins.localAxes(this.coordinator, this.numeric);
    this.coordinator.snapshot.record('Move');
    transforms.forEach(
      (tr, i) => (tr.position = snapshots[i].position.add(individual ? snapshots[i].rotation.mulV(local) : delta)),
    );
    GizmoHud.setAbsoluteDelta(delta);
  }

  // From the carried point to the vertex under the cursor, measured from the drag-start pivot.
  private tryVertexGap(): Vector3 | null {
    const vertex =
      VertexSnappingUtility.snapsToTarget && !ModalNumericParser.anyNumericInput
        ? VertexSnappingUtility.tryGetNearestOtherVertex()
        : null;
    if (!vertex) {
      this.vertexGrab.release();
      this.hasSnapVertex = false;
      return null;
    }
    // Both halves of the rigid offset are read at the same instant: the live gizmo position.
    const pivot = dragFollowPosition(this.coordinator);
    const c = this.coordinator;
    const carried = this.vertexGrab.track(
      pivot,
      SelectionCache.deep,
      c.wrap.projectionMousePosition,
      c.vertexSnapAtDragStart,
    );
    this.snapVertex = vertex;
    this.hasSnapVertex = true;
    return vertex.sub(carried).sub(c.pivotAtDragStart);
  }

  applyNumericDelta(numeric: ModalNumericParser, spaceRotation: Quaternion) {
    const { transforms, snapshots } = this.coordinator.snapshot;
    if (!transforms.length) return;
    const localVector = numeric.currentParsedVector3;
    const worldDelta = spaceRotation.mulV(localVector);
    const individual = IndividualOrigins.localAxes(this.coordinator, numeric);
    this.coordinator.snapshot.record('Move');
    transforms.forEach(
      (t, i) =>
        (t.position = snapshots[i].position.add(individual ? snapshots[i].rotation.mulV(localVector) : worldDelta)),
    );
  }
}

export const MoveDragOverlays = {
  draw(
    coordinator: GizmoDragCoordinator,
    settings: MoveGizmoSettings,
    basis: AxisBasis,
    target: MoveDragTarget,
    surface: MoveSurfaceSnap,
    vertexDrag: boolean,
    moveSnap: MoveSnap,
    position: Vector3,
    headStyle: AxisHeadStyle,
    individualLocal: boolean,
    grabbing: boolean,
  ) {
    if (Event.current.type !== EventType.Repaint) return;
    const shared = SharedGizmoSettings;
    const start = coordinator.pivotAtDragStart;
    // Aiming puts the selection on the surface point, so the lattice has nothing to land on.
    const drawTicks = shared.SnapTicksEnabled && moveSnap.active && !surface.driving;
    if (surface.driving && surface.hasTarget)
      DrawOverlays.drawSurfaceMarker(surface.surfacePoint, surface.surfaceNormal, start);
    const { transforms, snapshots } = coordinator.snapshot;
    if (coordinator.activeKind === DragKind.Axis) {
      if (individualLocal)
        transforms.forEach((_, i) =>
          DrawOverlays.drawConstraintLine(
            snapshots[i].position,
            snapshots[i].rotation.mulV(target.axisId.unit),
            target.axisId.constrain,
          ),
        );
      else DrawOverlays.drawConstraintLine(start, target.axisDir, target.axisId.constrain);
      if (drawTicks) {
        const dist = Vector3.dot(position.sub(start), target.axisDir);
        const [o1, o2] = basis.otherDirs(target.axisId);
        DrawOverlays.drawLinearSnapTicks(
          start,
          target.axisDir,
          DrawOverlays.bestSnapTickPerpendicular(o1, o2),
          dist,
          moveSnap,
        );
      }
    } else if (coordinator.activeKind === DragKind.Plane) {
      if (individualLocal)
        transforms.forEach((_, i) =>
          DrawOverlays.drawPlaneConstraintLines(
            snapshots[i].position,
            coordinator.activeAxis,
            snapshots[i].rotation.mulV(target.planeAxis1.unit),
            snapshots[i].rotation.mulV(target.planeAxis2.unit),
          ),
        );
      else DrawOverlays.drawPlaneConstraintLines(start, coordinator.activeAxis, target.planeDir1, target.planeDir2);
      if (drawTicks) {
        const d1 = Vector3.dot(position.sub(start), target.planeDir1);
        const d2 = Vector3.dot(position.sub(start), target.planeDir2);
        DrawOverlays.drawLinearSnapTicks(start, target.planeDir1, target.planeDir2, d1, moveSnap);
        DrawOverlays.drawLinearSnapTicks(start, target.planeDir2, target.planeDir1, d2, moveSnap);
      }
    }
    if (!shared.DragGhostsEnabled) return;
    const ghostSize = HandleUtility.getHandleSize(start) * shared.Size;
    switch (coordinator.activeKind) {
      case DragKind.Axis:
        drawGhostAxis(settings, start, target.axisDir, ghostSize, headStyle);
        break;
      case DragKind.Plane:
        DrawGhosts.drawGhostCenterDot(start, ghostSize);
        DrawGhosts.drawGhostPlane(
          start,
          target.planeDir1,
          target.planeDir2,
          coordinator.viewDirAtDragStart,
          ghostSize,
          settings.PlaneOffset,
          settings.PlaneSize,
          settings.PlaneOutlineThickness,
          settings.PlaneShape,
        );
        break;
      case DragKind.FreeRing:
        // A keyboard grab draws no ring, so ghosting one would read as something to grab.
        if (grabbing) DrawGhosts.drawGhostCenterDot(start, ghostSize);
        else if (vertexDrag) {
          Handles.color = GizmoColors.Ghost;
          DrawPrimitives.drawScreenSquare(
            start,
            coordinator.activeViewNormal,
            ghostSize * settings.ScreenRingRadius,
            shared.ScreenRingThicknessHover,
          );
        } else
          DrawGhosts.drawGhostRing(
            start,
            ghostSize,
            settings.ScreenRingRadius,
            shared.ScreenRingThicknessHover,
            coordinator.activeViewNormal,
          );
        break;
    }
  },
};

function drawGhostAxis(
  settings: MoveGizmoSettings,
  origin: Vector3,
  dir: Vector3,
  size: number,
  headStyle: AxisHeadStyle,
) {
  const tip = origin.add(dir.mul(settings.AxisLength * size));
  const head = settings.AxisHeadSize * size;
  DrawGhosts.drawGhostCenterDot(origin, size);
  Handles.color = GizmoColors.Ghost;
  DrawPrimitives.drawThickLine(origin, tip, settings.AxisThickness * SharedGizmoSettings.Size);
  Handles.color = withFade(GizmoColors.Ghost, 0.8);
  if (settings.AxisHeadFlat) headStyle.drawHeadFlat(tip, dir, head);
  else headStyle.drawHead(0, tip, dir, Quaternion.lookRotation(dir), head, EventType.Repaint);
}
