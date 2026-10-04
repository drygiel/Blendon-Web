// Installs every Blendon feature into the running Scene view, in the order their scene GUI hooks
// subscribe (which is the order they see each event).
import { ShortcutManager, Tool, Tools, Undo } from '../unity/editor.ts';
import { TransformGizmo } from './gizmos/composite/transform-gizmo.ts';
import { MoveGizmo } from './gizmos/move/move-gizmo.ts';
import { MoveGrab } from './gizmos/move/move-grab.ts';
import { RotateGizmo } from './gizmos/rotate/rotate-gizmo.ts';
import { RotateGrab } from './gizmos/rotate/rotate-grab.ts';
import { ScaleGizmo } from './gizmos/scale/scale-gizmo.ts';
import { ScaleGrab } from './gizmos/scale/scale-grab.ts';
import { VertexSnappingUtility } from './gizmos/vertex-snapping.ts';
import { ViewportGesture } from './gizmos/viewport-gesture.ts';
import { OrbitSelected } from './navigation/orbit-selected.ts';
import { Pan } from './navigation/pan.ts';
import { QuickRoll } from './navigation/quick-roll.ts';
import { ViewportNav } from './navigation/viewport-nav.ts';
import { Zoom } from './navigation/zoom.ts';
import { PieMenus } from './piemenus/built-in-pies.ts';
import { FrameSelected } from './scenetools/frame-selected.ts';
import { SelectionHistory, ViewHistory } from './scenetools/history.ts';
import { IsolateView } from './scenetools/isolate-view.ts';
import { ClickSelectParent, HierarchyWalk } from './scenetools/selection-tools.ts';
import { SnapToFloor } from './scenetools/snap-to-floor.ts';
import { SceneTutorialCard } from './tutorial/scene-tutorial.ts';

let installed = false;

/** Unity's own Undo/Redo keys; a running grab or pie menu keeps the view to itself. */
function installEditorUndo() {
  ShortcutManager.register('Edit/Undo', () => !ViewportGesture.busy && Undo.performUndo(), false, 'Ctrl+Z');
  ShortcutManager.register('Edit/Redo', () => !ViewportGesture.busy && Undo.performRedo(), false, 'Ctrl+Y');
}

/** Unity's own tool keys for the tools Blendon replaces (R and S belong to Blendon's grabs). */
function installToolKeys() {
  const keys: [string, Tool, string][] = [
    ['Tools/Move', Tool.Move, 'W'],
    ['Tools/Rotate', Tool.Rotate, 'E'],
    ['Tools/Transform', Tool.Transform, 'Y'],
  ];
  // A running grab is offered the key first: Y is its axis lock.
  for (const [id, tool, key] of keys)
    ShortcutManager.register(
      id,
      () => !ViewportGesture.claimed(id) && !ViewportGesture.busy && (Tools.current = tool),
      false,
      key,
    );
}

export function installBlendon() {
  if (installed) return;
  installed = true;
  installEditorUndo();
  installToolKeys();
  OrbitSelected.install();
  QuickRoll.install();
  Pan.install();
  Zoom.install();
  ViewportNav.install();
  VertexSnappingUtility.install();
  // Each tool gizmo and grab subscribes to the Scene view as it is first built.
  void MoveGizmo.instance;
  void RotateGizmo.instance;
  void ScaleGizmo.instance;
  void TransformGizmo.instance;
  for (const grab of [MoveGrab, RotateGrab, ScaleGrab]) {
    grab.install();
    void grab.instance;
  }
  for (const tool of [FrameSelected, IsolateView, SnapToFloor, SelectionHistory, ViewHistory, HierarchyWalk])
    tool.install();
  ClickSelectParent.install();
  SceneTutorialCard.install();
  // Last, so an open menu draws over every gizmo.
  PieMenus.install();
}
