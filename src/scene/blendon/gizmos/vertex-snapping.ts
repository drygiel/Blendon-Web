// VertexSnappingUtility: Blendon's vertex snapping (hold V) and virtual pivot pick (Shift+V).
import {
  EditorApplication,
  Selection,
  ShortcutManager,
  ShortcutStage,
  type ShortcutArguments,
} from '../../unity/editor.ts';
import { HandleUtility } from '../../unity/handles.ts';
import { Event } from '../../unity/imgui.ts';
import { Vector2, Vector3 } from '../../unity/math.ts';
import { worldVertices } from '../../unity/raycast.ts';
import type { Transform } from '../../unity/scene.ts';
import { Camera, SceneView } from '../../unity/sceneview.ts';
import { EditorRaycastUtility, SceneTutorial, SelectionCache } from '../foundation.ts';
import { GizmoRegistry } from './viewport-gesture.ts';

export const VertexSnapping = {
  ShortcutId: 'Blendon/All Tools/Vertex Snap',
  PickShortcutId: 'Blendon/All Tools/Pick Virtual Pivot',
};

// A press that turned the pull on and is held past this reads as a clutch.
const HoldSeconds = 0.25;

let held = false;
let pickMode = false;
let pickOwner: Transform | null = null;
let pickLocal = Vector3.zero;
let targetSnapOn = false;
let snapPressedAt = 0;
let snapPressTurnedOn = false;
let surfaceSnapOwner: unknown = null;
let repicking = false;
let stashedOwner: Transform | null = null;
let stashedLocal = Vector3.zero;
let hasHover = false;
let hover = Vector3.zero;
let hoverOwner: Transform | null = null;
let targetOwner: Transform | null = null;
let targetVertex = Vector3.zero;
// One vertex search per event and point rather than one per asker.
let searchEvent: Event | null = null;
let searchPoint = Vector2.zero;
let searchKey = '';
let searchResult: VertexHit | null = null;

/** A vertex and the object the search found it on. */
export interface VertexHit {
  vertex: Vector3;
  owner: Transform;
}

/** Unity's HandleUtility.FindNearestVertex with its out GameObject: the screen-nearest vertex and its object. */
function findNearestVertex(guiPoint: Vector2, transforms: Transform[]): VertexHit | null {
  let best: VertexHit | null = null;
  let bestDist = Infinity;
  for (const t of transforms) {
    for (const v of worldVertices(t.gameObject)) {
      const g = HandleUtility.worldToGUIPointWithDepth(v);
      if (g.z <= 0) continue;
      const d = (g.x - guiPoint.x) ** 2 + (g.y - guiPoint.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = { vertex: v, owner: t };
      }
    }
  }
  return best;
}

function dropRepick() {
  repicking = false;
  stashedOwner = null;
  hasHover = false;
  hoverOwner = null;
}

function setTargetSnap(on: boolean) {
  targetSnapOn = on;
  if (!on) VertexSnappingUtility.clearTarget();
}

function hold(args: ShortcutArguments) {
  held = args.stage === ShortcutStage.Begin;
  // In pick mode the key either drives the pull toward other objects (mid-manipulation) or reopens the choice.
  if (held && pickMode && GizmoRegistry.anyManipulation()) {
    snapPressedAt = EditorApplication.timeSinceStartup;
    snapPressTurnedOn = !targetSnapOn;
    setTargetSnap(!targetSnapOn);
  } else if (held) beginRepick();
  else {
    if (snapPressTurnedOn) {
      snapPressTurnedOn = false;
      if (EditorApplication.timeSinceStartup - snapPressedAt >= HoldSeconds) setTargetSnap(false);
    }
    endRepick();
  }
  SceneView.repaintAll();
}

function beginRepick() {
  if (!pickMode || !pickOwner || GizmoRegistry.anyManipulation()) return;
  repicking = true;
  stashedOwner = pickOwner;
  stashedLocal = pickLocal;
  pickOwner = null;
  hasHover = false;
}

function endRepick() {
  if (!repicking) return;
  if (!pickOwner) {
    if (hasHover) VertexSnappingUtility.confirmPick(hover, hoverOwner);
    // Nothing settled: the pick the hold set aside stands.
    if (!pickOwner && stashedOwner) {
      pickOwner = stashedOwner;
      pickLocal = stashedLocal;
    }
  }
  dropRepick();
}

function togglePickMode() {
  pickMode = !pickMode;
  pickOwner = null;
  dropRepick();
  SceneView.repaintAll();
}

