// The Editor's own transform tools (Move, Rotate, Scale and Transform), drawn whenever no plugin gizmo has claimed
// the slot through Tools.hidden. Unity's BuiltinTools on top of its Handles, with V (held) and Shift+V for the
// Editor's vertex snapping and Escape cancelling a drag.
import {
  PivotMode,
  PivotRotation,
  Selection,
  SelectionMode,
  ShortcutManager,
  ShortcutStage,
  Tool,
  Tools,
  Undo,
} from '../../unity/editor.ts';
import { EditorGUI, Handles, HandleUtility } from '../../unity/handles.ts';
import { Event, EventType, GUIUtility, KeyCode } from '../../unity/imgui.ts';
import { Quaternion, Vector2, Vector3 } from '../../unity/math.ts';
import type { Transform } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { BuiltinHandles, controlIds, nearestVertex } from './builtin-handles.ts';
import { alignedScaleDelta } from './handle-math.ts';

const VertexSnapId = 'Scene View/Vertex Snapping';
const VertexSnapToggleId = 'Scene View/Toggle Vertex Snapping';

const individualSpace = () => Tools.pivotRotation === PivotRotation.Local && Tools.pivotMode === PivotMode.Pivot;

// ---- vertex snapping (Unity's VertexSnapping) ----

// Where the handle sits off the tool's own position: the selection's vertex or pivot nearest the cursor.
let handleOffset = Vector3.zero;
let keptOffset = Vector3.zero;

function enableVertexSnapping(id: number) {
  Tools.vertexDragging = true;
  if (GUIUtility.hotControl !== 0 && GUIUtility.hotControl === id) handleOffset = keptOffset;
  SceneView.repaintAll();
}

function disableVertexSnapping(id: number) {
  Tools.vertexDragging = false;
  handleOffset = Vector3.zero;
  if (GUIUtility.hotControl !== id) keptOffset = Vector3.zero;
  SceneView.repaintAll();
}

/** VertexSnapping.FindNearestPivot: compared on each transform's own forward plane under the cursor. */
function nearestPivot(transforms: Transform[], mouse: Vector2) {
  const ray = HandleUtility.guiPointToWorldRay(mouse);
  let pivot: Vector3 | null = null;
  for (const t of transforms) {
    const n = t.forward;
    const along = Vector3.dot(ray.direction, n);
    const dist = Math.abs(along) < 1e-8 ? 0 : Vector3.dot(t.position.sub(ray.origin), n) / along;
    const w = ray.getPoint(dist);
    if (!pivot || pivot.sub(w).magnitude > t.position.sub(w).magnitude) pivot = t.position;
  }
  return pivot ?? Tools.handlePosition;
}

/** VertexSnapping.UpdateVertexSnappingOffset; with Ctrl the handle stays on the pivot. */
function updateVertexOffset() {
  const ev = Event.current;
  if (ev.actionKey && !ev.shift) {
    handleOffset = Vector3.zero;
    return;
  }
  const selection = Selection.getTransforms(SelectionMode.Deep);
  const mouse = ev.mousePosition;
  const pivot = nearestPivot(selection, mouse);
  const vertex = nearestVertex(
    selection.map((t) => t.gameObject),
    mouse,
  );
  const gui = (p: Vector3) => HandleUtility.worldToGUIPoint(p).sub(mouse).magnitude;
  const near = vertex && gui(vertex) < gui(pivot) ? vertex : pivot;
  handleOffset = near.sub(Tools.handlePosition);
}

// ---- the tools (Unity's BuiltinTools) and their undo ----

interface Start {
  p: Vector3;
  r: Quaternion;
  s: Vector3;
}

type Kind = 'Move' | 'Rotate' | 'Scale';

let session: {
  kind: Kind;
  tool: Tool;
  id: number;
  starts: Map<Transform, Start>;
  pivot: Vector3;
  startRotation: Quaternion;
  handleRotation: Quaternion;
} | null = null;

