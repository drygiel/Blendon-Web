// TutorialCurriculum: one journey through a small scene the user builds, as Blendon ships it. The text, pictures,
// chapters and the plain part of each task's rules (page, keys, other ways, earlier tasks) come from the plugin
// (src/plugin/generated/tutorial.json). What those rules compute on the live scene is ported here.
import { Keymap } from '../../../bridge/keymap.ts';
import { TUTORIAL, type TutorialTask as TaskData, type TutorialWay } from '../../../plugin/tutorial.ts';
import { Selection, type PrefValue } from '../../unity/editor.ts';
import { IS_MAC } from '../../unity/imgui.ts';
import { ModifierKey, ModifierKeys, TransformTraits as T } from '../foundation.ts';
import { ShortcutGates } from '../shortcut-gates.ts';
import { resolveHint } from './hint.ts';

/** Joins the steps of a key sequence ("G > X > Enter"). */
export const Then = ' > ';

/** What the plugin's lambdas work out for a task, by task id. The rest of its rules is in the data. */
interface Code {
  /** Pressing, or a gesture's keys. Read live, a modifier can be changed between two renders. */
  keys?: () => string;
  /** Holds the tick back too, so an earlier step can't tick a later task early. */
  needs?: () => boolean;
  /** AvailableWhen: a switch below the page's own, e.g. one context menu entry. */
  available?: () => boolean;
  /** Why the browser's Scene view can't do this one. */
  notInDemo?: string;
}

/** TutorialTask.Skip, plus the tasks the demo can't do. */
export type Skip = 'none' | 'demo' | 'page' | 'switch' | 'key' | 'earlier';

// ---- settings and keys, read the way the Scene view reads them ----

const PageOwner: Record<string, string> = {
  OrbitSelected: 'OrbitSelectedSettings',
  Pan: 'PanSettings',
  Zoom: 'ZoomSettings',
  ViewportNav: 'ViewportNavSettings',
  OrientationGizmo: 'OrientationGizmoSettings',
  MoveGizmo: 'MoveGizmoSettings',
  RotateGizmo: 'RotateGizmoSettings',
  ScaleGizmo: 'ScaleGizmoSettings',
  TransformGizmo: 'TransformGizmoSettings',
  FrameSelected: 'FrameSelectedSettings',
  IsolateView: 'IsolateViewSettings',
  SnapToFloor: 'SnapToFloorSettings',
  BoxSelect: 'BoxSelectSettings',
  SceneMenu: 'SceneMenuSettings',
};

// What the gates read: a value the Scene view set itself, else the window's, else the captured default.
function setting<V extends PrefValue>(key: string, fallback: V): V {
  return (ShortcutGates.reader.val(key) as V | undefined) ?? fallback;
}

const on = (key: string, fallback = true) => !!setting(key, fallback);

/** SettingsPages.IsEnabled: tuning and chrome pages always read as on. */
export function pageEnabled(page: string): boolean {
  switch (page) {
    // "Any" not "all four", so a vertex-snap key still live for the running tools isn't grayed.
    case 'SharedGizmos':
      return ['Move', 'Rotate', 'Scale', 'Transform'].some((t) => on(t + 'GizmoSettings.Enabled'));
    case 'History':
      return on('HistorySettings.Enabled') || on('ViewHistorySettings.Enabled');
    case 'PieMenus':
      return on('PieMenuSettings.Enabled') || on('WireframeToggleSettings.Enabled');
  }
  const owner = PageOwner[page];
  return owner ? on(owner + '.Enabled') : true;
}

/**
 * The key the page's shortcut profile holds, "" when unbound, as TutorialTask.Binding reads it: a shut gate
 * leaves the binding alone, shortcutSwitchedOn says whether it answers.
 */
export function binding(id: string): string {
  return Keymap.binding(id, ShortcutGates.reader) ?? '';
}

/** PageRegistry.IsShortcutLive: Blendon, the shortcut's feature and, for a pie's key, that pie are on. */
export const shortcutSwitchedOn = (id: string) => ShortcutGates.isSwitchedOn(id);

const modifierOf = (key: string, fallback: string) => ModifierKeys.parse(setting(key, fallback));
const modifier = (key: string, fallback: string) => ModifierKeys.displayName(modifierOf(key, fallback));
const hasModifier = (key: string, fallback: string) => modifierOf(key, fallback) !== ModifierKey.None;
const keys = (...steps: string[]) => steps.join(Then);
// Unity's own snap and subtract key, not rebindable here.
const actionKey = () => (IS_MAC ? 'Cmd' : 'Ctrl');

