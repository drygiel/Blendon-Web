// SceneMenu: Blendon's right-click menu for the Scene view - the Editor's own entries regrouped, an
// icon row for the edit commands, a search box, and Blendon's extras. SceneMenuTrigger opens it on a
// right click that didn't drag; Shift+right-click opens the Editor's own menu instead.
import { EditorApplication, Selection, ShortcutManager, Undo } from '../../../unity/editor.ts';
import { EditorGUIUtility, HandleUtility, MouseCursor } from '../../../unity/handles.ts';
import { Event, EventType, GUIUtility, KeyCode } from '../../../unity/imgui.ts';
import { Rect, Vector2, Vector3, type Quaternion } from '../../../unity/math.ts';
import type { PrimitiveType } from '../../../unity/primitives.ts';
import { GameObject, SceneVisibilityManager } from '../../../unity/scene.ts';
import { SceneView } from '../../../unity/sceneview.ts';
import { ModalViewportGate } from '../../foundation.ts';
import { ViewportGesture } from '../../gizmos/viewport-gesture.ts';
import { ResetActions, SpawnPlacement } from '../../piemenus/actions.ts';
import { FrameSelected, unityFrameSelected } from '../frame-selected.ts';
import { HierarchyWalk } from '../selection-tools.ts';
import { FrameSelectedSettings, SceneMenuEditActions, SceneMenuSettings, SnapToFloorSettings } from '../settings.ts';
import { SnapToFloor } from '../snap-to-floor.ts';
import { captureEditorMenu, type SceneMenuSnapshot } from './editor-menu.ts';
import { buildClassicModel, buildModel, Group, MenuNode, type MenuExtra } from './model.ts';
import { MenuSession, type MenuPanel } from './session.ts';

const ShortcutId = 'Blendon/Context Menu';
const GateOwner = {};

let session: MenuSession | null = null;
// What Repeat points at: an entry's own key, or the path an Editor entry was run from.
let lastKey = '';
let version = 0;
const listeners = new Set<() => void>();

/** The header's two text fields: the search box and, once the title is clicked, the rename box. */
export const MenuField = { search: '', renaming: false, rename: '', renameTarget: null as GameObject | null };

function changed() {
  version++;
  for (const l of listeners) l();
  session?.view.repaint();
}

// ---- Blendon's extras (SceneMenuCatalog) ----

const command = (key: string, label: string, icon: string, run: () => void, available: boolean, staysOpen = false) => {
  const n = new MenuNode(key, label, null);
  n.command = run;
  n.available = available;
  n.staysOpen = staysOpen;
  n.setIcon(icon);
  return n;
};

const folder = (key: string, label: string, icon: string, available: boolean, ...children: MenuNode[]) => {
  const n = new MenuNode(key, label, null);
  n.available = available;
  n.setIcon(icon);
  n.children.push(...children);
  return n;
};

const entry = (group: Group, node: MenuNode, prepend = false): MenuExtra => ({ group, node, prepend });

function rows(group: Group, prepend: boolean, inline: boolean, ...nodes: MenuNode[]) {
  for (const n of nodes) n.inline = inline;
  return nodes.map((n) => entry(group, n, prepend));
}

// Transform clipboard: world position, rotation and scale of the active object.
let copiedTransform: { position: Vector3; rotation: Quaternion; scale: Vector3 } | null = null;

const Creatable: [string, PrimitiveType | null, string, boolean][] = [
  ['Empty', null, 'd_GameObject Icon', true],
  ['Cube', 'Cube', 'd_PreMatCube', true],
  ['Sphere', 'Sphere', 'd_PreMatSphere', true],
  ['Cylinder', 'Cylinder', 'd_PreMatCylinder', true],
  ['Plane', 'Plane', 'd_PreMatQuad', true],
  ['Light', null, 'd_Light Icon', false],
  ['Camera', null, 'd_Camera Icon', false],
  ['Particle System', null, 'd_ParticleSystem Icon', false],
];

interface CatalogGroup {
  on: () => boolean;
  name: string;
  entries: (ctx: { view: SceneView; cursor: Vector2; selected: number; built: MenuExtra[] }) => MenuExtra[];
}