export const VertexSnappingUtility = {
  get isActive() {
    return held || pickMode;
  },
  set isActive(value: boolean) {
    if (VertexSnappingUtility.isActive === value) return;
    pickMode = value;
    held = false;
    VertexSnappingUtility.clearPick();
    SceneView.repaintAll();
  },
  get isPickMode() {
    return pickMode;
  },
  get snapsToTarget() {
    return VertexSnappingUtility.isActive && (!pickMode || targetSnapOn) && surfaceSnapOwner == null;
  },
  suspendForSurfaceSnap(owner: unknown, driving: boolean) {
    if (driving) surfaceSnapOwner = owner;
    else if (surfaceSnapOwner === owner) surfaceSnapOwner = null;
  },
  get hasTarget() {
    return targetOwner != null;
  },
  get targetVertex() {
    return targetVertex;
  },
  get targetOwner() {
    return targetOwner;
  },
  get isPicking() {
    return pickMode && !pickOwner;
  },
  get isRepicking() {
    return repicking;
  },
  get hasPick() {
    return pickOwner != null;
  },
  get pickSnapDrivesDrag() {
    return VertexSnappingUtility.hasPick && VertexSnappingUtility.snapsToTarget;
  },
  get pickedPoint() {
    return pickOwner ? pickOwner.transformPoint(pickLocal) : Vector3.zero;
  },

  /** owner: the object the search found the vertex on. */
  setHoverCandidate(world: Vector3, owner: Transform | null) {
    hasHover = true;
    hover = world;
    hoverOwner = owner;
  },
  clearHoverCandidate() {
    hasHover = false;
    hoverOwner = null;
  },

  /** The gizmo stands on it from now on, riding the object the search found it on. */
  confirmPick(world: Vector3, owner: Transform | null) {
    if (!owner) return;
    pickOwner = owner;
    pickLocal = owner.inverseTransformPoint(world);
    SceneTutorial.reportShortcut(VertexSnapping.PickShortcutId);
    SceneView.repaintAll();
  },

  exitPickMode() {
    if (!pickMode) return;
    pickMode = false;
    pickOwner = null;
    dropRepick();
    SceneView.repaintAll();
  },

  clearPick() {
    dropRepick();
    if (!pickOwner) return;
    pickOwner = null;
    SceneView.repaintAll();
  },

  tryGetNearestOtherVertex(): Vector3 | null {
    if (!VertexSnappingUtility.snapsToTarget) {
      VertexSnappingUtility.clearTarget();
      return null;
    }
    if (!Camera.current) return null;
    const others = EditorRaycastUtility.pickableTransformsExcept(SelectionCache.transforms);
    const hit = others.length ? findNearestVertex(Event.current.mousePosition, others) : null;
    if (hit) {
      targetVertex = hit.vertex;
      targetOwner = hit.owner;
      return hit.vertex;
    }
    VertexSnappingUtility.clearTarget();
    return null;
  },

  clearTarget() {
    targetOwner = null;
  },

  resetTargetSnap() {
    targetSnapOn = false;
    snapPressTurnedOn = false;
  },

  tryGetNearestOwnVertex(guiPoint: Vector2, transforms: Transform[]): VertexHit | null {
    if (!transforms.length || !Camera.current) return null;
    return findNearestVertex(guiPoint, transforms);
  },

  /** The point a drag would pick up: the settled pick, else the selection's vertex nearest the cursor. */
  tryGetGrabPoint(guiPoint: Vector2, transforms: Transform[]): Vector3 | null {
    return VertexSnappingUtility.tryGetGrabHit(guiPoint, transforms)?.vertex ?? null;
  },

  /** The same with the object the point sits on. */
  tryGetGrabHit(guiPoint: Vector2, transforms: Transform[]): VertexHit | null {
    if (pickOwner) return { vertex: VertexSnappingUtility.pickedPoint, owner: pickOwner };
    const key = transforms.map((t) => t.gameObject.id).join(',');
    if (searchEvent === Event.current && searchPoint.equals(guiPoint) && searchKey === key) return searchResult;
    searchEvent = Event.current;
    searchPoint = guiPoint;
    searchKey = key;
    searchResult = VertexSnappingUtility.tryGetNearestOwnVertex(guiPoint, transforms);
    return searchResult;
  },

  install() {
    ShortcutManager.register(VertexSnapping.ShortcutId, hold, true, 'V', true);
    ShortcutManager.register(VertexSnapping.PickShortcutId, togglePickMode, false, 'Shift+V');
    Selection.selectionChanged.add(() => {
      VertexSnappingUtility.clearPick();
      searchEvent = null;
      VertexSnappingUtility.clearTarget();
    });
  },
};