const Id = {
  Orbit: 'Blendon/Orbit Selected',
  Grab: 'Blendon/Grab',
  Rotate: 'Blendon/Grab Rotate',
  VertexSnap: 'Blendon/Vertex Snap',
  ContextMenu: 'Blendon/Context Menu',
  AddBoxSelect: 'Scene View/Add Box Select',
  ToolsPie: 'Blendon/Pie Menus/Unity Tools',
};

// The scene menu answers to its own binding, there is no read-only profile to wait on here.
const contextMenuKey = () => binding(Id.ContextMenu);
const grab = () => binding(Id.Grab);

const hasSelection = () => Selection.activeTransform != null;
const twoSelected = () => Selection.count >= 2;
// One cube, so a click on it walks up instead of reselecting.
const inGroup = () => Selection.count === 1 && !!Selection.activeTransform?.parent;
const hasChildren = () => (Selection.activeTransform?.children.length ?? 0) > 0;

/** Otherwise gates by the name the data gives them, "Name" or "Name:<shortcut id>". */
const Gates: Record<string, (id: string) => boolean> = {
  // The toolbar and the main menu are always there, even with every key unbound.
  Always: () => true,
  ContextMenuAdds: () => on('SceneMenuSettings.Enabled') && on('SceneMenuSettings.AddObject') && !!contextMenuKey(),
  // One pie can be off on its own, so its key's gate says more than the page switch.
  PieOn: (id) => shortcutSwitchedOn(id) && !!binding(id),
};

/** The port's gate for a way, null for one it doesn't know. */
export function gateOf(gate: string): (() => boolean) | null {
  const colon = gate.indexOf(':');
  const fn = Gates[colon < 0 ? gate : gate.slice(0, colon)];
  return fn ? () => fn(colon < 0 ? '' : gate.slice(colon + 1)) : null;
}