const Catalog: CatalogGroup[] = [
  {
    name: 'AddObject',
    on: () => SceneMenuSettings.AddObject,
    entries: ({ view, cursor }) => [
      entry(
        Group.Extra,
        folder(
          'Blendon/Add',
          'Add',
          'd_Toolbar Plus',
          true,
          ...Creatable.map(([label, mesh, icon, available]) =>
            command(
              'Blendon/Add/' + label,
              label,
              icon,
              () => {
                // Where the right-click landed, resolved the way the Add pie resolves its own point.
                SpawnPlacement.aim(view, cursor);
                SpawnPlacement.create(label, mesh);
              },
              available,
            ),
          ),
        ),
      ),
    ],
  },
  {
    name: 'FrameSelected',
    on: () => SceneMenuSettings.FrameSelected,
    entries: ({ view, selected }) => {
      const n = command(
        'Blendon/Frame',
        'Frame Selected',
        'd_Grid.BoxTool',
        () => (FrameSelectedSettings.Enabled ? FrameSelected.run() : unityFrameSelected(view)),
        selected > 0,
      );
      n.hotkey = ShortcutManager.bindingText(FrameSelected.ShortcutId);
      return [entry(Group.Align, n)];
    },
  },
  {
    name: 'SnapToFloor',
    on: () => SceneMenuSettings.SnapToFloor,
    entries: ({ selected }) => {
      const n = command(
        'Blendon/SnapToFloor',
        'Snap to Floor',
        'd_SnapIncrement',
        () => SnapToFloor.run(),
        selected > 0 && SnapToFloorSettings.Enabled,
      );
      n.hotkey = ShortcutManager.bindingText(SnapToFloor.ShortcutId);
      return [entry(Group.Transform, n)];
    },
  },
  {
    name: 'ResetTransform',
    on: () => SceneMenuSettings.ResetTransform,
    entries: () => {
      const t = Selection.transforms;
      const p = ResetActions.applies(t, true, false, false);
      const r = ResetActions.applies(t, false, true, false);
      const s = ResetActions.applies(t, false, false, true);
      const any = p || r || s;
      const reset = (pp: boolean, rr: boolean, ss: boolean) => () =>
        ResetActions.apply(Selection.transforms, pp, rr, ss);
      return [
        entry(
          Group.Transform,
          folder(
            'Blendon/Reset',
            'Reset',
            'd_TransformTool',
            any,
            command('Blendon/Reset/Position', 'Position', 'd_MoveTool', reset(true, false, false), p),
            command('Blendon/Reset/Rotation', 'Rotation', 'd_RotateTool', reset(false, true, false), r),
            command('Blendon/Reset/Scale', 'Scale', 'd_ScaleTool', reset(false, false, true), s),
            command('Blendon/Reset/All', 'All', 'd_TransformTool', reset(true, true, true), any),
          ),
        ),
      ];
    },
  },
  {
    name: 'AlignToActive',
    on: () => SceneMenuSettings.AlignToActive,
    entries: ({ selected }) => {
      const ok = selected > 1;
      return [
        entry(
          Group.Transform,
          folder(
            'Blendon/Align',
            'Align to Active',
            'd_ToolHandlePivot',
            ok,
            command('Blendon/Align/Position', 'Position', 'd_MoveTool', () => alignToActive(true, false), ok),
            command('Blendon/Align/Rotation', 'Rotation', 'd_RotateTool', () => alignToActive(false, true), ok),
            command('Blendon/Align/Both', 'Both', 'd_ToolHandlePivot', () => alignToActive(true, true), ok),
          ),
        ),
      ];
    },
  },
  {
    name: 'TransformClipboard',
    on: () => SceneMenuSettings.TransformClipboard,
    entries: ({ selected }) =>
      rows(
        Group.Transform,
        false,
        SceneMenuSettings.TransformClipboardInline,
        command('Blendon/CopyTransform', 'Copy Transform', 'Copy', copyTransform, !!Selection.activeTransform),
        command(
          'Blendon/PasteTransform',
          'Paste Transform',
          'Paste',
          pasteTransform,
          selected > 0 && !!copiedTransform,
        ),
      ),
  },
  {
    name: 'HideAndShow',
    on: () => SceneMenuSettings.HideAndShow,
    entries: ({ selected }) =>
      rows(
        Group.Visibility,
        false,
        SceneMenuSettings.HideAndShowInline,
        command('Blendon/Hide', 'Hide', 'd_scenevis_hidden', () => visibility('hide'), selected > 0),
        command(
          'Blendon/HideOthers',
          'Hide Others',
          'd_scenevis_hidden-mixed',
          () => visibility('others'),
          selected > 0,
        ),
        command('Blendon/ShowAll', 'Show All', 'd_scenevis_visible', () => visibility('all'), true),
      ),
  },
  {
    name: 'Grouping',
    on: () => SceneMenuSettings.Grouping,
    entries: ({ selected }) =>
      rows(
        Group.Object,
        true,
        SceneMenuSettings.GroupingInline,
        command('Blendon/Group', 'Group', 'd_Folder Icon', group, selected > 0),
        command(
          'Blendon/Unparent',
          'Unparent',
          'd_FolderOpened Icon',
          unparent,
          Selection.transforms.some((t) => !!t.parent),
        ),
      ),
  },
  {
    name: 'SelectRelated',
    on: () => SceneMenuSettings.SelectRelated,
    entries: ({ selected }) => {
      const down = selected > 0 && HierarchyWalk.canStepDown();
      const up = selected > 0 && HierarchyWalk.canStepUp();
      const nodes = [
        command(
          'Blendon/Select/Children',
          'Children',
          'd_UnityEditor.SceneHierarchyWindow',
          () => HierarchyWalk.apply(true, false),
          down,
        ),
        command(
          'Blendon/Select/Hierarchy',
          'Hierarchy',
          'd_UnityEditor.SceneHierarchyWindow',
          () => HierarchyWalk.applySubtree(),
          down,
        ),
        command('Blendon/Select/Parent', 'Parent', 'd_GameObject Icon', () => HierarchyWalk.apply(false, false), up),
      ];
      if (!SceneMenuSettings.SelectRelatedInline)
        return [entry(Group.Object, folder('Blendon/Select', 'Select', 'd_RectTool', selected > 0, ...nodes), true)];
      for (const n of nodes) n.caption = 'Select';
      return rows(Group.Object, true, true, ...nodes);
    },
  },
  // Last, so it can point at any of the entries above as well as at the Editor's own.
  {
    name: 'RepeatLast',
    on: () => SceneMenuSettings.RepeatLast,
    entries: ({ built }) => [entry(Group.Extra, repeatEntry(built))],
  },
];

