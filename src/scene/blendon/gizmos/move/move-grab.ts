// MoveGrab: G moves the selection with the cursor, no handle needed.
import { Selection, ShortcutManager, Tool, Tools, type ShortcutArguments } from '../../../unity/editor.ts';
import { HandleUtility, MouseCursor } from '../../../unity/handles.ts';
import { Event, EventType } from '../../../unity/imgui.ts';
import { Plane, Vector3 } from '../../../unity/math.ts';
import type { SceneCamera, SceneView } from '../../../unity/sceneview.ts';
import { SelectionCache, ShortcutTips } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GrabSession, IndividualOrigins } from '../common/controller.ts';
import { AxisBasis } from '../common/layout.ts';
import { DragKind, GizmoDragCoordinator } from '../core/drag.ts';
import { MoveSnap } from '../core/move-snap.ts';
import { ModalNumericParser, ModalNumericState } from '../core/numeric.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import { ConeAxisHead } from '../handles/axis-handle.ts';
import { VertexGrab } from '../handles/vertex-grab.ts';
import { GizmoHud } from '../hud.ts';
import { DrawOverlays } from '../overlays.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import { MoveGizmo } from './move-gizmo.ts';
import {
  MoveDragOverlays,
  MoveDragTarget,
  MoveManualConstraint,
  MoveSurfaceSnap,
  dragFollowPosition,
} from './move-parts.ts';

export class MoveGrab extends GrabSession {
  static readonly ShortcutId = 'Blendon/Grab';
  private readonly manual: MoveManualConstraint;
  private readonly surface: MoveSurfaceSnap;
  private readonly target = new MoveDragTarget();
  // The unconstrained path's carried point; the constrained one lives in manual.
  private readonly vertexGrab = new VertexGrab();
  private hasSnapVertex = false;
  private originValid = false;
  private snapVertex = Vector3.zero;
  // Unsnapped point the pivot was carried to, advanced by precision-scaled steps of the plane hit.
  private free = Vector3.zero;
  private reading = Vector3.zero;
  // Camera-facing plane through the pivot, frozen so orbiting mid-grab can't reshape it.
  private plane = new Plane(Vector3.forward, Vector3.zero);

  private static _instance: MoveGrab | null = null;
  static get instance() {
    return (MoveGrab._instance ??= new MoveGrab());
  }

  private constructor() {
    super(new GizmoDragCoordinator());
    this.surface = new MoveSurfaceSnap(this.coordinator, this.target);
    this.manual = new MoveManualConstraint(this.coordinator, this.target, this.surface, this.numeric);
    this.subscribeSceneGui();
  }

  static install() {
    ShortcutManager.register(
      MoveGrab.ShortcutId,
      (args: ShortcutArguments) => {
        MoveGrab.instance.request(args);
        ShortcutTips.note(MoveGrab.ShortcutId);
      },
      false,
      'G',
    );
  }

  // The Move Tool's own look, so a grab reads exactly like the drag it stands in for.
  private static get settings() {
    return MoveGizmo.instance.settings;
  }
  protected get bindingId() {
    return MoveGrab.ShortcutId;
  }
  protected get enabled() {
    return MoveGrab.settings.Enabled;
  }
  protected get toolType() {
    return Tool.Move;
  }
  protected get grabKind() {
    return DragKind.FreeRing;
  }
  protected get dragCursor() {
    return MouseCursor.MoveArrow;
  }
  protected override get altArmed() {
    return this.surface.held;
  }

  protected ownsDragKind(kind: DragKind) {
    return kind === DragKind.Axis || kind === DragKind.Plane || kind === DragKind.FreeRing;
  }

  gizmoPosition() {
    return dragFollowPosition(this.coordinator);
  }

  protected override localSpaceRotation() {
    return Selection.activeTransform ? Selection.activeTransform.rotation : Tools.handleRotation;
  }

  protected onSessionBegan(_sceneView: SceneView, camera: SceneCamera, pivot: Vector3) {
    this.plane = new Plane(camera.forward, pivot);
    const hit = this.tryCursorHit();
    this.originValid = !!hit;
    this.reading = hit ?? Vector3.zero;
    this.free = pivot;
    GizmoHud.startFreeDrag();
    this.manual.onDragStart();
    this.vertexGrab.release();
    this.hasSnapVertex = false;
  }

  // First, so an Alt press or release takes effect on the very event carrying it.
  protected override onInputPass(sceneView: SceneView, ev: Event) {
    const s = MoveGrab.settings;
    this.surface.update(
      sceneView,
      ev,
      s.SurfaceSnapEnabled,
      s.SurfaceSnapModifier,
      this.numeric.state === ModalNumericState.NumericInput,
    );
  }

