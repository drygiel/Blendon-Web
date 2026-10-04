// Editor services the tools lean on: EditorApplication's clock and update loop, Selection, Undo,
// Tools, EditorSnapSettings, settings (EditorPrefs) and the Shortcut Manager.
import { Event, EventType, IS_MAC, KeyCode, keyCodeName } from './imgui.ts';
import { Bounds, Quaternion, Vector3 } from './math.ts';
import type { GameObject, Scene, Transform, TransformState } from './scene.ts';
import { Hook } from './sceneview.ts';

// ---- EditorApplication ----------------------------------------------------------------------------

type Callback = () => void;

class CallbackList {
  private list: Callback[] = [];
  add(cb: Callback) {
    if (!this.list.includes(cb)) this.list.push(cb);
    EditorApplication.wake();
  }
  remove(cb: Callback) {
    const i = this.list.indexOf(cb);
    if (i >= 0) this.list.splice(i, 1);
  }
  get count() {
    return this.list.length;
  }
  invoke() {
    for (const cb of [...this.list]) cb();
  }
}

export const EditorApplication = {
  get timeSinceStartup() {
    return performance.now() / 1000;
  },
  update: new CallbackList(),
  hierarchyChanged: new CallbackList(),
  focusChanged: new Hook<boolean>(),
  delayed: [] as Callback[],
  /** Set by the host: makes sure a frame runs soon. */
  wake: () => {},
  delayCall(cb: Callback) {
    EditorApplication.delayed.push(cb);
    EditorApplication.wake();
  },
  isCompiling: false,
  isUpdating: false,
  isPlaying: false,

  /** One editor tick: delayCalls, then update subscribers. */
  tick() {
    const d = EditorApplication.delayed.splice(0);
    for (const cb of d) cb();
    EditorApplication.update.invoke();
  },

  get busy() {
    return EditorApplication.update.count > 0 || EditorApplication.delayed.length > 0;
  },
};

// ---- Tools --------------------------------------------------------------------------------------------

export const Tool = { None: -1, View: 0, Move: 1, Rotate: 2, Scale: 3, Rect: 4, Transform: 5, Custom: 6 } as const;
export type Tool = (typeof Tool)[keyof typeof Tool];
export const PivotMode = { Center: 0, Pivot: 1 } as const;
export const PivotRotation = { Local: 0, Global: 1 } as const;

const toolListeners = new Set<Callback>();

export const Tools = {
  _current: Tool.Move as Tool,
  get current(): Tool {
    return Tools._current;
  },
  set current(t: Tool) {
    if (t === Tools._current) return;
    Tools._current = t;
    for (const l of toolListeners) l();
  },
  _pivotMode: PivotMode.Center as number,
  get pivotMode() {
    return Tools._pivotMode;
  },
  set pivotMode(v: number) {
    Tools._pivotMode = v;
    for (const l of toolListeners) l();
  },
  _pivotRotation: PivotRotation.Global as number,
  get pivotRotation() {
    return Tools._pivotRotation;
  },
  set pivotRotation(v: number) {
    Tools._pivotRotation = v;
    for (const l of toolListeners) l();
  },
  hidden: false,
  viewToolActive: false,
  vertexDragging: false,
  visibleLayers: -1,
  lockedLayers: 0,

  /** Unity's handle position: the selection's bounds centre (Center) or the active pivot (Pivot). */
  get handlePosition(): Vector3 {
    const active = Selection.activeTransform;
    if (!active) return Vector3.zero;
    if (Tools.pivotMode === PivotMode.Pivot) return active.position;
    let b: Bounds | null = null;
    for (const t of Selection.transforms) {
      for (const d of t.walk()) {
        const rb = d.gameObject.bounds;
        if (!rb) continue;
        b = b ? b.encapsulate(rb) : rb;
      }
      if (!b) b = new Bounds(t.position, Vector3.zero);
      else b = b.encapsulate(t.position);
    }
    return b ? b.center : active.position;
  },

  get handleRotation(): Quaternion {
    const active = Selection.activeTransform;
    return Tools.pivotRotation === PivotRotation.Local && active ? active.rotation : Quaternion.identity;
  },

  onChange(cb: Callback) {
    toolListeners.add(cb);
    return () => void toolListeners.delete(cb);
  },
};