const Code: Record<string, Code> = {
  // First Scene
  'scene.add-plane': {
    keys: contextMenuKey,
    available: () => on('SceneMenuSettings.AddObject') && !!contextMenuKey(),
  },
  'nav.zoom': { keys: () => 'Wheel' },
  'nav.frame': { needs: hasSelection },
  'nav.orbit-selection': { needs: hasSelection },

  // Grab and Move
  'grab.move': { needs: hasSelection },
  'grab.cancel': {
    keys: () => keys(grab(), on('GeneralSettings.RmbCancelEnabled') ? 'Mouse 1' : 'Esc'),
    needs: hasSelection,
  },
  'grab.axis': { keys: () => keys(grab(), 'X'), needs: hasSelection },
  'grab.exact': { keys: () => keys(grab(), 'Y', '2', 'Enter'), needs: hasSelection },
  'snap.floor': { needs: hasSelection },
  'grab.floor-plane': {
    keys: () => keys(grab(), modifier('SharedGizmoSettings.AxisExcludeModifier', 'Shift') + '+Y'),
    available: () => hasModifier('SharedGizmoSettings.AxisExcludeModifier', 'Shift'),
    needs: hasSelection,
  },
  'grab.grid': { keys: () => keys(grab(), actionKey()), needs: hasSelection },
  'grab.slow': {
    keys: () => keys(grab(), modifier('SharedGizmoSettings.PrecisionModifier', 'Shift')),
    available: () =>
      on('SharedGizmoSettings.PrecisionModeEnabled') && hasModifier('SharedGizmoSettings.PrecisionModifier', 'Shift'),
    needs: hasSelection,
  },

  // Rotate and Scale
  'grab.rotate': { needs: hasSelection },
  'grab.rotate-exact': { keys: () => keys(binding(Id.Rotate), 'Y', '45', 'Enter'), needs: hasSelection },
  'grab.local-axis': { keys: () => keys(grab(), 'X', 'X'), needs: hasSelection },
  'grab.scale': { needs: hasSelection },
  'grab.reset-scale': { needs: hasSelection },

  // A Second Cube
  'snap.vertex': { keys: () => keys(grab(), binding(Id.VertexSnap)), needs: hasSelection },
  'snap.surface': {
    keys: () => keys(grab(), modifier('MoveGizmoSettings.SurfaceSnapModifier', 'Alt')),
    available: () =>
      on('MoveGizmoSettings.SurfaceSnapEnabled') && hasModifier('MoveGizmoSettings.SurfaceSnapModifier', 'Alt'),
    needs: hasSelection,
  },

  // Tools and Handles
  'handles.axis': { needs: hasSelection },
  'handles.plane': { needs: hasSelection },
  'handles.ring': { needs: hasSelection },
  'snap.lookat': {
    keys: () => modifier('RotateGizmoSettings.LookAtModifier', 'Alt'),
    available: () =>
      on('RotateGizmoSettings.LookAtEnabled') && hasModifier('RotateGizmoSettings.LookAtModifier', 'Alt'),
    needs: hasSelection,
  },
  'snap.virtual-pivot': { needs: hasSelection },
  'snap.keep-pivot': { keys: () => 'Enter' },

  // Selecting
  'select.box-modes': { keys: () => binding(Id.AddBoxSelect) },
  'select.group': {
    keys: contextMenuKey,
    available: () => on('SceneMenuSettings.Grouping', false) && !!contextMenuKey(),
    needs: twoSelected,
  },
  'select.parent': { needs: inGroup },
  'select.children': { needs: hasChildren },
  'select.click-parent': { available: () => on('BoxSelectSettings.ClickSelectsParent'), needs: inGroup },
  'select.pivot-point': { needs: twoSelected },
  'select.align': {
    keys: contextMenuKey,
    available: () => on('SceneMenuSettings.AlignToActive') && !!contextMenuKey(),
    needs: twoSelected,
  },

  // Views
  'nav.axis-snap': {
    keys: () => keys(binding(Id.Orbit), modifier('OrbitSelectedSettings.SnapModifier', 'Alt')),
    available: () =>
      on('OrbitSelectedSettings.AltSnapEnabled') && hasModifier('OrbitSelectedSettings.SnapModifier', 'Alt'),
  },
  'nav.camera': { notInDemo: 'the demo scene has no camera to look through' },
  'tools.isolate': { needs: hasSelection },

  // Pie Menus and You
  'pie.number': {
    keys: () => keys(binding(Id.ToolsPie), '1'),
    available: () => on('PieMenuSettings.ShowAccelerators'),
  },
};

// Set by the progress, which reads the curriculum itself.
let isDone: (id: string) => boolean = () => false;

/** Where After reads which tasks are done. */
export function readDoneFrom(done: (id: string) => boolean) {
  isDone = done;
}

/**
 * Ticked by one of: a shortcut pressed, a signal (a gesture), a pie item or menu entry run (a command), or a
 * kept drag with the right traits (a transform). Another way through it is taken while its own is skipped.
 */
export class TutorialTask {
  readonly id: string;
  readonly title: string;
  /** The badge's line while needsMet() is false, e.g. "Select the cube first". */
  readonly needsText: string;
  readonly kind: TaskData['kind'];
  readonly page: string;
  readonly signal: string;
  readonly shortcutIds: string[];
  readonly commands: string[];
  readonly traits: number;
  readonly keysShortcutId: string;
  readonly keysSetting: string;
  readonly keysPage: string;
  readonly notInDemo: string;
  /** Finishes "Skipped while ..." when a switch below the page's own is off. */
  readonly switchText: string;
  /** Tasks this one builds on, any one of them will do. */
  readonly earlierIds: string[];
  private readonly data: TaskData;
  private readonly code: Code;
  private readonly ways: { open: () => boolean; way: TutorialWay }[];

  constructor(data: TaskData) {
    this.data = data;
    this.code = Code[data.id] ?? {};
    this.id = data.id;
    this.title = data.title;
    this.needsText = data.needs;
    this.kind = data.kind;
    this.page = data.page;
    this.signal = data.signal ?? '';
    this.shortcutIds = data.ids ?? [];
    this.commands = data.commands ?? [];
    this.traits = (data.traits ?? []).reduce<number>((m, n) => m | (T[n as keyof typeof T] ?? T.None), T.None);
    this.keysShortcutId = data.keysShortcut ?? '';
    this.keysSetting = data.keysSetting ?? '';
    this.keysPage = data.keysPage ?? '';
    this.notInDemo = this.code.notInDemo ?? '';
    this.switchText = data.availableWhen?.reason ?? '';
    this.earlierIds = data.after ?? [];
    this.ways = (data.otherwise ?? []).map((way) => ({ open: gateOf(way.gate) ?? (() => false), way }));
  }

