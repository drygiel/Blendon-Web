// TutorialCurriculum: one journey through a small scene the user builds, as Blendon ships it. The text, pictures
// and chapters come from the plugin (src/plugin/generated/tutorial.json); how each task is ticked is ported here.
import { SharedSettings } from '../../../bridge/settings.ts';
import { TUTORIAL, type TutorialTask as TaskText } from '../../../plugin/tutorial.ts';
import { Prefs, Selection, ShortcutManager, type PrefValue } from '../../unity/editor.ts';
import { IS_MAC } from '../../unity/imgui.ts';
import { ModifierKeys, TransformTraits as T } from '../foundation.ts';

/** Joins the steps of a key sequence ("G > X > Enter"). */
export const Then = ' > ';

type Kind = 'shortcut' | 'gesture' | 'command' | 'transform';

interface Rule {
  kind: Kind;
  /** Feature switched off -> keys parked -> task skipped. */
  page: string;
  signal?: string;
  /** First one names the keys on the row. */
  ids?: string[];
  /** Pie item action ids and context menu keys. A trailing "/" takes any entry under it. */
  commands?: string[];
  traits?: number;
  /** Read live, a modifier can be changed between two renders. */
  keys?: () => string;
  /** Shortcut whose binding the keys start with: its row, for the gear. */
  keysIn?: string;
  /** Keys that are a setting (a modifier): that setting's row, for the gear. */
  keysSetting?: string;
  /** Keys set somewhere no row can be marked: the page that leads there. */
  keysPage?: string;
  /** Holds the tick back too, so an earlier step can't tick a later task early. */
  needs?: () => boolean;
  /** A switch below the page's own, e.g. one context menu entry. */
  available?: () => boolean;
  /** Why the browser's Scene view can't do this one. */
  notInDemo?: string;
}

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

