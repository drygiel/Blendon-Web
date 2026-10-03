// The Editor's own Scene view picking and box select (RectSelection), which Blendon builds on: a click
// picks what is under the cursor, a drag sends the begin command whose hotControl Blendon's box takes.
import { EditorApplication, Selection, ShortcutManager, eventShortcutModifiers } from '../unity/editor.ts';
import { GUI, HandleUtility } from '../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility, KeyCode } from '../unity/imgui.ts';
import { Color, Rect, Vector2 } from '../unity/math.ts';
import { raycastAll } from '../unity/raycast.ts';
import type { GameObject } from '../unity/scene.ts';
import type { SceneView } from '../unity/sceneview.ts';
import type { SceneHost } from './host.ts';

export const BEGIN_COMMAND = 'SetRectSelectionHotControlEventCommand';
const DRAG_THRESHOLD = 6;

export const BoxSelectIds = {
  BoxSelect: 'Scene View/Box Select',
  Add: 'Scene View/Add Box Select',
  Invert: 'Scene View/Invert Box Select',
};

// The Editor's defaults; only their modifiers matter (the button is always the left one).
ShortcutManager.register(BoxSelectIds.BoxSelect, () => {}, true, 'Mouse 0');
ShortcutManager.register(BoxSelectIds.Add, () => {}, true, 'Shift+Mouse 0');
ShortcutManager.register(BoxSelectIds.Invert, () => {}, true, 'Ctrl+Mouse 0');

export class UnitySelection {
  private readonly host: SceneHost;
  private press: Vector2 | null = null;
  private dragging = false;
  private boxStart = Vector2.zero;
  private boxEnd = Vector2.zero;
  private baseline: GameObject[] = [];
  private lastClick: { at: Vector2; time: number; hits: GameObject[]; index: number } | null = null;

  constructor(host: SceneHost) {
    this.host = host;
  }

  onGUI(view: SceneView) {
    const ev = Event.current;
    const id = GUIUtility.getControlID(FocusType.Passive);

    switch (ev.type) {
      case EventType.Layout:
        HandleUtility.addDefaultControl(id);
        break;

      case EventType.MouseDown:
        if (ev.button === 0 && HandleUtility.nearestControl === id && GUIUtility.hotControl === 0 && !ev.alt) {
          this.press = ev.mousePosition;
          this.dragging = false;
        }
        break;

      case EventType.MouseDrag:
        if (this.press && !this.dragging && GUIUtility.hotControl === 0) {
          if (ev.mousePosition.sub(this.press).magnitude < DRAG_THRESHOLD) break;
          this.dragging = true;
          if (this.boxBinding(ev)) this.beginBox(ev);
        }
        if (this.dragging && GUIUtility.hotControl === id) {
          this.boxEnd = ev.mousePosition;
          this.applyBox(ev);
          ev.use();
          view.repaint();
        }
        break;

      case EventType.ExecuteCommand:
        // The Editor's box takes the drag on its own command; Blendon may take it straight back.
        if (ev.commandName === BEGIN_COMMAND && this.press) GUIUtility.hotControl = id;
        break;

      case EventType.MouseUp:
        if (ev.button !== 0 || !this.press) break;
        if (!this.dragging && GUIUtility.hotControl === 0 && HandleUtility.nearestControl === id) {
          this.click(ev);
          ev.use();
        }
        if (GUIUtility.hotControl === id) {
          GUIUtility.hotControl = 0;
          ev.use();
        }
        this.press = null;
        this.dragging = false;
        view.repaint();
        break;

      case EventType.MouseMove:
        this.press = null;
        break;

      case EventType.Repaint:
        if (this.dragging && GUIUtility.hotControl === id) {
          const r = this.rect();
          GUI.drawRect(r, new Color(1, 1, 1, 0.08));
          const ctx = GUI.ctx;
          if (ctx) {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1;
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
          }
        }
        break;
    }
  }

  private boxBinding(ev: Event) {
    const mods = eventShortcutModifiers(ev);
    return Object.values(BoxSelectIds).some((sid) => ShortcutManager.matches(sid, KeyCode.Mouse0, mods));
  }

  private beginBox(ev: Event) {
    this.boxStart = this.press!;
    this.boxEnd = ev.mousePosition;
    this.baseline = Selection.objects;
    const cmd = ev.clone(EventType.ExecuteCommand);
    cmd.commandName = BEGIN_COMMAND;
    // Sent from inside this pass, as the Editor does from its shortcut handler.
    this.host.runPass(cmd);
  }

  private rect() {
    const a = this.boxStart,
      b = this.boxEnd;
    return Rect.minMax(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
  }

  /** The Editor's own box: live, Shift adds, the action key removes. */
  private applyBox(ev: Event) {
    const hits = HandleUtility.pickRectObjects(this.rect()) as GameObject[];
    let next: GameObject[];
    if (ev.shift) next = [...new Set([...this.baseline, ...hits])];
    else if (ev.actionKey) next = this.baseline.filter((o) => !hits.includes(o));
    else next = hits;
    Selection.set(next, next.at(-1) ?? null, false);
  }

  private click(ev: Event) {
    const ray = HandleUtility.guiPointToWorldRay(ev.mousePosition);
    const hits = raycastAll(this.host.scene, ray).map((h) => h.gameObject);
    // Clicking the same spot again steps to the next object behind, as the Editor's picking does.
    let index = 0;
    const lc = this.lastClick;
    const now = EditorApplication.timeSinceStartup;
    if (lc && lc.at.sub(ev.mousePosition).magnitude < 3 && sameList(lc.hits, hits) && !ev.shift && !ev.actionKey)
      index = (lc.index + 1) % Math.max(1, hits.length);
    this.lastClick = { at: ev.mousePosition, time: now, hits, index };
    const picked = hits[index] ?? null;

    if (ev.shift || ev.actionKey) {
      if (!picked) return;
      const cur = Selection.objects;
      if (cur.includes(picked)) {
        const rest = cur.filter((o) => o !== picked);
        Selection.set(rest, Selection.activeGameObject === picked ? (rest.at(-1) ?? null) : Selection.activeGameObject);
      } else Selection.set([...cur, picked], picked);
      return;
    }
    Selection.set(picked ? [picked] : [], picked);
  }
}

function sameList(a: GameObject[], b: GameObject[]) {
  return a.length === b.length && a.every((o, i) => o === b[i]);
}
