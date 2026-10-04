// HierarchyWalk ([ and ], Shift to extend) and ClickSelectParent (clicking the selected object again
// walks up to its parent) - Box Select's two selection helpers, gated by its page.
import { EditorApplication, Selection, ShortcutManager, Tool, Tools, Undo } from '../../unity/editor.ts';
import { HandleUtility } from '../../unity/handles.ts';
import { Event, EventModifiers, EventType, GUIUtility } from '../../unity/imgui.ts';
import { Vector2 } from '../../unity/math.ts';
import type { GameObject } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { ShortcutTips } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { BoxSelectSettings } from './settings.ts';

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
  ParentShortcutId: 'Blendon/Select Parent',
  ChildrenShortcutId: 'Blendon/Select Children',
  AddParentShortcutId: 'Blendon/Add Parent To Selection',
  AddChildrenShortcutId: 'Blendon/Add Children To Selection',

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
          take(child.gameObject);
          if (!moved && go === active) lead = child.gameObject;
          moved = true;
        }
      } else if (go.transform.parent) {
        const parent = go.transform.parent.gameObject;
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
      for (const t of go.transform.walk()) if (!next.includes(t.gameObject)) next.push(t.gameObject);
    commit(next, Selection.activeGameObject, 'Select Hierarchy');
  },

  canStepDown: () => Selection.gameObjects.some((go) => go.transform.children.length > 0),
  canStepUp: () => Selection.gameObjects.some((go) => !!go.transform.parent),
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
      if (!previous || handleHeld || (e.modifiers & HeldKeys) !== 0) return;
      if (!BoxSelectSettings.Enabled || !BoxSelectSettings.ClickSelectsParent) return;
      if (e.mousePosition.sub(pressAt).sqrMagnitude > ClickSlop * ClickSlop) return;
      if (Tools.current === Tool.View || Tools.viewToolActive) return;
      // Only a click on the selected object, or on something under it, walks up.
      const hit = HandleUtility.pickGameObject(e.mousePosition, false) as GameObject | null;
      if (!hit || !hit.transform.isChildOf(previous.transform)) return;
      // Past the top the walk wraps to the object under the cursor, so the parts below stay reachable.
      const next = previous.transform.parent?.gameObject ?? hit;
      Selection.activeGameObject = next;
      // The Editor's own pick may land after this event; only that pick is overridden.
      EditorApplication.delayCall(() => {
        const active = Selection.activeGameObject;
        if (active !== next && active === hit) Selection.activeGameObject = next;
      });
    });
  },
};
