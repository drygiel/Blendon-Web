// DragKind, DragGate, GizmoDragSnapshot and GizmoDragCoordinator: one gizmo's drag lifecycle.
import { Selection, SelectionMode, Undo } from '../../../unity/editor.ts';
import { HandleUtility } from '../../../unity/handles.ts';
import { Event, EventType, GUIUtility } from '../../../unity/imgui.ts';
import { Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import type { Transform } from '../../../unity/scene.ts';
import { SceneView, type SceneCamera } from '../../../unity/sceneview.ts';
import { CursorWrapTracker, TransformTraits, TutorialTransform } from '../../foundation.ts';
import { GizmoAxis } from '../axis.ts';
import { GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';
import { ClickSelection } from './click-selection.ts';

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

// Retargets stay in the family, so the kind the drag began with decides it.
function familyOf(kind: DragKind) {
  switch (kind) {
    case DragKind.Axis:
    case DragKind.Plane:
    case DragKind.FreeRing:
      return TransformTraits.Move;
    case DragKind.Ring:
    case DragKind.Trackball:
      return TransformTraits.Rotate;
    case DragKind.ScaleAxis:
    case DragKind.ScalePlane:
    case DragKind.ScaleRing:
      return TransformTraits.Scale;
  }
  return TransformTraits.None;
}

/** Which handle, for handle drags only. */
function handleOf(kind: DragKind) {
  return kind === DragKind.Axis
    ? TransformTraits.Arrow
    : kind === DragKind.Plane
      ? TransformTraits.Square
      : kind === DragKind.Ring
        ? TransformTraits.Ring
        : TransformTraits.None;
}

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

  /** Under the threshold it was a click: select the way the Scene view does and, if that changes, revert the nudge. */
  endHandleDrag(revertTransforms: () => void) {
    if (!SharedGizmoSettings.ClickSelectEnabled) return;
    if (this.travelDistance >= DragGate.Threshold) return;
    const click = Event.current;
    const next = ClickSelection.resolve(click.mousePosition, click);
    if (!next) return;
    revertTransforms();
    Selection.set(next, next[0]);
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

  /** Frees the hot control only while it is this drag's: a grab has none, and an orbit beside it keeps its own. */
  releaseHotControl() {
    if (this.activeDragId !== 0 && GUIUtility.hotControl === this.activeDragId) GUIUtility.hotControl = 0;
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

  /** True when something really changed and was kept. */
  finish() {
    if (!this.recorded) {
      this.undoGroup = -1;
      return false;
    }
    // A real edit folds every group opened since the drag began into one undo step.
    if (this.hasRealChange()) {
      Undo.collapseUndoOperations(this.undoGroup);
      return true;
    }
    Undo.revertAllDownToGroup(this.undoGroup);
    this.undoGroup = -1;
    this.recorded = false;
    return false;
  }

  cancel() {
    this.releaseHotControl();
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
  private ended = new Set<() => void>();

  get vertexModeActive() {
    return this.activeKind !== DragKind.None ? this.vertexSnapAtDragStart : VertexSnappingUtility.isActive;
  }

  isBlocking(other: DragKind) {
    return this.activeKind !== DragKind.None && this.activeKind !== other;
  }

  onCancelled(cb: () => void) {
    this.cancelled.add(cb);
  }

  /** Every end of a drag: released, confirmed or cancelled. */
  onEnded(cb: () => void) {
    this.ended.add(cb);
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
    TutorialTransform.begin(familyOf(kind), handleOf(kind), VertexSnappingUtility.hasPick);
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
    // Target first, the clear below drops it.
    TutorialTransform.end(this.snapshot.finish(), VertexSnappingUtility.hasTarget);
    this.activeKind = DragKind.None;
    this.activeSceneView = null;
    this.wrap.end();
    VertexSnappingUtility.clearTarget();
    for (const cb of this.ended) cb();
  }

  retarget(kind: DragKind, axis: GizmoAxis) {
    this.activeKind = kind;
    this.activeAxis = axis;
    this.retargeted = true;
  }

  forceRelease() {
    this.snapshot.releaseHotControl();
    this.snapshot.setActiveDragId(0);
    this.end();
  }

  cancel() {
    this.snapshot.cancel();
    TutorialTransform.cancel();
    this.activeKind = DragKind.None;
    this.activeSceneView = null;
    this.wrap.end();
    VertexSnappingUtility.clearTarget();
    for (const cb of this.ended) cb();
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