  protected followCursor() {
    if (this.surface.driving) {
      // Nothing probes for a vertex on these frames, so the last one is dropped by hand.
      this.hasSnapVertex = false;
      VertexSnappingUtility.clearTarget();
      return;
    }
    this.manual.snap = this.currentSnap();
    if (this.manual.active) this.manual.applyManualDrag();
    else this.applyFree();
  }

  private currentSnap() {
    return MoveSnap.current(
      this.coordinator.pivotAtDragStart,
      this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit),
    );
  }

  // Applied absolutely from the drag-start snapshot so snapping never compounds across frames.
  private applyFree() {
    const { transforms, snapshots } = this.coordinator.snapshot;
    const pivot = this.coordinator.pivotAtDragStart;
    const snap = this.currentSnap();
    let tracked = false;
    const hit = this.originValid ? this.tryCursorHit() : null;
    if (hit) {
      const s = SharedGizmoSettings;
      const precision = s.PrecisionHeld && !snap.pickDriven ? s.EffectivePrecisionFactor : 1;
      this.free = this.free.add(hit.sub(this.reading).mul(precision));
      this.reading = hit;
      tracked = true;
      if (precision < 1) this.coordinator.rebaseScreenGrip(this.free);
    }
    let offset = this.tryVertexOffset(pivot);
    if (!offset) {
      if (!tracked) return;
      // Snapped as a world position: grid mode's lattice is absolute.
      offset = snap.snapPoint(this.free).sub(pivot);
    }
    this.coordinator.snapshot.record('Move');
    const o = offset;
    transforms.forEach((t, i) => (t.position = snapshots[i].position.add(o)));
    GizmoHud.setAbsoluteDelta(offset);
  }

  private tryVertexOffset(pivot: Vector3): Vector3 | null {
    const vertex =
      VertexSnappingUtility.snapsToTarget && !ModalNumericParser.anyNumericInput
        ? VertexSnappingUtility.tryGetNearestOtherVertex()
        : null;
    if (!vertex) {
      this.vertexGrab.release();
      this.hasSnapVertex = false;
      return null;
    }
    const c = this.coordinator;
    const carried = this.vertexGrab.track(
      this.gizmoPosition(),
      SelectionCache.deep,
      c.wrap.projectionMousePosition,
      c.vertexSnapAtDragStart,
    );
    this.snapVertex = vertex;
    this.hasSnapVertex = true;
    return vertex.sub(carried).sub(pivot);
  }

  protected applyNumeric() {
    this.manual.applyNumericDelta(
      this.numeric,
      this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit),
    );
  }

  protected onConstraintChanged() {
    if (this.numeric.isUnconstrained) {
      // Back to the screen-plane follow, measured from the grab start as before.
      this.manual.deactivate();
      this.coordinator.retarget(this.grabKind, GizmoAxis.X);
      GizmoHud.startFreeDrag();
      if (this.numeric.state === ModalNumericState.NumericInput) this.applyNumeric();
      else this.followCursor();
      return;
    }
    this.manual.handleConstraintChanged(
      this.numeric,
      new AxisBasis(this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit)),
    );
  }

  protected drawSessionOverlays() {
    const basis = new AxisBasis(this.spaceRotation(this.numeric.currentActiveSpace, this.numeric.isSpaceExplicit));
    MoveDragOverlays.draw(
      this.coordinator,
      MoveGrab.settings,
      basis,
      this.target,
      this.surface,
      false,
      this.currentSnap(),
      this.gizmoPosition(),
      ConeAxisHead,
      IndividualOrigins.localAxes(this.coordinator, this.numeric),
      true,
    );
    const has = this.manual.active ? this.manual.hasSnapVertex : this.hasSnapVertex;
    const vertex = this.manual.active ? this.manual.snapVertex : this.snapVertex;
    if (
      !has ||
      !VertexSnappingUtility.snapsToTarget ||
      ModalNumericParser.anyNumericInput ||
      Event.current.type !== EventType.Repaint
    )
      return;
    DrawOverlays.drawAxisAlignedConnector(this.gizmoPosition(), vertex);
  }

  protected override endSession() {
    super.endSession();
    this.manual.deactivate();
    this.surface.reset();
    this.vertexGrab.release();
    this.hasSnapVertex = false;
  }

  // The plane faces the camera, so this is a plain intersection.
  private tryCursorHit() {
    const c = this.coordinator;
    return ScreenDragSolver.tryCursorOnPlane(
      this.plane,
      HandleUtility.worldToGUIPoint(c.pivotAtDragStart),
      c.wrap.virtualMousePosition,
    );
  }
}