// ---- Selection -----------------------------------------------------------------------------------------

export const SelectionMode = { Unfiltered: 0, TopLevel: 1, Deep: 2, ExcludePrefab: 4, Editable: 8 } as const;

export const Selection = {
  _objects: [] as GameObject[],
  _active: null as GameObject | null,
  selectionChanged: new CallbackList(),
  version: 0,

  get objects(): GameObject[] {
    return [...this._objects];
  },
  set objects(list: GameObject[]) {
    Selection.set(list, list.includes(Selection._active!) ? Selection._active : (list[list.length - 1] ?? null));
  },
  get gameObjects() {
    return Selection.objects;
  },
  get count() {
    return Selection._objects.length;
  },
  get activeGameObject() {
    return Selection._active;
  },
  set activeGameObject(go: GameObject | null) {
    Selection.set(go ? [go] : [], go);
  },
  get activeObject() {
    return Selection._active;
  },
  set activeObject(go: GameObject | null) {
    Selection.activeGameObject = go;
  },
  get activeTransform(): Transform | null {
    return Selection._active?.transform ?? null;
  },
  set activeTransform(t: Transform | null) {
    Selection.activeGameObject = t?.gameObject ?? null;
  },
  /** Top-level transforms: a selected child of a selected parent is left out, as in Unity. */
  get transforms(): Transform[] {
    return Selection.getTransforms(SelectionMode.TopLevel);
  },

  getTransforms(mode: number): Transform[] {
    const all = Selection._objects.map((o) => o.transform);
    if (mode & SelectionMode.Deep) {
      const out: Transform[] = [];
      for (const t of all) for (const d of t.walk()) if (!out.includes(d)) out.push(d);
      return out;
    }
    if (mode & SelectionMode.TopLevel) return all.filter((t) => !all.some((o) => o !== t && t.isChildOf(o)));
    return all;
  },

  contains(go: GameObject) {
    return Selection._objects.includes(go);
  },

  /** Replaces the selection; records an undo step the way the Editor does. */
  set(list: GameObject[], active: GameObject | null, recordUndo = true) {
    const same =
      list.length === Selection._objects.length &&
      list.every((o, i) => o === Selection._objects[i]) &&
      active === Selection._active;
    if (same) return;
    if (recordUndo) Undo.recordSelection();
    Selection._objects = [...new Set(list)];
    Selection._active = active && Selection._objects.includes(active) ? active : (Selection._objects.at(-1) ?? null);
    Selection.version++;
    Selection.selectionChanged.invoke();
  },
};

// ---- Undo ----------------------------------------------------------------------------------------------

interface Snapshot {
  transforms: Map<Transform, { state: TransformState; parent: Transform | null; index: number }>;
  objects: Map<GameObject, { hidden: boolean; active: boolean; name: string }>;
  created: GameObject[];
  selection: { objects: GameObject[]; active: GameObject | null } | null;
}

interface UndoGroup {
  name: string;
  id: number;
  before: Snapshot;
  after: Snapshot | null;
}

const emptySnapshot = (): Snapshot => ({ transforms: new Map(), objects: new Map(), created: [], selection: null });

let scene: Scene | null = null;
let groupCounter = 1;
let currentGroup = 1;
let open: UndoGroup | null = null;
const undoStack: UndoGroup[] = [];
const redoStack: UndoGroup[] = [];

function captureTransform(t: Transform) {
  return { state: t.snapshot(), parent: t.parent, index: t.getSiblingIndex() };
}

function applySnapshot(s: Snapshot, undoingCreation: boolean) {
  for (const [t, v] of s.transforms) {
    if (t.parent !== v.parent) t.setParent(v.parent, false);
    t.restore(v.state);
  }
  for (const [o, v] of s.objects) {
    o.hidden = v.hidden;
    o.activeSelf = v.active;
    o.name = v.name;
  }
  if (s.created.length && scene)
    for (const go of s.created) {
      if (undoingCreation) scene.destroy(go);
      else scene.revive(go, go.transform.parent, Infinity);
    }
  if (s.selection) Selection.set(s.selection.objects, s.selection.active, false);
}