function find(node: MenuNode, key: string): MenuNode | null {
  if (node.key === key) return node;
  for (const c of node.children) {
    const m = find(c, key);
    if (m) return m;
  }
  return null;
}

function repeatEntry(built: MenuExtra[]) {
  if (lastKey) {
    for (const extra of built) {
      const m = find(extra.node, lastKey);
      if (m?.command) return command(m.key, 'Repeat ' + m.label, 'd_Refresh', m.command, m.enabled);
    }
    for (const item of session?.snapshot.items ?? pendingSnapshot?.items ?? [])
      if (item.path === lastKey)
        return command(item.path, 'Repeat ' + item.label, 'd_Refresh', item.execute, item.enabled);
  }
  return command('Blendon/Repeat', 'Repeat Last', 'd_Refresh', () => {}, false);
}

let pendingSnapshot: SceneMenuSnapshot | null = null;

function buildExtras(view: SceneView, cursor: Vector2, renameTarget: GameObject | null): MenuExtra[] {
  const built: MenuExtra[] = [];
  const byGroup = new Map<string, MenuExtra[]>();
  const ctx = { view, cursor, selected: Selection.count, built };
  let rename: MenuExtra | null = null;
  if (renameTarget) {
    rename = entry(Group.Quick, command('Blendon/Rename', 'Rename', 'Rename', beginRename, true, true));
    built.push(rename);
  }
  for (const g of Catalog) {
    if (!g.on()) continue;
    const entries = g.entries(ctx);
    built.push(...entries);
    byGroup.set(g.name, entries);
  }
  // Handed on in the user's order, which only ever moves an entry inside its own section.
  const order = SceneMenuSettings.ExtraOrderText.split(',').filter(Boolean);
  const names = [
    ...order.filter((n) => byGroup.has(n)),
    ...Catalog.map((g) => g.name).filter((n) => !order.includes(n)),
  ];
  const ordered: MenuExtra[] = rename ? [rename] : [];
  for (const n of names) ordered.push(...(byGroup.get(n) ?? []));
  return ordered;
}

