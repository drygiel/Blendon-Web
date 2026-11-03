// HierarchyWalk ([ and ], Shift to extend) and ClickSelectParent (clicking the selected object again
// walks up to its parent) - Box Select's two selection helpers, gated by its page.
import { EditorApplication, Selection, ShortcutManager, Tool, Tools, Undo } from '../../unity/editor.ts';
import { HandleUtility } from '../../unity/handles.ts';
import { Event, EventModifiers, EventType, GUIUtility } from '../../unity/imgui.ts';
import { Vector2 } from '../../unity/math.ts';
import type { GameObject, Transform } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { SceneTutorial, ShortcutTips } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { blendonContextActive } from '../tool-context.ts';
import { BoxSelectSettings } from './settings.ts';

// One the Scene view hides (Hide, Isolate) is never a step's target.
function isHidden(t: Transform) {
  return t.gameObject.scene.isHidden(t.gameObject);
}

/** The parent a step up may select, none when the Scene view hides it. */
function parentOf(t: Transform) {
  const parent = t.parent;
  return parent && !isHidden(parent) ? parent : null;
}

// Selection.objects makes its first entry active, so the lead goes to the front.
function commit(next: GameObject[], lead: GameObject | null, undoName: string) {
  if (lead) {
    const i = next.indexOf(lead);
    if (i >= 0) next.splice(i, 1);
    next.unshift(lead);
  }
  Undo.incrementCurrentGroup();
  Selection.set(next, next[0] ?? null);
  Undo.setCurrentGroupName(undoName);
}

export const HierarchyWalk = {
  ParentShortcutId: 'Blendon/Box Select/Select Parent',
  ChildrenShortcutId: 'Blendon/Box Select/Select Children',
  AddParentShortcutId: 'Blendon/Box Select/Add Parent',
  AddChildrenShortcutId: 'Blendon/Box Select/Add Children',

  install() {
    const H = HierarchyWalk;
    const keys: [string, string, boolean, boolean][] = [
      [H.ParentShortcutId, '[', false, false],
      [H.ChildrenShortcutId, ']', true, false],
      [H.AddParentShortcutId, 'Shift+[', false, true],
      [H.AddChildrenShortcutId, 'Shift+]', true, true],
    ];
    for (const [id, key, down, extend] of keys)
      ShortcutManager.register(
        id,
        () => {
          if (!BoxSelectSettings.Enabled || !BoxSelectSettings.HierarchyKeys) return;
          if (ViewportGesture.claimed(id) || ViewportGesture.busy) return;
          // Before the step, a task's needs read the selection it started from.
          SceneTutorial.reportShortcut(id);
          H.apply(down, extend);
          ShortcutTips.note(id);
        },
        false,
        key,
      );
  },

  apply(down: boolean, extend: boolean) {
    const selected = Selection.gameObjects;
    if (selected.length === 0) return;
    const next: GameObject[] = [];
    const take = (go: GameObject) => !next.includes(go) && next.push(go);
    if (extend) selected.forEach(take);
    const active = Selection.activeGameObject;
    let lead: GameObject | null = null;
    for (const go of selected) {
      let moved = false;
      if (down) {
        for (const child of go.transform.children) {
          if (isHidden(child)) continue;
          take(child.gameObject);
          if (!moved && go === active) lead = child.gameObject;
          moved = true;
        }
      } else if (parentOf(go.transform)) {
        const parent = parentOf(go.transform)!.gameObject;
        take(parent);
        if (go === active) lead = parent;
        moved = true;
      }
      // Nothing to step to, so the object keeps its place instead of dropping out.
      if (!moved) take(go);
    }
    if (!lead && active && next.includes(active)) lead = active;
    commit(next, lead, down ? 'Select Children' : 'Select Parent');
  },

  /** The selection and everything below it. */
  applySubtree() {
    const selected = Selection.gameObjects;
    if (selected.length === 0) return;
    const next: GameObject[] = [];
    for (const go of selected)
      for (const t of go.transform.walk())
        if ((t === go.transform || !isHidden(t)) && !next.includes(t.gameObject)) next.push(t.gameObject);
    commit(next, Selection.activeGameObject, 'Select Hierarchy');
  },

  canStepDown: () => Selection.gameObjects.some((go) => go.transform.children.some((c) => !isHidden(c))),
  canStepUp: () => Selection.gameObjects.some((go) => !!parentOf(go.transform)),
};