/** The state a group's before-snapshot touched, read now - its redo target. */
function captureLike(s: Snapshot): Snapshot {
  const out = emptySnapshot();
  for (const t of s.transforms.keys()) out.transforms.set(t, captureTransform(t));
  for (const o of s.objects.keys()) out.objects.set(o, { hidden: o.hidden, active: o.activeSelf, name: o.name });
  out.created = s.created;
  if (s.selection) out.selection = { objects: Selection.objects, active: Selection.activeGameObject };
  return out;
}

function ensureOpen(name: string) {
  if (open && open.id === currentGroup) return open;
  open = { name, id: currentGroup, before: emptySnapshot(), after: null };
  undoStack.push(open);
  redoStack.length = 0;
  Undo.changed();
  return open;
}

export const Undo = {
  undoRedoPerformed: new CallbackList(),
  listeners: new Set<Callback>(),

  init(s: Scene) {
    scene = s;
  },

  changed() {
    for (const l of Undo.listeners) l();
  },

  recordObject(target: Transform | GameObject, name: string) {
    const g = ensureOpen(name);
    if (!g.name) g.name = name;
    if ('transform' in target && 'scene' in target) {
      const go = target;
      if (!g.before.objects.has(go))
        g.before.objects.set(go, { hidden: go.hidden, active: go.activeSelf, name: go.name });
      if (!g.before.transforms.has(go.transform)) g.before.transforms.set(go.transform, captureTransform(go.transform));
    } else {
      const t = target;
      if (!g.before.transforms.has(t)) g.before.transforms.set(t, captureTransform(t));
    }
  },

  recordObjects(targets: (Transform | GameObject)[], name: string) {
    for (const t of targets) Undo.recordObject(t, name);
  },

  registerCreatedObjectUndo(go: GameObject, name: string) {
    ensureOpen(name).before.created.push(go);
  },

  setTransformParent(t: Transform, parent: Transform | null, name: string) {
    Undo.recordObject(t, name);
    t.setParent(parent, true);
  },

  recordSelection() {
    // A selection change is its own step unless something else is being recorded alongside it.
    if (!open || open.id !== currentGroup) Undo.incrementCurrentGroup();
    const g = ensureOpen('Select Objects');
    if (!g.before.selection) g.before.selection = { objects: Selection.objects, active: Selection.activeGameObject };
  },

  incrementCurrentGroup() {
    currentGroup = ++groupCounter;
    open = null;
  },

  getCurrentGroup() {
    return currentGroup;
  },

  setCurrentGroupName(name: string) {
    if (open && open.id === currentGroup) open.name = name;
  },

  getCurrentGroupName() {
    return open && open.id === currentGroup ? open.name : '';
  },

  /** Merges every group recorded since groupIndex into one. */
  collapseUndoOperations(groupIndex: number) {
    const first = undoStack.findIndex((g) => g.id >= groupIndex);
    if (first < 0 || first === undoStack.length - 1) return;
    const target = undoStack[first];
    for (const g of undoStack.splice(first + 1)) {
      for (const [k, v] of g.before.transforms)
        if (!target.before.transforms.has(k)) target.before.transforms.set(k, v);
      for (const [k, v] of g.before.objects) if (!target.before.objects.has(k)) target.before.objects.set(k, v);
      target.before.created.push(...g.before.created);
      if (!target.before.selection && g.before.selection) target.before.selection = g.before.selection;
    }
    target.id = currentGroup;
    open = target;
  },

  /** Reverts everything recorded since (and including) groupIndex, and forgets it. */
  revertAllDownToGroup(groupIndex: number) {
    while (undoStack.length && undoStack[undoStack.length - 1].id >= groupIndex) {
      const g = undoStack.pop()!;
      applySnapshot(g.before, true);
    }
    open = null;
    Undo.changed();
  },

  revertAllInCurrentGroup() {
    Undo.revertAllDownToGroup(currentGroup);
  },

  flushUndoRecordObjects() {},

  clearAll() {
    undoStack.length = 0;
    redoStack.length = 0;
    open = null;
    Undo.changed();
  },

  get canUndo() {
    return undoStack.length > 0;
  },
  get canRedo() {
    return redoStack.length > 0;
  },

  performUndo() {
    const g = undoStack.pop();
    if (!g) return;
    g.after = captureLike(g.before);
    applySnapshot(g.before, true);
    redoStack.push(g);
    Undo.incrementCurrentGroup();
    Undo.undoRedoPerformed.invoke();
    Undo.changed();
  },

  performRedo() {
    const g = redoStack.pop();
    if (!g || !g.after) return;
    applySnapshot(g.after, false);
    g.after = null;
    undoStack.push(g);
    Undo.incrementCurrentGroup();
    Undo.undoRedoPerformed.invoke();
    Undo.changed();
  },
};

