// FreeRingHandle (the screen ring: free move or uniform scale) and CenterDotHandle (the pivot dot).
import { EditorSnapSettings } from '../../../unity/editor.ts';
import { EditorGUI, HandleUtility, Handles, type CapFunction } from '../../../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility } from '../../../unity/imgui.ts';
import { Color, Plane, Vector3 } from '../../../unity/math.ts';
import { SelectionCache } from '../../foundation.ts';
import { GizmoColors } from '../colors.ts';
import { Signal } from '../common/signal.ts';
import { DragKind, type GizmoDragCoordinator } from '../core/drag.ts';
import { MoveSnap } from '../core/move-snap.ts';
import { ModalNumericParser } from '../core/numeric.ts';
import { ScreenDragSolver } from '../core/screen-drag-solver.ts';
import { DrawPrimitives, GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import { VertexGrab } from './vertex-grab.ts';

export class FreeRingHandle {
  private readonly coordinator: GizmoDragCoordinator;
  private readonly kind: DragKind;
  private readonly vertexGrab = new VertexGrab();
  // False on a degenerate start ray: the native handle's own position is used then.
  private dragHitValid = false;
  // Camera-facing plane through the pivot, frozen at the press; the cursor holds the pivot itself.
  private dragPlane = new Plane(Vector3.forward, Vector3.zero);
  // Unsnapped world position, advanced by precision-scaled increments of the projection.
  private free = Vector3.zero;
  private reading = Vector3.zero;
  private target = Vector3.zero;

  readonly dragStarted = new Signal();
  readonly dragged = new Signal<[Vector3]>();
  readonly dragEnded = new Signal();

  constructor(coordinator: GizmoDragCoordinator, kind: DragKind) {
    this.coordinator = coordinator;
    this.kind = kind;
  }

  draw(
    position: Vector3,
    size: number,
    snap: Vector3,
    capFunction: CapFunction,
    moveSnap: MoveSnap = MoveSnap.none,
  ): Vector3 {
    const id = GUIUtility.getControlID(FocusType.Passive);
    const c = this.coordinator;
    const wasActive = c.snapshot.activeDragId === id;
    EditorGUI.beginChangeCheck();
    const raw = Handles.freeMoveHandle(id, position, size, snap, capFunction);
    const changed = EditorGUI.endChangeCheck();
    const snapping = moveSnap.valid ? moveSnap.active : EditorSnapSettings.snapEnabled;
    const precision =
      SharedGizmoSettings.PrecisionHeld && !moveSnap.pickDriven && (moveSnap.valid || !snapping)
        ? SharedGizmoSettings.EffectivePrecisionFactor
        : 1;
    let target = raw;
    if (moveSnap.valid && GUIUtility.hotControl === id) {
      if (!wasActive) this.target = position;
      else if (changed) {
        const hit = this.dragHitValid ? this.tryCursorHit() : null;
        const vertex =
          VertexSnappingUtility.snapsToTarget && !ModalNumericParser.anyNumericInput
            ? VertexSnappingUtility.tryGetNearestOtherVertex()
            : null;
        if (vertex) {
          const carried = this.vertexGrab.track(
            position,
            SelectionCache.deep,
            c.wrap.projectionMousePosition,
            c.vertexSnapAtDragStart,
          );
          this.free = vertex.sub(carried);
          this.target = this.free;
          if (hit) this.reading = hit;
          c.snapshot.rebaseRaw(position);
        } else if (hit) {
          this.free = this.free.add(hit.sub(this.reading).mul(precision));
          this.reading = hit;
          this.target = moveSnap.snapPoint(this.free);
          // A slowed drag drifts off the grip, which a mid-drag X/Y/Z switch reads.
          if (precision < 1 && !c.retargeted) c.rebaseScreenGrip(this.free);
        }
      }
      target = this.target;
    }
    const delta = c.snapshot.preciseDelta(id, target, changed, moveSnap.valid ? 1 : precision);
    if (!wasActive && c.snapshot.activeDragId === id) {
      c.begin(this.kind, position);
      this.free = position;
      this.target = position;
      this.vertexGrab.release();
      const camera = GizmoRenderer.currentCamera();
      if (camera) {
        this.dragPlane = new Plane(camera.forward, position);
        const hit = this.tryCursorHit();
        this.dragHitValid = !!hit;
        this.reading = hit ?? Vector3.zero;
      } else this.dragHitValid = false;
      this.dragStarted.invoke();
    }
    if (wasActive && c.snapshot.activeDragId !== id) {
      c.end();
      this.dragEnded.invoke();
      c.clickGate.endHandleDrag(() => c.snapshot.cancel());
    }
    if (GUIUtility.hotControl === id && changed) this.dragged.invoke(delta);
    return delta;
  }

  private tryCursorHit() {
    const c = this.coordinator;
    return ScreenDragSolver.tryCursorOnPlane(
      this.dragPlane,
      HandleUtility.worldToGUIPoint(c.pivotAtDragStart),
      c.wrap.virtualMousePosition,
    );
  }
}

// How much the dot grows while an Alt mode is armed.
const AltArmedScale = 1.2;

export const CenterDotHandle = {
  draw(position: Vector3, coordinator: GizmoDragCoordinator, scale = 1, altArmed = false) {
    if (Event.current.type !== EventType.Repaint) return;
    if (SharedGizmoSettings.CenterDotRadius < 0.003) return;
    const radius = scale * (altArmed ? AltArmedScale : 1);
    const k = coordinator.activeKind;
    if (k === DragKind.Axis || k === DragKind.Plane || k === DragKind.ScaleAxis || k === DragKind.ScalePlane) {
      drawActiveDot(position, coordinator.activeAxis.active, radius);
      return;
    }
    Handles.color = altArmed ? GizmoColors.VertexModeDot : GizmoColors.CenterDot;
    // Vertex mode swaps the round dot for a square.
    if (coordinator.vertexModeActive) DrawPrimitives.drawCenterSquare(position, radius);
    else DrawPrimitives.drawCenterDot(position, radius);
  },
};

function drawActiveDot(position: Vector3, fill: Color, radius: number) {
  const size = DrawPrimitives.centerDotRadiusFactor(radius) * HandleUtility.getHandleSize(position);
  Handles.color = fill;
  DrawPrimitives.drawAASolidDisc(position, GizmoRenderer.cameraNormal(), size);
}