// Further than this between press and release is a drag, not a click.
const ClickSlop = 5;
const HeldKeys = EventModifiers.Shift | EventModifiers.Control | EventModifiers.Alt | EventModifiers.Command;

let pressView: SceneView | null = null;
let pressAt = Vector2.zero;
let selectedAtPress: GameObject | null = null;
let handleHeld = false;

export const ClickSelectParent = {
  install() {
    SceneView.beforeSceneGui.add((view) => {
      const e = Event.current;
      if (e.button !== 0) return;
      // The Editor picks on release, so at the press this is still the selection the click started from.
      if (e.rawType === EventType.MouseDown) {
        pressView = view;
        pressAt = e.mousePosition;
        selectedAtPress = Selection.count === 1 ? Selection.activeGameObject : null;
        handleHeld = false;
      } else if (e.rawType === EventType.MouseUp && view === pressView) {
        // A handle keeps hotControl until it sees its own release, which comes after this.
        handleHeld = GUIUtility.hotControl !== 0;
      }
    });
    SceneView.duringSceneGui.add((view) => {
      const e = Event.current;
      if (e.rawType !== EventType.MouseUp || e.button !== 0 || view !== pressView) return;
      const previous = selectedAtPress;
      pressView = null;
      selectedAtPress = null;
      // A handle's still click comes back through handleClickWalk.
      if (handleHeld) return;
      // Unity's own picking outside Blendon's context.
      if (!blendonContextActive()) return;
      if (e.mousePosition.sub(pressAt).sqrMagnitude > ClickSlop * ClickSlop) return;
      if (Tools.current === Tool.View || Tools.viewToolActive) return;
      const hit = hitUnder(previous, e.mousePosition, e.modifiers);
      if (!hit) return;
      const next = nextOf(previous!, hit);
      Selection.activeGameObject = next;
      // The Editor's own pick may land after this event; only that pick is overridden.
      EditorApplication.delayCall(() => {
        const active = Selection.activeGameObject;
        if (active !== next && active === hit) Selection.activeGameObject = next;
      });
    });
    ViewportGesture.handleClickWalk = onHandleClick;
  },
};

// The gizmos hand a still click on a handle to the pick, so it walks like a click beside the handle.
function onHandleClick(position: Vector2): GameObject[] | null {
  const previous = Selection.count === 1 ? Selection.activeGameObject : null;
  const hit = hitUnder(previous, position, Event.current.modifiers);
  if (!hit) return null;
  const next = nextOf(previous!, hit);
  return next === previous ? null : [next];
}

// Only a click on the selected object, or on something under it, walks up.
function hitUnder(previous: GameObject | null, position: Vector2, modifiers: number) {
  if (!previous || (modifiers & HeldKeys) !== 0) return null;
  if (!BoxSelectSettings.Enabled || !BoxSelectSettings.ClickSelectsParent) return null;
  const hit = HandleUtility.pickGameObject(position, false) as GameObject | null;
  return hit && hit.transform.isChildOf(previous.transform) ? hit : null;
}

// Past the top the walk wraps to the object under the cursor, so the parts below stay reachable.
function nextOf(previous: GameObject, hit: GameObject) {
  const parent = parentOf(previous.transform);
  // Before the selection moves, a task's needs read the object that was clicked.
  if (parent) SceneTutorial.report('ClickSelectedParent');
  return parent?.gameObject ?? hit;
}