// ---- EditorSnapSettings ------------------------------------------------------------------------------

export const EditorSnapSettings = {
  move: new Vector3(1, 1, 1),
  rotate: 15,
  scale: 1,
  gridSize: new Vector3(1, 1, 1),
  gridPosition: Vector3.zero,
  gridRotation: Quaternion.identity,
  /** The toolbar's grid snapping toggle. */
  gridSnapEnabled: false,
  angleSnapEnabled: false,
  scaleSnapEnabled: false,
  /** Whether the action key (Ctrl/Cmd) is held right now - Unity's incremental snap. */
  get incrementalSnapActive() {
    return heldModifiers.action;
  },
  get gridSnapActive() {
    return EditorSnapSettings.gridSnapEnabled !== heldModifiers.action;
  },
  get snapEnabled() {
    return EditorSnapSettings.gridSnapEnabled;
  },
  set snapEnabled(v: boolean) {
    EditorSnapSettings.gridSnapEnabled = v;
  },
};

/** Modifier keys held right now, kept by the host from every input event. */
export const heldModifiers = { shift: false, control: false, alt: false, command: false, action: false };

// ---- Settings (EditorPrefs) ------------------------------------------------------------------------------

export type PrefValue = string | number | boolean;

export interface SettingsSource {
  /** Current value of a settings property, or undefined when it isn't one the window knows. */
  val(key: string): PrefValue | undefined;
  /** Current binding of a shortcut id ("Shift+Mouse 2"), '' when unbound, undefined when not Blendon's. */
  shortcut(id: string): string | undefined;
}

const settingListeners = new Set<Callback>();

export const Prefs = {
  source: null as SettingsSource | null,
  local: new Map<string, PrefValue>(),

  get<T extends PrefValue>(key: string, fallback: T): T {
    if (Prefs.local.has(key)) return Prefs.local.get(key) as T;
    const v = Prefs.source?.val(key);
    return (v === undefined ? fallback : v) as T;
  },

  bool(key: string, fallback = false) {
    return !!Prefs.get<PrefValue>(key, fallback);
  },

  num(key: string, fallback = 0) {
    return Number(Prefs.get<PrefValue>(key, fallback));
  },

  str(key: string, fallback = '') {
    return String(Prefs.get<PrefValue>(key, fallback));
  },

  set(key: string, v: PrefValue) {
    Prefs.local.set(key, v);
    Prefs.changed();
  },

  changed() {
    for (const l of settingListeners) l();
  },

  onChange(cb: Callback) {
    settingListeners.add(cb);
    return () => void settingListeners.delete(cb);
  },
};

// ---- Shortcut Manager -----------------------------------------------------------------------------------

export const ShortcutModifiers = { None: 0, Alt: 1, Action: 2, Shift: 4, Control: 8 } as const;
export const ShortcutStage = { Begin: 0, End: 1 } as const;

export interface KeyCombination {
  keyCode: number;
  /** ShortcutModifiers flags. */
  modifiers: number;
}

export interface ShortcutArguments {
  stage: number;
  context: unknown;
}

interface ShortcutEntry {
  id: string;
  clutch: boolean;
  handler: (args: ShortcutArguments) => void;
  /** Unity's shortcut defaults, for ids the generated data doesn't carry. */
  fallback: string;
}

