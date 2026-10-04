// The Editor's own Scene view context menu (GameObjectToolContext.PopulateMenu) for the browser scene:
// what the right-click menu reads in, plus the edit commands and keys it lists. Entries that need a
// window the page doesn't have (Add Component, Properties) or grid placement look as in Unity but do nothing.
import { Selection, ShortcutManager, Undo, EditorSnapSettings } from '../../../unity/editor.ts';
import { Quaternion, Vector3 } from '../../../unity/math.ts';
import {
  instantiate,
  SceneVisibilityManager,
  type GameObject,
  type Scene,
  type Transform,
} from '../../../unity/scene.ts';
import { SceneView } from '../../../unity/sceneview.ts';
import { ViewportGesture } from '../../gizmos/viewport-gesture.ts';

export interface SceneMenuItem {
  path: string;
  label: string;
  folderPath: string;
  root: string;
  hotkey: string;
  separatorBefore: boolean;
  enabled: boolean;
  /** Looks as in Unity, does nothing here: no grid placement or windows in the browser. */
  demoOnly?: boolean;
  checked: boolean;
  execute: () => void;
}

export interface SceneMenuSnapshot {
  items: SceneMenuItem[];
  /** Top segments that are a component's own submenu. */
  componentRoots: Set<string>;
}

// Unity's menu hotkey suffix: % action key, # Shift, & Alt, _ no modifier.
function hotkeyText(token: string) {
  if (!token) return '';
  const mods: string[] = [];
  let i = 0;
  for (; i < token.length - 1; i++) {
    const m = { '%': 'Ctrl', '^': 'Ctrl', '#': 'Shift', '&': 'Alt', _: '' }[token[i]];
    if (m === undefined) break;
    if (m) mods.push(m);
  }
  const key = token.slice(i);
  const named: Record<string, string> = { DEL: 'Del', HOME: 'Home', END: 'End' };
  return [...mods, named[key.toUpperCase()] ?? (key.length === 1 ? key.toUpperCase() : key)].join('+');
}

function item(name: string, run: () => void, enabled = true, separatorBefore = false): SceneMenuItem {
  const space = name.lastIndexOf(' ');
  const suffix = space > 0 && '%^#&_'.includes(name[space + 1]);
  const path = suffix ? name.slice(0, space) : name;
  const slash = path.lastIndexOf('/');
  const first = path.indexOf('/');
  return {
    path,
    label: slash >= 0 ? path.slice(slash + 1) : path,
    folderPath: slash >= 0 ? path.slice(0, slash) : '',
    root: first >= 0 ? path.slice(0, first) : path,
    hotkey: suffix ? hotkeyText(name.slice(space + 1)) : '',
    separatorBefore,
    enabled,
    checked: false,
    execute: run,
  };
}

const demoOnly = (i: SceneMenuItem): SceneMenuItem => ({ ...i, demoOnly: true });

// ---- edit commands ----

let clipboard: GameObject[] = [];