// ---- Blendon's own commands (SceneMenuActions) ----

function record(name: string) {
  Undo.incrementCurrentGroup();
  for (const t of Selection.transforms) Undo.recordObject(t, name);
}

function copyTransform() {
  const a = Selection.activeTransform;
  if (a) copiedTransform = { position: a.position, rotation: a.rotation, scale: a.lossyScale };
}

function pasteTransform() {
  const c = copiedTransform;
  if (!c) return;
  record('Paste Transform');
  for (const t of Selection.transforms) {
    t.position = c.position;
    t.rotation = c.rotation;
    // Undoes the parent's scale per axis; a rotated, non-uniformly scaled parent is approximated.
    const p = t.parent?.lossyScale;
    const div = (v: number, by: number) => (Math.abs(by) < 1e-6 ? v : v / by);
    t.localScale = p ? new Vector3(div(c.scale.x, p.x), div(c.scale.y, p.y), div(c.scale.z, p.z)) : c.scale;
  }
}

function alignToActive(position: boolean, rotation: boolean) {
  const active = Selection.activeTransform;
  if (!active) return;
  const p = active.position;
  const r = active.rotation;
  // Parents first: moving a parent after its child would carry the child off the target again.
  const depth = (t: typeof active) => {
    let d = 0;
    for (let x = t.parent; x; x = x.parent) d++;
    return d;
  };
  const targets = [...Selection.transforms].sort((a, b) => depth(a) - depth(b));
  Undo.incrementCurrentGroup();
  for (const t of targets) {
    if (t === active) continue;
    Undo.recordObject(t, 'Align to Active');
    if (position) t.position = p;
    if (rotation) t.rotation = r;
  }
}

function visibility(what: 'hide' | 'others' | 'all') {
  const v = SceneVisibilityManager;
  if (what === 'hide') v.hide(Selection.gameObjects, true);
  else if (what === 'others') {
    v.hideAll();
    v.show(Selection.gameObjects, true);
  } else v.showAll();
  SceneView.repaintAll();
}

function group() {
  // Unity's GameObject/Create Empty Parent: a new parent at the selection's centre.
  const sel = Selection.transforms;
  if (sel.length === 0) return;
  const scene = sel[0].gameObject.scene;
  Undo.incrementCurrentGroup();
  Undo.recordSelection();
  const parent = new GameObject(scene, 'GameObject', sel[0].parent);
  Undo.registerCreatedObjectUndo(parent, 'Create Empty Parent');
  let c = Vector3.zero;
  for (const t of sel) c = c.add(t.position);
  parent.transform.position = c.div(sel.length);
  for (const t of sel) Undo.setTransformParent(t, parent.transform, 'Create Empty Parent');
  Selection.set([parent], parent, false);
}

function unparent() {
  Undo.incrementCurrentGroup();
  for (const t of Selection.transforms) if (t.parent) Undo.setTransformParent(t, null, 'Unparent');
}

// ---- open, close, run ----

function describe() {
  const sel = Selection.gameObjects;
  if (sel.length === 1) return { target: sel[0], title: sel[0].name, icon: 'd_GameObject Icon' };
  return {
    target: null,
    title: sel.length > 1 ? `${sel.length} Objects` : 'Scene',
    icon: sel.length > 1 ? 'd_GameObject Icon' : 'd_UnityEditor.SceneView',
  };
}