const NAMED_KEYS: Record<string, number> = {
  Space: KeyCode.Space,
  Enter: KeyCode.Return,
  Return: KeyCode.Return,
  Esc: KeyCode.Escape,
  Escape: KeyCode.Escape,
  Tab: KeyCode.Tab,
  Backspace: KeyCode.Backspace,
  Delete: KeyCode.Delete,
  Del: KeyCode.Delete,
  Insert: KeyCode.Insert,
  Home: KeyCode.Home,
  End: KeyCode.End,
  'Page Up': KeyCode.PageUp,
  'Page Down': KeyCode.PageDown,
  PgUp: KeyCode.PageUp,
  PgDn: KeyCode.PageDown,
  Up: KeyCode.UpArrow,
  Down: KeyCode.DownArrow,
  Left: KeyCode.LeftArrow,
  Right: KeyCode.RightArrow,
  '`': KeyCode.BackQuote,
  ',': KeyCode.Comma,
  '.': KeyCode.Period,
  '/': KeyCode.Slash,
  ';': KeyCode.Semicolon,
  "'": KeyCode.Quote,
  '[': KeyCode.LeftBracket,
  ']': KeyCode.RightBracket,
  '\\': KeyCode.Backslash,
  '-': KeyCode.Minus,
  '=': KeyCode.Equals,
  'Num +': KeyCode.KeypadPlus,
  'Num -': KeyCode.KeypadMinus,
  'Num *': KeyCode.KeypadMultiply,
  'Num /': KeyCode.KeypadDivide,
  'Num .': KeyCode.KeypadPeriod,
  'Num Enter': KeyCode.KeypadEnter,
  'Num =': KeyCode.KeypadEquals,
};

