// Installs every Blendon feature into the running Scene view, in the order their scene GUI hooks
// subscribe (which is the order they see each event).
import { ShortcutManager, Undo } from '../unity/editor.ts';
import { TransformGizmo } from './gizmos/composite/transform-gizmo.ts';
import { MoveGizmo } from './gizmos/move/move-gizmo.ts';
import { MoveGrab } from './gizmos/move/move-grab.ts';
import { RotateGizmo } from './gizmos/rotate/rotate-gizmo.ts';
import { RotateGrab } from './gizmos/rotate/rotate-grab.ts';
import { ScaleGizmo } from './gizmos/scale/scale-gizmo.ts';
import { ScaleGrab } from './gizmos/scale/scale-grab.ts';
import { VertexSnappingUtility } from './gizmos/vertex-snapping.ts';
import { GizmoRegistry, ViewportGesture } from './gizmos/viewport-gesture.ts';
import { OrbitSelected } from './navigation/orbit-selected.ts';
import { Pan } from './navigation/pan.ts';
import { QuickRoll } from './navigation/quick-roll.ts';
import { ViewportNav } from './navigation/viewport-nav.ts';
import { Zoom } from './navigation/zoom.ts';
import { PieMenus } from './piemenus/built-in-pies.ts';
import { FrameSelected } from './scenetools/frame-selected.ts';
import { SelectionHistory, ViewHistory } from './scenetools/history.ts';
import { IsolateView } from './scenetools/isolate-view.ts';
import { BoxSelect } from './scenetools/box-select.ts';
import { ClickSelectParent, HierarchyWalk } from './scenetools/selection-tools.ts';
import { SnapToFloor } from './scenetools/snap-to-floor.ts';
import { ShortcutParking } from './shortcut-parking.ts';
import { ShortcutTipCard } from './shortcut-tips.ts';
import { SceneTutorialCard } from './tutorial/scene-tutorial.ts';
import { EditorEdit } from './scenetools/scene-menu/editor-menu.ts';
import { SceneMenu } from './scenetools/scene-menu/scene-menu.ts';

let installed = false;

/** Unity's own Undo/Redo keys; a running grab or pie menu keeps the view to itself. */
function installEditorUndo() {
  ShortcutManager.register('Edit/Undo', () => !ViewportGesture.busy && Undo.performUndo(), false, 'Ctrl+Z');
  ShortcutManager.register('Edit/Redo', () => !ViewportGesture.busy && Undo.performRedo(), false, 'Ctrl+Y');
}

export function installBlendon() {
  if (installed) return;
  installed = true;
  installEditorUndo();
  // A switched-off feature's keys go back to the Editor's commands; those stand down while Blendon's
  // grab takes its keys (Y for the Y axis) or a pie menu owns the view.
  ShortcutManager.parked = (id) => ShortcutParking.isParked(id);
  ShortcutManager.standDown = (id) => ViewportGesture.claimed(id) || ViewportGesture.busy;
  // A handle drag or a box takes the keys it understands (X/Y/Z, digits, G/R/S) before any shortcut.
  // Modal grabs already take theirs through ViewportGesture.claimed.
  ShortcutManager.dragActive = () =>
    (GizmoRegistry.anyManipulation() && !GizmoRegistry.hasModalSession()) || BoxSelect.isDragging;
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
  BoxSelect.install();
  EditorEdit.install();
  SceneMenu.install();
  SceneTutorialCard.install();
  ShortcutTipCard.install();
  // Last, so an open menu draws over every gizmo.
  PieMenus.install();
}