let titleIcon = 'd_GameObject Icon';

function beginRename() {
  if (!MenuField.renameTarget) return;
  if (MenuField.search) {
    MenuField.search = '';
    session?.refilter('');
  }
  MenuField.renaming = true;
  MenuField.rename = MenuField.renameTarget.name;
  changed();
}

function run(node: MenuNode) {
  if (!node.enabled || node.demoOnly) return;
  if (node.command) {
    if (node.staysOpen) {
      node.command();
      return;
    }
    lastKey = node.key;
    const c = node.command;
    SceneMenu.close();
    // After the menu has let go of the view, the way the Editor's own menu leaves it.
    EditorApplication.delayCall(c);
    return;
  }
  const item = node.item;
  if (!item?.enabled) return;
  lastKey = item.path;
  SceneMenu.close();
  EditorApplication.delayCall(item.execute);
}

function activate(panelIndex: number, row: number, column: number) {
  const s = session!;
  const r = s.panels[panelIndex].rows[row];
  switch (r.kind) {
    case 'quick':
      if (column >= 0 && column < s.model.quick.length) run(s.model.quick[column]);
      break;
    case 'inline':
      if (column >= 0 && column < r.nodes!.length) run(r.nodes![column]);
      break;
    case 'classic': {
      const { view, cursor } = s;
      SceneMenu.close();
      SceneMenu.open(view, cursor, true);
      break;
    }
    case 'item':
      if (r.node!.isFolder) {
        s.openFlyout(panelIndex, row);
        s.active = panelIndex + 1;
        const opened = s.panels[s.active];
        opened.selected = opened.nextSelectable(1);
      } else run(r.node!);
      break;
  }
  changed();
}

function headingInto(flyout: MenuPanel, p: Vector2, delta: Vector2) {
  const towards = flyout.rect.center.x > p.x ? delta.x > 0 : delta.x < 0;
  return towards && Math.abs(delta.x) >= Math.abs(delta.y) * 0.5;
}