/** Parses the binding text the settings window shows ("Ctrl+Shift+Num 1", "Alt+Mouse 2"). */
export function parseBinding(text: string): KeyCombination | null {
  if (!text) return null;
  const parts: string[] = [];
  // '+' is both a separator and a key ("Num +"), so split only before a known modifier.
  let rest = text;
  for (;;) {
    const m = /^(Ctrl|Control|Shift|Alt|Cmd|Command|Action)\+/.exec(rest);
    if (!m) break;
    parts.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  let modifiers = 0;
  for (const p of parts) {
    if (p === 'Shift') modifiers |= ShortcutModifiers.Shift;
    else if (p === 'Alt') modifiers |= ShortcutModifiers.Alt;
    else if (p === 'Ctrl' || p === 'Control')
      modifiers |= IS_MAC ? ShortcutModifiers.Control : ShortcutModifiers.Action;
    else modifiers |= ShortcutModifiers.Action;
  }
  let keyCode: number = KeyCode.None;
  if (rest in NAMED_KEYS) keyCode = NAMED_KEYS[rest];
  else if (/^Mouse \d$/.test(rest)) keyCode = KeyCode.Mouse0 + +rest[6];
  else if (/^Num \d$/.test(rest)) keyCode = KeyCode.Keypad0 + +rest[4];
  else if (/^F\d{1,2}$/.test(rest)) keyCode = KeyCode.F1 + +rest.slice(1) - 1;
  else if (/^\d$/.test(rest)) keyCode = KeyCode.Alpha0 + +rest;
  else if (/^[A-Za-z]$/.test(rest)) keyCode = rest.toLowerCase().charCodeAt(0);
  return keyCode === KeyCode.None ? null : { keyCode, modifiers };
}

export function bindingText(k: KeyCombination | null): string {
  if (!k) return '';
  const mods: string[] = [];
  if (k.modifiers & ShortcutModifiers.Action) mods.push(IS_MAC ? 'Cmd' : 'Ctrl');
  if (k.modifiers & ShortcutModifiers.Control) mods.push('Ctrl');
  if (k.modifiers & ShortcutModifiers.Alt) mods.push('Alt');
  if (k.modifiers & ShortcutModifiers.Shift) mods.push('Shift');
  let key = Object.entries(NAMED_KEYS).find(([, v]) => v === k.keyCode)?.[0];
  if (!key) {
    if (k.keyCode >= KeyCode.Mouse0 && k.keyCode <= KeyCode.Mouse6) key = 'Mouse ' + (k.keyCode - KeyCode.Mouse0);
    else if (k.keyCode >= KeyCode.Keypad0 && k.keyCode <= KeyCode.Keypad9) key = 'Num ' + (k.keyCode - KeyCode.Keypad0);
    else if (k.keyCode >= KeyCode.Alpha0 && k.keyCode <= KeyCode.Alpha9) key = String(k.keyCode - KeyCode.Alpha0);
    else if (k.keyCode >= KeyCode.A && k.keyCode <= KeyCode.Z) key = String.fromCharCode(k.keyCode).toUpperCase();
    else key = keyCodeName(k.keyCode);
  }
  return [...mods, key].join('+');
}

/** ShortcutModifiers held by an event. */
export function eventShortcutModifiers(ev: Event) {
  let m = 0;
  if (ev.shift) m |= ShortcutModifiers.Shift;
  if (ev.alt) m |= ShortcutModifiers.Alt;
  if (IS_MAC) {
    if (ev.command) m |= ShortcutModifiers.Action;
    if (ev.control) m |= ShortcutModifiers.Control;
  } else if (ev.control) m |= ShortcutModifiers.Action;
  return m;
}

const registry = new Map<string, ShortcutEntry>();
const activeClutches = new Map<number, ShortcutEntry>();
const bindingCache = new Map<string, KeyCombination | null>();

export const ShortcutManager = {
  /** Fired with the id of every shortcut that ran, for the tutorial and the key display. */
  onTriggered: new Set<(id: string, stage: number) => void>(),

  register(id: string, handler: (args: ShortcutArguments) => void, clutch = false, fallback = '') {
    registry.set(id, { id, clutch, handler, fallback });
  },

  getShortcutBinding(id: string): KeyCombination | null {
    if (!bindingCache.has(id)) {
      const text = Prefs.source?.shortcut(id) ?? registry.get(id)?.fallback ?? '';
      bindingCache.set(id, parseBinding(text));
    }
    return bindingCache.get(id) ?? null;
  },

  invalidate() {
    bindingCache.clear();
  },

  bindingText(id: string) {
    return bindingText(ShortcutManager.getShortcutBinding(id));
  },

  isRegistered(id: string) {
    return registry.has(id);
  },

  matches(id: string, keyCode: number, modifiers: number) {
    const b = ShortcutManager.getShortcutBinding(id);
    return !!b && b.keyCode === keyCode && b.modifiers === modifiers;
  },

  /** The shortcut a key/mouse press triggers, if any. */
  find(keyCode: number, modifiers: number): ShortcutEntry | null {
    for (const e of registry.values()) if (ShortcutManager.matches(e.id, keyCode, modifiers)) return e;
    return null;
  },

  /**
   * Offers a press to the Shortcut Manager the way the Editor does before IMGUI sees it. True when a
   * shortcut took it.
   */
  dispatchDown(ev: Event, context: unknown): boolean {
    if (ev.isRepeat) {
      // A held clutch key repeats; it belongs to the clutch already running.
      return activeClutches.has(ev.keyCode);
    }
    const e = ShortcutManager.find(ev.keyCode, eventShortcutModifiers(ev));
    if (!e) return false;
    if (e.clutch) activeClutches.set(ev.keyCode, e);
    e.handler({ stage: ShortcutStage.Begin, context });
    for (const l of ShortcutManager.onTriggered) l(e.id, ShortcutStage.Begin);
    return true;
  },

  /** Ends a clutch whose key was released. */
  dispatchUp(keyCode: number, context: unknown): boolean {
    const e = activeClutches.get(keyCode);
    if (!e) return false;
    activeClutches.delete(keyCode);
    e.handler({ stage: ShortcutStage.End, context });
    for (const l of ShortcutManager.onTriggered) l(e.id, ShortcutStage.End);
    return true;
  },

  /** Ends running clutches whose binding no longer matches the held modifiers. */
  endMismatched(modifiers: number, context: unknown) {
    for (const [k, e] of [...activeClutches]) {
      const b = ShortcutManager.getShortcutBinding(e.id);
      if (b && b.modifiers !== modifiers) ShortcutManager.dispatchUp(k, context);
    }
  },

  /** Ends every running clutch (focus lost). */
  releaseAll(context: unknown) {
    for (const k of [...activeClutches.keys()]) ShortcutManager.dispatchUp(k, context);
  },
};

export const EventTypeOf = (ev: Event): EventType => ev.type;