  private get keyId() {
    return this.shortcutIds[0] ?? this.keysShortcutId;
  }

  /** The other way being taken, null while the task's own is on. */
  private live(): TutorialWay | null {
    return this.ways.length ? this.state().way : null;
  }

  /** The hint as written, tokens in, for the way the task can be done right now. */
  get hintSource(): string {
    return this.live()?.text ?? this.data.hintSrc ?? this.data.hint;
  }

  /** Unity rich text, its keys as they are bound right now. */
  get hint(): string {
    return resolveHint(this.hintSource);
  }

  get picture(): string {
    return this.live()?.picture ?? this.data.picture;
  }

  /** Empty for a still, and while another way is taken: the clip shows the task's own way. */
  get clip(): string {
    return this.live() ? '' : this.data.clip;
  }

  get aspect(): string {
    return this.live()?.aspect ?? this.data.aspect;
  }

  /** Empty for gestures without keys. */
  keys(): string {
    const way = this.live();
    if (way) return binding(way.keys);
    if (this.code.keys) return this.code.keys();
    const id = this.keyId;
    return id ? binding(id) : '';
  }

  /** Feature off or key unbound, with no other way left. Still listed, dimmed, but never the task asked for next. */
  isSkipped(): boolean {
    return this.skippedBy() !== 'none';
  }

  skippedBy(): Skip {
    return this.state().skip;
  }

  // Read fresh each time: settings, bindings and progress all change without telling the task.
  private state(): { skip: Skip; way: TutorialWay | null } {
    if (this.notInDemo) return { skip: 'demo', way: null };
    let skip = this.ownSkip();
    let way: TutorialWay | null = null;
    if (skip !== 'none') {
      const open = this.ways.find((w) => w.open());
      if (open) {
        way = open.way;
        skip = 'none';
      }
    }
    if (skip === 'none' && this.earlierIds.length && this.noEarlierLeft()) skip = 'earlier';
    return { skip, way };
  }

  // A done one keeps the task, what it left is still in the scene.
  private noEarlierLeft(): boolean {
    for (const id of this.earlierIds) {
      const earlier = byId.get(id);
      if (isDone(id) || !earlier || !earlier.isSkipped()) return false;
    }
    return true;
  }

  private ownSkip(): Skip {
    if (!pageEnabled(this.page)) return 'page';
    if (this.code.available && !this.code.available()) return 'switch';
    // A sub-feature (one history, one pie) can be off while its page stays on.
    const id = this.keyId;
    return id && (!binding(id) || !shortcutSwitchedOn(id)) ? 'key' : 'none';
  }

  needsMet(): boolean {
    return !this.code.needs || this.code.needs();
  }

  /** The port knows how to check its needs, its switch and work out its keys, for the unit test. */
  ported() {
    return { keys: !!this.code.keys, needs: !!this.code.needs, available: !!this.code.available };
  }

  answers(shortcutId: string) {
    return this.shortcutIds.includes(shortcutId);
  }

  answersCommand(key: string) {
    return this.commands.some((c) => (c.endsWith('/') ? key.startsWith(c) : key === c));
  }

  answersTransform(traits: number) {
    return this.traits !== T.None && (traits & this.traits) === this.traits;
  }
}

export interface TutorialChapter {
  title: string;
  subtitle: string;
  iconName: string;
  accent: string;
  tasks: TutorialTask[];
}

export const TutorialCurriculum: TutorialChapter[] = TUTORIAL.chapters.map((c) => ({
  title: c.title,
  subtitle: c.subtitle,
  iconName: c.icon,
  accent: c.accent,
  tasks: c.tasks.map((t) => new TutorialTask(t)),
}));

export const TutorialTasks: TutorialTask[] = TutorialCurriculum.flatMap((c) => c.tasks);

const byId = new Map(TutorialTasks.map((t) => [t.id, t]));

export const findTask = (id: string) => byId.get(id) ?? null;

/** Ported code for ids the plugin no longer teaches, for the unit test that keeps both sides in step. */
export const unusedRules = () => Object.keys(Code).filter((id) => !byId.has(id));