export const SceneMenu = {
  ShortcutId,
  get isOpen() {
    return session != null;
  },
  get session() {
    return session;
  },
  get titleIcon() {
    return titleIcon;
  },
  get version() {
    return version;
  },
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  open(view: SceneView, cursor: Vector2, classic = false) {
    SceneMenu.close();
    MenuField.search = '';
    MenuField.renaming = false;
    const snapshot = captureEditorMenu();
    pendingSnapshot = snapshot;
    const d = describe();
    MenuField.renameTarget = d.target;
    titleIcon = d.icon;
    const iconRow = SceneMenuSettings.EditActions === SceneMenuEditActions.IconRow;
    const model = classic
      ? buildClassicModel(snapshot)
      : buildModel(snapshot, iconRow, buildExtras(view, cursor, d.target));
    pendingSnapshot = null;
    session = new MenuSession(view, cursor, snapshot, model, d.title, SceneMenuSettings.ClassicMenuRow, classic);
    session.place('', SceneMenuSettings.SearchField);
    ModalViewportGate.claim(GateOwner);
    changed();
  },

  close() {
    const s = session;
    if (!s) return;
    session = null;
    MenuField.search = '';
    MenuField.renaming = false;
    ModalViewportGate.release(GateOwner);
    changed();
    s.view.repaint();
  },

  /** Clicking the header's name, the same as the icon row's Rename. */
  beginRename() {
    beginRename();
  },

  setSearch(text: string) {
    if (!session) return;
    MenuField.search = text;
    session.refilter(text);
    changed();
  },

  setRename(text: string) {
    MenuField.rename = text;
    changed();
  },

  commitRename() {
    const target = MenuField.renameTarget;
    const name = MenuField.rename.trim();
    MenuField.renaming = false;
    if (session && target && name && name !== target.name) {
      Undo.incrementCurrentGroup();
      Undo.recordObject(target, 'Rename Object');
      target.name = name;
      session.title = name;
    }
    changed();
  },

  endRename() {
    MenuField.renaming = false;
    changed();
  },

  /** Hover at a point in view coordinates: the row under it, and the flyout it opens. */
  hover(p: Vector2) {
    const s = session;
    if (!s) return;
    const delta = p.sub(s.lastPoint);
    s.lastPoint = p;
    for (let k = s.panels.length - 1; k >= 0; k--) {
      const panel = s.panels[k];
      if (!panel.contains(p)) continue;
      const row = panel.rowAt(p);
      // Crossing the parent on the way into its open submenu must not swap that submenu out.
      if (k + 1 < s.panels.length && row !== s.panels[k + 1].parentRow && headingInto(s.panels[k + 1], p, delta))
        return;
      s.active = k;
      if (row < 0 || !rowSelectableAt(panel, row)) panel.selected = -1;
      else {
        const columns = s.columns(panel, row);
        panel.selected = row;
        panel.column = columns > 0 ? panel.columnAt(row, p, columns) : -1;
        if (panel.rows[row].node?.isFolder) s.openFlyout(k, row);
        else s.closeFrom(k + 1);
      }
      changed();
      return;
    }
  },

  /** A press in view coordinates; off the menu it closes it, as a click outside a Blender menu does. */
  press(p: Vector2, button: number) {
    const s = session;
    if (!s) return;
    for (let k = s.panels.length - 1; k >= 0; k--) {
      const panel = s.panels[k];
      if (!panel.contains(p)) continue;
      if (button !== 0) return;
      if (MenuField.renaming) SceneMenu.endRename();
      const row = panel.rowAt(p);
      if (row < 0 || !rowSelectableAt(panel, row)) return;
      const columns = s.columns(panel, row);
      activate(k, row, columns > 0 ? panel.columnAt(row, p, columns) : -1);
      return;
    }
    SceneMenu.close();
  },

  scroll(p: Vector2, deltaY: number) {
    const s = session;
    if (!s) return;
    for (let k = s.panels.length - 1; k >= 0; k--) {
      if (!s.panels[k].contains(p)) continue;
      s.panels[k].scrollBy(deltaY);
      s.closeFrom(k + 1);
      changed();
      return;
    }
  },

  /** Keys the menu answers to; true when it used the key. */
  key(code: string) {
    const s = session;
    if (!s) return false;
    if (MenuField.renaming) {
      if (code === 'Enter' || code === 'NumpadEnter') SceneMenu.commitRename();
      else if (code === 'Escape') SceneMenu.endRename();
      else return false;
      return true;
    }
    const panel = s.panels[s.active];
    const step = (dir: number) => {
      const columns = s.columns(panel, panel.selected);
      if (columns > 0) {
        panel.column = Math.max(0, Math.min(columns - 1, panel.column + dir));
        return;
      }
      if (dir < 0) {
        if (s.active > 0) s.closeFrom(s.active);
        return;
      }
      if (panel.selected < 0 || !panel.rows[panel.selected].node?.isFolder) return;
      s.openFlyout(s.active, panel.selected);
      s.active++;
      const opened = s.panels[s.active];
      opened.selected = opened.nextSelectable(1);
    };
    switch (code) {
      case 'ArrowDown':
      case 'ArrowUp': {
        panel.selected = panel.nextSelectable(code === 'ArrowDown' ? 1 : -1);
        panel.reveal(panel.selected);
        s.closeFrom(s.active + 1);
        // A row of buttons keeps the column the last one was on, as far as it reaches.
        const columns = s.columns(panel, panel.selected);
        panel.column = columns > 0 ? Math.max(0, Math.min(columns - 1, panel.column)) : -1;
        break;
      }
      case 'Enter':
      case 'NumpadEnter':
        if (panel.selected >= 0) activate(s.active, panel.selected, panel.column);
        break;
      // With text in the box the arrows belong to the caret.
      case 'ArrowRight':
        if (MenuField.search) return false;
        step(1);
        break;
      case 'ArrowLeft':
        if (MenuField.search) return false;
        step(-1);
        break;
      case 'Escape':
        if (s.active > 0) s.closeFrom(s.active);
        else if (MenuField.search) SceneMenu.setSearch('');
        else SceneMenu.close();
        break;
      default:
        return false;
    }
    changed();
    return true;
  },

  install() {
    SceneView.beforeSceneGui.add(onBeforeSceneGui);
    SceneView.duringSceneGui.add(onDuringSceneGui);
    Selection.selectionChanged.add(() => SceneMenu.close());
    EditorApplication.focusChanged.add((focused) => !focused && SceneMenu.close());
  },
};