// The Scene view's settings once it has loaded, else the window's own values.
function setting<V extends PrefValue>(key: string, fallback: V): V {
  if (Prefs.source) return Prefs.get(key, fallback);
  return (SharedSettings.reader?.val(key) as V | undefined) ?? fallback;
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

/** A shortcut's live binding text, empty when unbound or parked. */
export function binding(id: string): string {
  if (ShortcutManager.isRegistered(id)) return ShortcutManager.bindingText(id);
  return Prefs.source?.shortcut(id) ?? SharedSettings.reader?.shortcut(id) ?? '';
}

const modifier = (key: string, fallback: string) =>
  ModifierKeys.displayName(ModifierKeys.parse(setting(key, fallback)));
const keys = (...steps: string[]) => steps.join(Then);
// Unity's own snap and subtract key, not rebindable here.
const actionKey = () => (IS_MAC ? 'Cmd' : 'Ctrl');

const Id = {
  Orbit: 'Blendon/Orbit Selected',
  Roll: 'Blendon/Quick Roll',
  Pan: 'Blendon/Camera Pan',
  Frame: 'Blendon/Frame Selected',
  Grab: 'Blendon/Grab',
  Rotate: 'Blendon/Grab Rotate',
  Scale: 'Blendon/Grab Scale',
  SnapToFloor: 'Blendon/Snap To Floor',
  VertexSnap: 'Blendon/Vertex Snap',
  PickPivot: 'Blendon/Pick Virtual Pivot',
  ContextMenu: 'Blendon/Context Menu',
  Parent: 'Blendon/Select Parent',
  Children: 'Blendon/Select Children',
  SelectionBack: 'Blendon/History/Undo Selection',
  SelectionForward: 'Blendon/History/Redo Selection',
  ViewBack: 'Blendon/History/Undo View',
  ViewForward: 'Blendon/History/Redo View',
  Isolate: 'Blendon/Isolate View',
  Wireframe: 'Blendon/Toggle Wireframe',
  Front: 'Blendon/Viewport Nav/View Front',
  Projection: 'Blendon/Viewport Nav/Toggle Projection',
  OrbitLeft: 'Blendon/Viewport Nav/Orbit Left',
  OrbitRight: 'Blendon/Viewport Nav/Orbit Right',
  OrbitUp: 'Blendon/Viewport Nav/Orbit Up',
  OrbitDown: 'Blendon/Viewport Nav/Orbit Down',
  Camera: 'Blendon/Viewport Nav/Align To Camera',
  AddObjectPie: 'Blendon/Pie Menus/Add Object',
  ResetPie: 'Blendon/Pie Menus/Reset',
  ToolsPie: 'Blendon/Pie Menus/Unity Tools',
  OrientationPie: 'Blendon/Pie Menus/Tools Handle',
  PivotPie: 'Blendon/Pie Menus/Pivot Point',
  ViewPie: 'Blendon/Pie Menus/View',
  ShadingPie: 'Blendon/Pie Menus/Shading',
  SnappingPie: 'Blendon/Pie Menus/Snapping',
};

const contextMenuKey = () => binding(Id.ContextMenu);
const grab = () => binding(Id.Grab);

const hasSelection = () => Selection.activeTransform != null;
const twoSelected = () => Selection.count >= 2;
// One cube, so a click on it walks up instead of reselecting.
const inGroup = () => Selection.count === 1 && !!Selection.activeTransform?.parent;
const hasChildren = () => (Selection.activeTransform?.children.length ?? 0) > 0;

const shortcut = (page: string, ...ids: string[]): Rule => ({ kind: 'shortcut', page, ids });
const gesture = (page: string, signal: string, extra: Partial<Rule> = {}): Rule => ({
  kind: 'gesture',
  page,
  signal,
  ...extra,
});
const command = (page: string, ...commands: string[]): Rule => ({ kind: 'command', page, commands });
const transform = (page: string, traits: number): Rule => ({ kind: 'transform', page, traits });

const Rules: Record<string, Rule> = {
  // First Scene
  'nav.orbit': shortcut('OrbitSelected', Id.Orbit),
  'nav.pan': shortcut('Pan', Id.Pan),
  'scene.add-plane': {
    ...command('SceneMenu', 'Blendon/Add/Plane'),
    keys: contextMenuKey,
    keysPage: 'SceneMenu',
    available: () => on('SceneMenuSettings.AddObject'),
  },
  'nav.zoom': gesture('Zoom', 'ZoomWheel', { keys: () => 'Wheel' }),
  'scene.add-cube': { ...command('PieMenus', 'Blendon/Add Object/Cube'), keysIn: Id.AddObjectPie },
  'nav.frame': { ...shortcut('FrameSelected', Id.Frame), needs: hasSelection },
  'nav.orbit-selection': { ...shortcut('OrbitSelected', Id.Orbit), needs: hasSelection },

  // Grab and Move
  'grab.move': { ...transform('MoveGizmo', T.Move | T.Grab), keysIn: Id.Grab, needs: hasSelection },
  'grab.cancel': gesture('MoveGizmo', 'TransformCancelled', {
    keys: () => keys(grab(), 'Mouse 1'),
    keysIn: Id.Grab,
    needs: hasSelection,
  }),
  'grab.axis': {
    ...transform('MoveGizmo', T.Move | T.Grab | T.Axis),
    keys: () => keys(grab(), 'X'),
    keysIn: Id.Grab,
    needs: hasSelection,
  },
  'grab.exact': {
    ...transform('MoveGizmo', T.Move | T.Grab | T.Axis | T.Numeric),
    keys: () => keys(grab(), 'Y', '2', 'Enter'),
    keysIn: Id.Grab,
    needs: hasSelection,
  },
  'snap.floor': { ...shortcut('SnapToFloor', Id.SnapToFloor), needs: hasSelection },
  'grab.floor-plane': {
    ...transform('MoveGizmo', T.Move | T.Grab | T.Plane),
    keys: () => keys(grab(), modifier('SharedGizmoSettings.AxisExcludeModifier', 'Shift') + '+Y'),
    keysIn: Id.Grab,
    needs: hasSelection,
  },
  'grab.grid': {
    ...transform('MoveGizmo', T.Move | T.Grab | T.Snapped),
    keys: () => keys(grab(), actionKey()),
    keysIn: Id.Grab,
    needs: hasSelection,
  },
  'grab.slow': {
    ...transform('MoveGizmo', T.Move | T.Grab | T.Precision),
    keys: () => keys(grab(), modifier('SharedGizmoSettings.PrecisionModifier', 'Shift')),
    keysIn: Id.Grab,
    needs: hasSelection,
  },

  // Rotate and Scale
  'grab.rotate': { ...transform('RotateGizmo', T.Rotate | T.Grab), keysIn: Id.Rotate, needs: hasSelection },
  'grab.rotate-exact': {
    ...transform('RotateGizmo', T.Rotate | T.Grab | T.Axis | T.Numeric),
    keys: () => keys(binding(Id.Rotate), 'Y', '45', 'Enter'),
    keysIn: Id.Rotate,
    needs: hasSelection,
  },
  'grab.local-axis': {
    ...transform('MoveGizmo', T.Move | T.Grab | T.LocalAxis),
    keys: () => keys(grab(), 'X', 'X'),
    keysIn: Id.Grab,
    needs: hasSelection,
  },
  'grab.scale': { ...transform('ScaleGizmo', T.Scale | T.Grab), keysIn: Id.Scale, needs: hasSelection },
  'grab.reset-scale': { ...command('PieMenus', 'Blendon/Reset/Scale'), keysIn: Id.ResetPie, needs: hasSelection },

  // A Second Cube
  'pair.add-cube': {
    ...command('PieMenus', 'Blendon/Add Object/Cube', 'Blendon/Add/Cube', 'Duplicate'),
    keysIn: Id.AddObjectPie,
  },
  'snap.vertex': {
    ...transform('SharedGizmos', T.Move | T.OnVertex),
    keys: () => keys(grab(), binding(Id.VertexSnap)),
    keysIn: Id.VertexSnap,
    needs: hasSelection,
  },
  'snap.surface': {
    ...transform('MoveGizmo', T.Move | T.Surface),
    keys: () => keys(grab(), modifier('MoveGizmoSettings.SurfaceSnapModifier', 'Alt')),
    keysSetting: 'MoveGizmoSettings.SurfaceSnapModifier',
    needs: hasSelection,
  },

  // Tools and Handles
  'handles.move-tool': { ...command('PieMenus', 'Blendon/Tools/Move'), keysIn: Id.ToolsPie },
  'handles.axis': { ...transform('MoveGizmo', T.Move | T.Arrow), needs: hasSelection },
  'handles.plane': { ...transform('MoveGizmo', T.Move | T.Square), needs: hasSelection },
  'handles.local': { ...command('PieMenus', 'Blendon/Tools Handle/Local'), keysIn: Id.OrientationPie },
  'handles.rotate-tool': { ...command('PieMenus', 'Blendon/Tools/Rotate'), keysIn: Id.ToolsPie },
  'handles.ring': { ...transform('RotateGizmo', T.Rotate | T.Ring), needs: hasSelection },
  'snap.lookat': {
    ...transform('RotateGizmo', T.Rotate | T.LookAt),
    keys: () => modifier('RotateGizmoSettings.LookAtModifier', 'Alt'),
    keysSetting: 'RotateGizmoSettings.LookAtModifier',
    needs: hasSelection,
  },
  'snap.virtual-pivot': {
    ...transform('SharedGizmos', T.Rotate | T.VirtualPivot),
    keysIn: Id.PickPivot,
    needs: hasSelection,
  },
  'snap.keep-pivot': gesture('SharedGizmos', 'VirtualPivotKept', { keys: () => 'Enter' }),

  // Selecting
  'select.box': gesture('BoxSelect', 'BoxSelected'),
  'select.box-modes': gesture('BoxSelect', 'BoxSelectModified', { keys: () => 'Shift' }),
  'select.group': {
    ...command('SceneMenu', 'Blendon/Group'),
    keys: contextMenuKey,
    keysPage: 'SceneMenu',
    available: () => on('SceneMenuSettings.Grouping', false),
    needs: twoSelected,
  },
  'select.parent': { ...shortcut('BoxSelect', Id.Parent), needs: inGroup },
  'select.children': { ...shortcut('BoxSelect', Id.Children), needs: hasChildren },
  'select.click-parent': gesture('BoxSelect', 'ClickSelectedParent', { needs: inGroup }),
  'tools.selection-history': shortcut('History', Id.SelectionBack, Id.SelectionForward),
  'select.pivot-point': { ...command('PieMenus', 'Blendon/Pivot Point/'), keysIn: Id.PivotPie, needs: twoSelected },
  'select.align': {
    ...command('SceneMenu', 'Blendon/Align/'),
    keys: contextMenuKey,
    keysPage: 'SceneMenu',
    available: () => on('SceneMenuSettings.AlignToActive'),
    needs: twoSelected,
  },

  // Views
  'nav.axis-view': gesture('ViewportNav', 'AxisView', { keysIn: Id.Front }),
  'nav.projection': shortcut('ViewportNav', Id.Projection),
  'nav.orbit-step': shortcut('ViewportNav', Id.OrbitLeft, Id.OrbitRight, Id.OrbitUp, Id.OrbitDown),
  'nav.axis-snap': gesture('OrbitSelected', 'OrbitAxisSnap', {
    keys: () => keys(binding(Id.Orbit), modifier('OrbitSelectedSettings.SnapModifier', 'Alt')),
    keysSetting: 'OrbitSelectedSettings.SnapModifier',
  }),
  'nav.quick-roll': shortcut('OrbitSelected', Id.Roll),
  'tools.orientation': gesture('OrientationGizmo', 'OrientationGizmoClick'),
  'nav.view-pie': { ...command('PieMenus', 'Blendon/View/'), keysIn: Id.ViewPie },
  'nav.camera': { ...shortcut('ViewportNav', Id.Camera), notInDemo: 'the demo scene has no camera to look through' },
  'tools.view-history': shortcut('History', Id.ViewBack, Id.ViewForward),
  'tools.isolate': { ...shortcut('IsolateView', Id.Isolate), needs: hasSelection },

  // Pie Menus and You
  'pie.draw-mode': { ...command('PieMenus', 'Blendon/Shading/'), keysIn: Id.ShadingPie },
  'pie.tap': gesture('PieMenus', 'PieTap', { keysIn: Id.ShadingPie }),
  'pie.wireframe': shortcut('PieMenus', Id.Wireframe),
  'pie.number': gesture('PieMenus', 'PieNumber', { keys: () => keys(binding(Id.ToolsPie), '1'), keysIn: Id.ToolsPie }),
  'pie.snapping': { ...command('PieMenus', 'Blendon/Snapping/'), keysIn: Id.SnappingPie },
  'pie.rebind': gesture('Keyboard', 'ShortcutRebound', { keysPage: 'Keyboard' }),
};

/**
 * Ticked by one of: a shortcut pressed, a signal (a gesture), a pie item or menu entry run (a command), or a
 * kept drag with the right traits (a transform).
 */
export class TutorialTask {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly picture: string;
  readonly clip: string;
  readonly aspect: string;
  /** The badge's line while needsMet() is false, e.g. "Select the cube first". */
  readonly needsText: string;
  readonly kind: Kind;
  readonly page: string;
  readonly signal: string;
  readonly shortcutIds: string[];
  readonly commands: string[];
  readonly traits: number;
  readonly keysShortcutId: string;
  readonly keysSetting: string;
  readonly keysPage: string;
  readonly notInDemo: string;
  private readonly rule: Rule;

  constructor(text: TaskText, rule: Rule) {
    this.id = text.id;
    this.title = text.title;
    this.hint = text.hint;
    this.picture = text.picture;
    this.clip = text.clip;
    this.aspect = text.aspect;
    this.needsText = text.needs;
    this.rule = rule;
    this.kind = rule.kind;
    this.page = rule.page;
    this.signal = rule.signal ?? '';
    this.shortcutIds = rule.ids ?? [];
    this.commands = rule.commands ?? [];
    this.traits = rule.traits ?? T.None;
    this.keysShortcutId = rule.keysIn ?? '';
    this.keysSetting = rule.keysSetting ?? '';
    this.keysPage = rule.keysPage ?? '';
    this.notInDemo = rule.notInDemo ?? '';
  }

  private get keyId() {
    return this.shortcutIds[0] ?? this.keysShortcutId;
  }

  /** Empty for gestures without keys. */
  keys(): string {
    if (this.rule.keys) return this.rule.keys();
    const id = this.keyId;
    return id ? binding(id) : '';
  }

  /** Feature off, key unbound or not in the demo. Still listed, dimmed, but never the task asked for next. */
  isSkipped(): boolean {
    if (this.notInDemo) return true;
    if (!pageEnabled(this.page)) return true;
    if (this.rule.available && !this.rule.available()) return true;
    const id = this.keyId;
    return !!id && !binding(id);
  }

  needsMet(): boolean {
    return !this.rule.needs || this.rule.needs();
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

const missing = TUTORIAL.chapters.flatMap((c) => c.tasks).filter((t) => !Rules[t.id]);
if (missing.length) throw new Error('No tutorial rule for: ' + missing.map((t) => t.id).join(', '));

export const TutorialCurriculum: TutorialChapter[] = TUTORIAL.chapters.map((c) => ({
  title: c.title,
  subtitle: c.subtitle,
  iconName: c.icon,
  accent: c.accent,
  tasks: c.tasks.map((t) => new TutorialTask(t, Rules[t.id])),
}));

export const TutorialTasks: TutorialTask[] = TutorialCurriculum.flatMap((c) => c.tasks);

const byId = new Map(TutorialTasks.map((t) => [t.id, t]));

export const findTask = (id: string) => byId.get(id) ?? null;

/** Rule ids the plugin no longer teaches, for the unit test that keeps both sides in step. */
export const unusedRules = () => Object.keys(Rules).filter((id) => !byId.has(id));
