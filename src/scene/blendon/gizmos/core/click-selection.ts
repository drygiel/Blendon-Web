// ClickSelection: what a click on a handle does to the selection, the way the Scene view's own click does it.
import { Selection, ShortcutModifiers, eventShortcutModifiers } from '../../../unity/editor.ts';
import { HandleUtility } from '../../../unity/handles.ts';
import type { Event } from '../../../unity/imgui.ts';
import type { Vector2 } from '../../../unity/math.ts';
import type { GameObject, Transform } from '../../../unity/scene.ts';

/** Shift adds, Ctrl/Cmd toggles, like the Scene view's picking. */
export const ClickMode = { Replace: 0, Add: 1, Toggle: 2 } as const;
export type ClickMode = (typeof ClickMode)[keyof typeof ClickMode];

export const ClickSelection = {
  /** Null for Shift+Ctrl, which none of the Editor's click bindings covers. */
  modeOf(ev: Event): ClickMode | null {
    const held = eventShortcutModifiers(ev);
    const add = (held & ShortcutModifiers.Shift) !== 0;
    const toggle = (held & ShortcutModifiers.Action) !== 0;
    if (add && toggle) return null;
    return add ? ClickMode.Add : toggle ? ClickMode.Toggle : ClickMode.Replace;
  },

  /** The selection after a click at position, or null when it stays. Needs a scene pass, where the pick has a camera. */
  resolve(position: Vector2, ev: Event): GameObject[] | null {
    const mode = ClickSelection.modeOf(ev);
    if (mode == null) return null;
    // The demo has no prefabs or [SelectionBase], so the root pick is the object itself.
    const root = HandleUtility.pickGameObject(position, true) as GameObject | null;
    const raw =
      mode === ClickMode.Replace ? null : (HandleUtility.pickGameObject(position, false) as GameObject | null);
    return ClickSelection.plan(mode, Selection.objects, Selection.activeGameObject, raw, root);
  },

  /**
   * The picks and the current selection in, the selection to write out, its first entry active. Null when the click
   * changes nothing. raw is the object under the cursor, root what a plain click there selects.
   */
  plan(
    mode: ClickMode,
    selection: GameObject[],
    active: GameObject | null,
    raw: GameObject | null,
    root: GameObject | null,
    isMarked: (go: GameObject) => boolean = () => false,
  ): GameObject[] | null {
    switch (mode) {
      // Clicking the active object leaves a multi-selection alone, a handle drawn over it is no pick.
      case ClickMode.Replace:
        return !root || root === active ? null : [root];
      // Shift on the active object takes it out.
      case ClickMode.Add:
        return raw && raw === active ? without(selection, active, [raw]) : lead(selection, root);
      default: {
        if (!raw) return null;
        const hits = selectedOnTheWayUp(selection, raw, isMarked);
        return hits.length ? without(selection, active, hits) : lead(selection, root);
      }
    }
  },

  /** Where a click on gameObject stops climbing: the nearest marked one. Null when it climbs to the top. */
  selectionBaseOf(gameObject: GameObject, isMarked: (go: GameObject) => boolean): Transform | null {
    for (let t: Transform | null = gameObject.transform; t; t = t.parent) if (isMarked(t.gameObject)) return t;
    return null;
  },
};

// Selected objects from the one clicked up to its base. Ctrl on any of them takes it out.
function selectedOnTheWayUp(selection: GameObject[], raw: GameObject, isMarked: (go: GameObject) => boolean) {
  const hits: GameObject[] = [];
  const stop = ClickSelection.selectionBaseOf(raw, isMarked);
  for (let t: Transform | null = raw.transform; t; t = t.parent) {
    if (selection.includes(t.gameObject)) hits.push(t.gameObject);
    if (t === stop) break;
  }
  return hits;
}

// Added at the front so it becomes active.
function lead(selection: GameObject[], added: GameObject | null) {
  if (!added) return null;
  const next = [added, ...selection.filter((o) => o !== added)];
  return next.length === selection.length && next.every((o, i) => o === selection[i]) ? null : next;
}

// The active object leads again if it survives, else the first one left does.
function without(selection: GameObject[], active: GameObject | null, removed: GameObject[]) {
  const next = selection.filter((o) => !removed.includes(o));
  if (next.length === selection.length) return null;
  if (active && next.includes(active)) return [active, ...next.filter((o) => o !== active)];
  return next;
}