function uniqueSiblingName(parent: Transform | null, scene: Scene, name: string) {
  const siblings = new Set((parent ? parent.children : scene.roots).map((t) => t.gameObject.name));
  if (!siblings.has(name)) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  let i = 1;
  while (siblings.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

function copies(sources: GameObject[], parentOf: (go: GameObject) => Transform | null, undoName: string) {
  if (sources.length === 0) return;
  Undo.incrementCurrentGroup();
  Undo.recordSelection();
  const made = sources.map((src) => {
    const parent = parentOf(src);
    const go = instantiate(src, uniqueSiblingName(parent, src.scene, src.name), parent);
    Undo.registerCreatedObjectUndo(go, undoName);
    return go;
  });
  Selection.set(made, made[made.length - 1], false);
  Undo.setCurrentGroupName(undoName);
}

const topLevel = () => Selection.transforms.map((t) => t.gameObject);

export const EditorEdit = {
  get hasClipboard() {
    return clipboard.length > 0;
  },

  copy: () => {
    clipboard = topLevel();
  },

  cut: () => {
    EditorEdit.copy();
    EditorEdit.delete();
  },

  paste: () => {
    copies(clipboard, () => null, 'Paste');
  },

  duplicate: () => {
    copies(topLevel(), (go) => go.transform.parent, 'Duplicate Objects');
  },

  delete: () => {
    const doomed = topLevel();
    if (doomed.length === 0) return;
    Undo.incrementCurrentGroup();
    Undo.recordSelection();
    for (const go of doomed) Undo.destroyObjectImmediate(go);
    Selection.set([], null, false);
    Undo.setCurrentGroupName('Delete');
    SceneView.repaintAll();
  },

  /** Unity's edit keys, which reach the Scene view as commands rather than shortcuts. */
  install() {
    const keys: [string, string, () => void][] = [
      ['Edit/Cut', 'Ctrl+X', EditorEdit.cut],
      ['Edit/Copy', 'Ctrl+C', EditorEdit.copy],
      ['Edit/Paste', 'Ctrl+V', EditorEdit.paste],
      ['Edit/Duplicate', 'Ctrl+D', EditorEdit.duplicate],
      ['Edit/Delete', 'Delete', EditorEdit.delete],
    ];
    for (const [id, key, run] of keys) ShortcutManager.register(id, () => !ViewportGesture.busy && run(), false, key);
  },
};

// ---- the menu's other entries ----

function record(name: string) {
  Undo.incrementCurrentGroup();
  for (const t of Selection.transforms) Undo.recordObject(t, name);
}

function moveToView() {
  const v = SceneView.lastActiveSceneView;
  if (!v) return;
  const ts = Selection.transforms;
  let center = Vector3.zero;
  for (const t of ts) center = center.add(t.position);
  center = center.div(ts.length);
  record('Move to View');
  for (const t of ts) t.position = t.position.add(v.pivot.sub(center));
}

function alignWithView() {
  const v = SceneView.lastActiveSceneView;
  if (!v) return;
  record('Align with View');
  for (const t of Selection.transforms) {
    t.position = v.camera.position;
    t.rotation = v.camera.rotation;
  }
}

function moveToGrid() {
  const g = EditorSnapSettings.gridSize;
  const r = (v: number, s: number) => Math.round(v / s) * s;
  record('Move to Closest Grid Point');
  for (const t of Selection.transforms)
    t.position = new Vector3(r(t.position.x, g.x), r(t.position.y, g.y), r(t.position.z, g.z));
}

function alignToGrid() {
  record('Align to Grid Rotation');
  for (const t of Selection.transforms) t.rotation = EditorSnapSettings.gridRotation;
}

// Transform's own context menu: copy, paste and reset per property.
type Channel = 'Position' | 'Rotation' | 'Scale';
let copied: { Position?: Vector3; Rotation?: Quaternion; Scale?: Vector3; world?: [Vector3, Quaternion, Vector3] } = {};

function transformItems(active: Transform): SceneMenuItem[] {
  const read = (c: Channel) =>
    c === 'Position' ? active.localPosition : c === 'Rotation' ? active.localRotation : active.localScale;
  const atRest = (t: Transform, c: Channel) =>
    c === 'Position'
      ? t.localPosition.equals(Vector3.zero)
      : c === 'Rotation'
        ? t.localRotation.equals(Quaternion.identity)
        : t.localScale.equals(Vector3.one);
  const write = (c: Channel, name: string, value: () => Vector3 | Quaternion) => () => {
    record(name);
    for (const t of Selection.transforms) {
      const v = value();
      if (c === 'Position') t.localPosition = v as Vector3;
      else if (c === 'Rotation') t.localRotation = v as Quaternion;
      else t.localScale = v as Vector3;
    }
  };
  const channels: Channel[] = ['Position', 'Rotation', 'Scale'];
  const rest = { Position: Vector3.zero, Rotation: Quaternion.identity, Scale: Vector3.one };
  return [
    ...channels.map((c) => item(`Transform/Copy/${c}`, () => (copied = { ...copied, [c]: read(c) }))),
    item(
      'Transform/Copy/World Transform',
      () => (copied = { ...copied, world: [active.position, active.rotation, active.lossyScale] }),
      true,
      true,
    ),
    item(
      'Transform/Copy/Component',
      () => (copied = { Position: active.localPosition, Rotation: active.localRotation, Scale: active.localScale }),
      true,
      true,
    ),
    ...channels.map((c) =>
      item(
        `Transform/Paste/${c}`,
        write(c, 'Paste ' + c, () => copied[c]!),
        !!copied[c],
      ),
    ),
    item(
      'Transform/Paste/World Transform',
      () => {
        const w = copied.world;
        if (!w) return;
        record('Paste World Transform');
        for (const t of Selection.transforms) {
          t.position = w[0];
          t.rotation = w[1];
        }
      },
      !!copied.world,
      true,
    ),
    item('Transform/Paste/Component As New', () => {}, false, true),
    item(
      'Transform/Paste/Component Values',
      () => {
        record('Paste Component Values');
        for (const t of Selection.transforms) {
          if (copied.Position) t.localPosition = copied.Position;
          if (copied.Rotation) t.localRotation = copied.Rotation;
          if (copied.Scale) t.localScale = copied.Scale;
        }
      },
      !!(copied.Position && copied.Rotation && copied.Scale),
    ),
    ...channels.map((c) =>
      item(
        `Transform/Reset Property/${c}`,
        write(c, 'Reset ' + c, () => rest[c]),
        Selection.transforms.some((t) => !atRest(t, c)),
      ),
    ),
  ];
}

export function captureEditorMenu(): SceneMenuSnapshot {
  const any = Selection.count > 0;
  const isolated = SceneVisibilityManager.isCurrentStageIsolated();
  const items: SceneMenuItem[] = [
    item('Cut %x', EditorEdit.cut, any),
    item('Copy %c', EditorEdit.copy, any),
    item('Paste %v', EditorEdit.paste, EditorEdit.hasClipboard),
    item('Duplicate %d', EditorEdit.duplicate, any),
    item('Delete _DEL', EditorEdit.delete, any),
    item('Move to View %&f', moveToView, any, true),
    item('Align with View %#f', alignWithView, any),
    item('Move to Closest Grid Point', moveToGrid, any),
    item('Align to Grid Rotation', alignToGrid, any),
    // The grid's own placement is not something the browser grid can move to.
    demoOnly(item('Grid/Move to Active Object Position', () => {})),
    demoOnly(item('Grid/Align to Active Object Rotation', () => {})),
    demoOnly(item('Grid/Move to Handle Position', () => {})),
    demoOnly(item('Grid/Align to Handle Rotation', () => {})),
    item('Grid/Reset to World', () => {}, false, true),
    item('Grid/Apply Last Custom Values', () => {}, false),
    isolated
      ? item('Exit Isolation', () => SceneVisibilityManager.exitIsolation(), true, true)
      : item('Isolate', () => SceneVisibilityManager.isolate(Selection.gameObjects, true), any, true),
    demoOnly(item('Add Component... %#a', () => {}, true, true)),
    demoOnly(item('Properties... _&P', () => {})),
  ];
  const componentRoots = new Set<string>();
  const active = Selection.activeTransform;
  if (active) {
    items.push(...transformItems(active));
    componentRoots.add('Transform');
  }
  return { items, componentRoots };
}