function rowSelectableAt(panel: MenuPanel, row: number) {
  const r = panel.rows[row];
  return r.kind === 'item' ? r.node!.enabled : r.kind === 'quick' || r.kind === 'inline' || r.kind === 'classic';
}

// ---- trigger: a right click that didn't drag ----

// The classic menu's click-against-drag rule; the plain click uses the same slop here.
const ClickSlop = 4;
let armed = false;
let classic = false;
let pressedAt = Vector2.zero;
let heldButtons = 0;

const gestureRunning = () => heldButtons !== 0 || ViewportGesture.busy;

function onBeforeSceneGui(view: SceneView) {
  const e = Event.current;
  const s = session;
  if (s && s.view === view) {
    // The menu owns the view while it is open; the page's own elements take hover and clicks on it.
    switch (e.type) {
      case EventType.MouseMove:
      case EventType.MouseDrag:
        SceneMenu.hover(e.mousePosition);
        e.use();
        return;
      case EventType.MouseDown:
        SceneMenu.press(e.mousePosition, e.button);
        e.use();
        return;
      case EventType.MouseUp:
      case EventType.ScrollWheel:
      case EventType.ValidateCommand:
      case EventType.ExecuteCommand:
        e.use();
        return;
      case EventType.KeyDown:
        SceneMenu.key(keyName(e.keyCode));
        e.use();
        return;
      case EventType.KeyUp:
        e.use();
        return;
    }
    return;
  }
  // rawType, so a press or release some other handler already used still resets the gesture.
  switch (e.rawType) {
    case EventType.MouseDown:
      if (e.button === 1) {
        pressedAt = e.mousePosition;
        // Shift+right-click is the classic menu.
        classic = e.shift;
        armed = SceneMenuSettings.Enabled && !gestureRunning() && !e.control && !e.alt && !e.command;
      } else heldButtons |= 1 << e.button;
      break;
    case EventType.MouseMove:
      heldButtons = 0;
      break;
    case EventType.MouseDrag:
      if (armed && e.button === 1 && e.mousePosition.sub(pressedAt).sqrMagnitude > ClickSlop * ClickSlop) armed = false;
      break;
    // A key while the button is held is fly-through (WASD), not the start of a click.
    case EventType.KeyDown:
      armed = false;
      break;
    case EventType.MouseUp:
      if (e.button !== 1) {
        heldButtons &= ~(1 << e.button);
        break;
      }
      if (!armed) break;
      armed = false;
      if (e.mousePosition.sub(pressedAt).sqrMagnitude > ClickSlop * ClickSlop || gestureRunning()) break;
      SceneMenu.open(view, pressedAt, classic);
      e.use();
      break;
  }
}

function onDuringSceneGui(view: SceneView) {
  // Reserved every pass, so the id stays stable across the Layout/MouseDown cycle.
  const id = GUIUtility.getControlID(0);
  if (!session || session.view !== view) return;
  if (Event.current.type === EventType.Layout) HandleUtility.addDefaultControl(id);
  EditorGUIUtility.addCursorRect(new Rect(0, 0, view.position.width, view.position.height), MouseCursor.Arrow);
}

const KeyNames: Record<number, string> = {
  [KeyCode.UpArrow]: 'ArrowUp',
  [KeyCode.DownArrow]: 'ArrowDown',
  [KeyCode.RightArrow]: 'ArrowRight',
  [KeyCode.LeftArrow]: 'ArrowLeft',
  [KeyCode.Return]: 'Enter',
  [KeyCode.KeypadEnter]: 'NumpadEnter',
  [KeyCode.Escape]: 'Escape',
};

const keyName = (keyCode: number) => KeyNames[keyCode] ?? '';
