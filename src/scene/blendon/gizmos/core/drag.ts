// DragKind, DragGate, GizmoDragSnapshot and GizmoDragCoordinator: one gizmo's drag lifecycle.
import { Selection, SelectionMode, Undo } from '../../../unity/editor.ts';
import { HandleUtility } from '../../../unity/handles.ts';
import { Event, EventType, GUIUtility } from '../../../unity/imgui.ts';
import { Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { GameObject, Transform } from '../../../unity/scene.ts';
import { SceneView, type SceneCamera } from '../../../unity/sceneview.ts';
import { CursorWrapTracker } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';

export const DragKind = {
  None: 0,
  Axis: 1,
  Plane: 2,
  FreeRing: 3,
  Ring: 4,
  Trackball: 5,
  ScaleAxis: 6,
  ScalePlane: 7,
  ScaleRing: 8,
} as const;
export type DragKind = number;

/** Tells a click from a drag: a click on another object selects it instead of moving this one. */
export class DragGate {
  static readonly Threshold = 2;
  travelDistance = 0;

  reset() {
    this.travelDistance = 0;
  }

  accumulateTravel(d: number) {
    this.travelDistance += d;
  }

  endHandleDrag(revertTransforms: () => void) {
    if (!SharedGizmoSettings.ClickSelectEnabled) return;
    if (this.travelDistance >= DragGate.Threshold) return;
    const picked = HandleUtility.pickGameObject(Event.current.mousePosition, false) as GameObject | null;
    if (!picked || picked === Selection.activeGameObject) return;
    revertTransforms();
    Selection.activeGameObject = picked;
  }
}

export interface TransformSnapshot {
  position: Vector3;
  rotation: Quaternion;
  localScale: Vector3;
}

export class GizmoDragSnapshot {
  private rawPrev = Vector3.zero;
  private recorded = false;
  private undoGroup = -1;
  activeDragId = 0;
  transforms: Transform[] = [];
  snapshots: TransformSnapshot[] = [];

  setActiveDragId(id: number) {
    this.activeDragId = id;
  }

  /** The per-frame increment of a handle's raw position, slowed while precision is held. */
  preciseDelta(id: number, raw: Vector3, changed: boolean, precisionFactor: number) {
    if (GUIUtility.hotControl !== id) {
      if (this.activeDragId === id) this.activeDragId = 0;
      return Vector3.zero;
    }
    if (this.activeDragId !== id) {
      this.activeDragId = id;
      this.rawPrev = raw;
      return Vector3.zero;
    }
    if (!changed) return Vector3.zero;
    const inc = raw.sub(this.rawPrev);
    this.rawPrev = raw;
    return inc.mul(SharedGizmoSettings.PrecisionHeld ? precisionFactor : 1);
  }

  rebaseRaw(raw: Vector3) {
    this.rawPrev = raw;
  }

  startCapture() {
    Undo.incrementCurrentGroup();
    this.undoGroup = Undo.getCurrentGroup();
    this.recorded = false;
    this.transforms = Selection.getTransforms(SelectionMode.TopLevel);
    this.snapshots = this.transforms.map((t) => ({
      position: t.position,
      rotation: t.rotation,
      localScale: t.localScale,
    }));
  }

  record(name: string) {
    if (!this.transforms.length) return;
    this.recorded = true;
    Undo.recordObjects(this.transforms, name);
  }

  finish() {
    if (!this.recorded) {
      this.undoGroup = -1;
      return;
    }
    // A real edit folds every group opened since the drag began into one undo step.
    if (this.hasRealChange()) {
      Undo.collapseUndoOperations(this.undoGroup);
      return;
    }
    Undo.revertAllDownToGroup(this.undoGroup);
    this.undoGroup = -1;
    this.recorded = false;
  }

  cancel() {
    GUIUtility.hotControl = 0;
    this.activeDragId = 0;
    if (this.recorded && this.undoGroup >= 0) Undo.revertAllDownToGroup(this.undoGroup);
    // Anything a handle wrote without Record is put back directly.
    this.transforms.forEach((t, i) => {
      const s = this.snapshots[i];
      if (t.position.equals(s.position) && t.rotation.equals(s.rotation) && t.localScale.equals(s.localScale)) return;
      t.position = s.position;
      t.rotation = s.rotation;
      t.localScale = s.localScale;
    });
    this.undoGroup = -1;
    this.recorded = false;
    this.transforms = [];
    this.snapshots = [];
  }

  private hasRealChange() {
    return this.transforms.some((t, i) => {
      const s = this.snapshots[i];
      return !t.position.equals(s.position) || !t.rotation.equals(s.rotation) || !t.localScale.equals(s.localScale);
    });
  }
}

/** Which single drag kind/axis/pivot is active for one gizmo; the one place RMB-cancel touches. */
export class GizmoDragCoordinator {
  readonly clickGate = new DragGate();
  readonly snapshot = new GizmoDragSnapshot();
  readonly wrap = new CursorWrapTracker();
  activeKind: DragKind = DragKind.None;
  activeAxis = GizmoAxis.X;
  pivotAtDragStart = Vector3.zero;
  retargeted = false;
  /** Gizmo screen position minus the cursor at the press, so the drag keeps the grip offset. */
  screenGrip = Vector2.zero;
  viewDirAtDragStart = Vector3.forward;
  vertexSnapAtDragStart = false;
  activeSceneView: SceneView | null = null;
  activeViewNormal = Vector3.forward;
  private cancelled = new Set<() => void>();

  get vertexModeActive() {
    return this.activeKind !== DragKind.None ? this.vertexSnapAtDragStart : VertexSnappingUtility.isActive;
  }

  isBlocking(other: DragKind) {
    return this.activeKind !== DragKind.None && this.activeKind !== other;
  }

  onCancelled(cb: () => void) {
    this.cancelled.add(cb);
  }

  /** selfDrivenCursor: a buttonless grab advances the tracker from MouseMove itself. */
  begin(kind: DragKind, pivot: Vector3, axis: GizmoAxis = GizmoAxis.X, _selfDrivenCursor = false) {
    this.activeKind = kind;
    this.activeAxis = axis;
    this.retargeted = false;
    this.pivotAtDragStart = pivot;
    this.vertexSnapAtDragStart = VertexSnappingUtility.isActive;
    VertexSnappingUtility.resetTargetSnap();
    this.activeSceneView = SceneView.currentDrawingSceneView;
    this.viewDirAtDragStart = GizmoRenderer.computeViewDir(pivot, GizmoRenderer.currentCamera());
    this.clickGate.reset();
    this.snapshot.startCapture();
    this.wrap.begin();
    this.screenGrip = HandleUtility.worldToGUIPoint(pivot).sub(this.wrap.virtualMousePosition);
  }

  rebaseScreenGrip(freePosition: Vector3) {
    if (this.activeKind === DragKind.None) return;
    this.screenGrip = HandleUtility.worldToGUIPoint(freePosition).sub(this.wrap.virtualMousePosition);
  }

  trackOwnerDrag(ev: Event, viewport: Vector2) {
    if (this.activeKind === DragKind.None || ev.type !== EventType.MouseDrag) return;
    this.clickGate.accumulateTravel(ev.delta.magnitude);
    this.wrap.update(ev.delta, viewport);
  }

  updateActiveView(camera: SceneCamera | null) {
    if (this.activeKind === DragKind.None || !camera) return;
    this.activeViewNormal = camera.forward;
  }

  end() {
    this.snapshot.finish();
    this.activeKind = DragKind.None;
    this.activeSceneView = null;
    this.wrap.end();
    VertexSnappingUtility.clearTarget();
  }

  retarget(kind: DragKind, axis: GizmoAxis) {
    this.activeKind = kind;
    this.activeAxis = axis;
    this.retargeted = true;
  }

  forceRelease() {
    this.snapshot.setActiveDragId(0);
    GUIUtility.hotControl = 0;
    this.end();
  }

  cancel() {
    this.snapshot.cancel();
    this.activeKind = DragKind.None;
    this.activeSceneView = null;
    this.wrap.end();
    VertexSnappingUtility.clearTarget();
    for (const cb of this.cancelled) cb();
  }

  isOwner(view: SceneView) {
    if (this.activeKind === DragKind.None) return true;
    if (!this.activeSceneView) {
      this.end();
      return true;
    }
    return this.activeSceneView === view;
  }
}