/** Starts the undo step and remembers every target's pose when one of the tool's handles took the mouse. */
function begin(before: number, ids: number[], kind: Kind, pivot: Vector3, rotation: Quaternion) {
  const id = GUIUtility.hotControl;
  if (before === id || !ids.includes(id)) return;
  const targets = Selection.transforms;
  Undo.incrementCurrentGroup();
  Undo.recordObjects(targets, kind);
  Undo.setCurrentGroupName(kind);
  session = {
    kind,
    tool: Tools.current,
    id,
    starts: new Map(targets.map((t) => [t, { p: t.position, r: t.rotation, s: t.localScale }])),
    pivot,
    startRotation: rotation,
    handleRotation: rotation,
  };
}

function endIfReleased() {
  if (session && GUIUtility.hotControl !== session.id) {
    Undo.incrementCurrentGroup();
    session = null;
    BuiltinHandles.endDrag();
  }
}

/** The Editor reverts a drag on Escape while a handle holds the mouse, and lets go of it. */
function cancelOnEscape() {
  const ev = Event.current;
  if (!session || ev.type !== EventType.KeyDown || ev.keyCode !== KeyCode.Escape) return;
  if (GUIUtility.hotControl !== session.id) return;
  Undo.revertAllInCurrentGroup();
  GUIUtility.hotControl = 0;
  session = null;
  BuiltinHandles.endDrag();
  ev.use();
  SceneView.repaintAll();
}

/** Where the handle is drawn: a move carries it along, a turn or a scale holds it still. */
function handlePosition() {
  if (!session) return Tools.handlePosition.add(handleOffset);
  if (session.kind !== 'Move') return session.pivot;
  const [t, s] = session.starts.entries().next().value as [Transform, Start];
  return session.pivot.add(t.position.sub(s.p));
}

const handleRotation = () => session?.handleRotation ?? Tools.handleRotation;

function applyMove(delta: Vector3) {
  if (!session) return;
  for (const [t, s] of session.starts) t.position = s.p.add(delta);
}

/** RotateTool: about the handle in Center, each about its own pivot otherwise, its own axes in Local Pivot. */
function applyRotation() {
  if (!session) return;
  const world = session.handleRotation.mul(Quaternion.inverse(session.startRotation));
  const local = Quaternion.inverse(session.startRotation).mul(session.handleRotation);
  const center = Tools.pivotMode !== PivotMode.Pivot;
  for (const [t, s] of session.starts) {
    if (center) {
      t.rotation = world.mul(s.r);
      t.position = session.pivot.add(world.mulV(s.p.sub(session.pivot)));
    } else t.rotation = individualSpace() ? s.r.mul(local) : world.mul(s.r);
  }
}

/** TransformManipulator.SetScaleDelta: about the handle in Center, about each pivot otherwise. */
function applyScale(delta: Vector3, rotation: Quaternion) {
  if (!session) return;
  for (const [t, s] of session.starts) {
    const point = Tools.pivotMode === PivotMode.Pivot ? s.p : session.pivot;
    const r = individualSpace() ? s.r : rotation;
    t.position = point.add(r.mulV(Quaternion.inverse(r).mulV(s.p.sub(point)).scale(delta)));
    t.localScale = s.s.scale(alignedScaleDelta(delta, r, s.r));
  }
}

function moveTool() {
  const ids = controlIds(7);
  const before = GUIUtility.hotControl;
  const position = handlePosition();
  const rotation = handleRotation();
  EditorGUI.beginChangeCheck();
  const next = BuiltinHandles.position(ids, position, rotation);
  const changed = EditorGUI.endChangeCheck();
  begin(before, ids, 'Move', position, rotation);
  if (changed && session && ids.includes(session.id)) applyMove(next.sub(session.pivot));
}

function rotateTool() {
  const ids = controlIds(5);
  const before = GUIUtility.hotControl;
  const position = handlePosition();
  const rotation = handleRotation();
  EditorGUI.beginChangeCheck();
  const after = BuiltinHandles.rotation(ids, rotation, position);
  const changed = EditorGUI.endChangeCheck();
  begin(before, ids, 'Rotate', position, rotation);
  if (changed && session && ids.includes(session.id)) {
    session.handleRotation = after;
    applyRotation();
  }
}

let toolScale = Vector3.one;

function scaleTool() {
  const ids = controlIds(4);
  const before = GUIUtility.hotControl;
  const position = handlePosition();
  // One object scales along its own axes; several along the handle's.
  const rotation =
    session?.handleRotation ??
    (Selection.transforms.length > 1 ? Tools.handleRotation : Selection.activeTransform!.rotation);
  if (Event.current.type === EventType.MouseDown) toolScale = Vector3.one;
  EditorGUI.beginChangeCheck();
  toolScale = BuiltinHandles.scale(ids, toolScale, position, rotation, HandleUtility.getHandleSize(position));
  const changed = EditorGUI.endChangeCheck();
  begin(before, ids, 'Scale', position, rotation);
  if (changed && session && ids.includes(session.id)) applyScale(toolScale, rotation);
}

let transformScale = Vector3.one;

function transformTool() {
  const ids = { p: controlIds(7), r: controlIds(5), s: controlIds(4) };
  const all = [...ids.p, ...ids.r, ...ids.s];
  const before = GUIUtility.hotControl;
  const position = handlePosition();
  const rotation = handleRotation();
  if (Event.current.type === EventType.MouseDown) transformScale = Vector3.one;
  EditorGUI.beginChangeCheck();
  const end = BuiltinHandles.transform(ids, position, rotation, transformScale);
  const changed = EditorGUI.endChangeCheck();
  transformScale = end.scale;
  const hot = GUIUtility.hotControl;
  begin(before, all, ids.p.includes(hot) ? 'Move' : ids.r.includes(hot) ? 'Rotate' : 'Scale', position, rotation);
  if (!changed || !session || !all.includes(session.id)) return;
  if (session.kind === 'Move') applyMove(end.position.sub(session.pivot));
  else if (session.kind === 'Rotate') {
    session.handleRotation = end.rotation;
    applyRotation();
  } else applyScale(end.scale, session.handleRotation);
}

export const UnityToolHandles = {
  install() {
    // The Editor's V and Shift+V; Blendon's own vertex snapping takes the keys in its tool context.
    ShortcutManager.registerNative(
      VertexSnapId,
      (args) => {
        const id = GUIUtility.hotControl;
        if (args.stage === ShortcutStage.Begin) enableVertexSnapping(id);
        else disableVertexSnapping(id);
      },
      true,
      'V',
      true,
    );
    ShortcutManager.registerNative(
      VertexSnapToggleId,
      () => {
        const id = GUIUtility.hotControl;
        if (Tools.vertexDragging) disableVertexSnapping(id);
        else enableVertexSnapping(id);
      },
      false,
      'Shift+V',
    );
  },

  onGUI(_view: SceneView) {
    endIfReleased();
    if (Tools.hidden || !Selection.activeTransform || Selection.transforms.length === 0) {
      if (session && GUIUtility.hotControl === session.id) GUIUtility.hotControl = 0;
      endIfReleased();
      return;
    }
    cancelOnEscape();
    // The handle follows the cursor to the selection's nearest vertex until a drag takes it.
    if (Tools.vertexDragging && GUIUtility.hotControl === 0 && Event.current.type === EventType.Layout) {
      updateVertexOffset();
      keptOffset = handleOffset;
    }
    const saved = Handles.color;
    switch (session?.tool ?? Tools.current) {
      case Tool.Move:
        moveTool();
        break;
      case Tool.Rotate:
        rotateTool();
        break;
      case Tool.Scale:
        scaleTool();
        break;
      case Tool.Transform:
        transformTool();
        break;
    }
    Handles.color = saved;
  },
};
