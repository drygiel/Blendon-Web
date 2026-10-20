// Builds the settings window's data (src/plugin/schema.ts) from the Blendon sources and the
// Unity model dump (scripts/sync/dump.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  CatalogPage,
  ContestedRow,
  Cond,
  IconInfo,
  Keys,
  Op,
  PageHeader,
  PropInfo,
  PropValue,
  ShortcutInfo,
  Tip,
  WindowDataFile,
} from '../../src/plugin/schema.ts';
import type { AssetPlan } from './assets.ts';
import { drawMethods, parse, stripComments, type Stmt } from './csharp.ts';
import { type DumpCard, type DumpKeys, loadDump, type Problems, toTip } from './dump.ts';
import { convert, Ctx, type Helper } from './ops.ts';

export interface PluginPaths {
  editor: string;
  icons: string;
  ref: string;
  video: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

// ---- DrawSettings sources ------------------------------------------------------------------------

const FILE_OWNER: Record<string, string> = {
  'SharedGizmoSettings.cs': 'SharedGizmoSettings',
  'MoveGizmoSettings.cs': 'MoveGizmoSettings',
  'RotateGizmoSettings.cs': 'RotateGizmoSettings',
  'ScaleGizmoSettings.cs': 'ScaleGizmoSettings',
  'OrbitSelectedSettings.cs': 'OrbitSelectedSettings',
  'OrientationGizmoSettings.cs': 'OrientationGizmoSettings',
  'PanSettings.cs': 'PanSettings',
  'ViewportNavSettings.cs': 'ViewportNavSettings',
  'ZoomSettings.cs': 'ZoomSettings',
  'WireframeToggleSettings.cs': 'WireframeToggleSettings',
  'PieMenuSettings.cs': 'PieMenuSettings',
  'FrameSelectedSettings.cs': 'FrameSelectedSettings',
  'SelectionHistorySettings.cs': 'HistorySettings',
  'ViewHistorySettings.cs': 'ViewHistorySettings',
  'IsolateViewSettings.cs': 'IsolateViewSettings',
  'SceneMenuSettings.cs': 'SceneMenuSettings',
  'BoxSelectSettings.cs': 'BoxSelectSettings',
  'SnapToFloorSettings.cs': 'SnapToFloorSettings',
  // The Overview's Defaults card (DrawSettings) and its rows drawn by OverviewPage.
  'GeneralSettings.Defaults.cs': 'GeneralSettings',
  'GeneralSettings.Overview.cs': 'GeneralSettings',
};
// TransformGizmoSettings.cs declares the composite and its three nested part settings.
const TRANSFORM_FILE = 'TransformGizmoSettings.cs';
const TRANSFORM_PARTS = [
  'TransformGizmoSettings',
  'TransformMoveSettings',
  'TransformRotateSettings',
  'TransformScaleSettings',
];

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (e.name.endsWith('.cs')) out.push(p);
  }
  return out;
}

/** Statement trees of every Draw* method, keyed "Owner#Method". */
export function readDrawBodies(editorDir: string): Map<string, Stmt[]> {
  const bodies = new Map<string, Stmt[]>();
  for (const file of walkFiles(editorDir).sort()) {
    const name = basename(file);
    const fileOwner = FILE_OWNER[name];
    if (!fileOwner && name !== TRANSFORM_FILE) continue;
    for (const m of drawMethods(readFileSync(file, 'utf8'))) {
      const owner = fileOwner ?? m.className;
      if (!fileOwner && !TRANSFORM_PARTS.includes(owner)) continue;
      bodies.set(owner + '#' + m.name, parse(m.body));
    }
  }
  return bodies;
}

// ---- page metadata ------------------------------------------------------------------------------

export const ACCENTS: Record<string, string> = {
  Overview: '#F29E2E',
  Tutorial: '#F29E2E',
  OrbitSelected: '#40B8EB',
  Pan: '#F29E2E',
  Zoom: '#8C66F2',
  ViewportNav: '#9ED940',
  OrientationGizmo: '#33D9C7',
  SharedGizmos: '#BF59E6',
  MoveGizmo: '#E6574F',
  RotateGizmo: '#52D973',
  ScaleGizmo: '#598CF2',
  TransformGizmo: '#F29E2E',
  FrameSelected: '#F2D933',
  IsolateView: '#D98C4C',
  SnapToFloor: '#B861EB',
  History: '#F2D933',
  BoxSelect: '#4CD9A6',
  Keyboard: '#EB73A6',
  PieMenus: '#598CF2',
  SceneMenu: '#F2805A',
};

// [id, label, group, summary, icon name, icon override, indented, listed as a feature]
const CATALOG: [string, string, string, string, string, string | null, boolean, boolean][] = [
  [
    'Overview',
    'Blendon',
    'GET STARTED',
    'What Blendon does, what is switched on, and the keys it answers to',
    '',
    'B',
    false,
    false,
  ],
  [
    'Tutorial',
    'Tutorial',
    'GET STARTED',
    'Learn the gestures by doing them - each task ticks itself off, in any order',
    '_Help',
    null,
    false,
    false,
  ],
  [
    'OrbitSelected',
    'Orbit Selected',
    'NAVIGATING',
    "Turn the camera around whatever is selected, not the Scene View's pivot",
    'd_SceneViewCamera',
    null,
    false,
    true,
  ],
  [
    'Pan',
    'Pan',
    'NAVIGATING',
    'Slide the camera sideways, anchored on the point under the cursor',
    'd_ViewToolMove',
    null,
    false,
    true,
  ],
  [
    'Zoom',
    'Zoom',
    'NAVIGATING',
    'Wheel and keyboard zoom that moves toward the cursor rather than the centre',
    'd_ViewToolZoom',
    null,
    false,
    true,
  ],
  [
    'ViewportNav',
    'Numpad Views',
    'NAVIGATING',
    "Blender's numpad: axis views, stepped orbit, projection toggle",
    'd_NetworkStartPosition Icon',
    null,
    false,
    true,
  ],
  [
    'OrientationGizmo',
    'Orientation Gizmo',
    'NAVIGATING',
    "The axis ball in the corner of the Scene View, drawn Blender's way",
    '',
    'OrientationGizmoOverlay',
    false,
    true,
  ],
  [
    'SharedGizmos',
    'All Tools',
    'TRANSFORM TOOLS',
    'Settings the four tools below share - size, snapping, precision, readouts',
    'd_Transform Icon',
    null,
    false,
    true,
  ],
  [
    'MoveGizmo',
    'Move',
    'TRANSFORM TOOLS',
    'Arrow handles, plane handles, and the grab-to-move key',
    'd_MoveTool',
    null,
    true,
    true,
  ],
  [
    'RotateGizmo',
    'Rotate',
    'TRANSFORM TOOLS',
    'Axis rings, trackball, look-at, and the grab-to-rotate key',
    'd_RotateTool',
    null,
    true,
    true,
  ],
  [
    'ScaleGizmo',
    'Scale',
    'TRANSFORM TOOLS',
    'Box handles, plane handles, and the grab-to-scale key',
    'd_ScaleTool',
    null,
    true,
    true,
  ],
  [
    'TransformGizmo',
    'Transform',
    'TRANSFORM TOOLS',
    "Move, rotate and scale on one gizmo - Unity's Transform tool, redrawn",
    'd_TransformTool',
    null,
    true,
    true,
  ],
  [
    'FrameSelected',
    'Frame Selected',
    'SCENE TOOLS',
    'Fit the selection to the view, with a camera move rather than a cut',
    'd_Grid.BoxTool@2x',
    null,
    false,
    true,
  ],
  [
    'IsolateView',
    'Isolate View',
    'SCENE TOOLS',
    'Hide everything except the selection while you work on it',
    'animationvisibilitytoggleon',
    null,
    false,
    true,
  ],
  [
    'SnapToFloor',
    'Snap to Floor',
    'SCENE TOOLS',
    'Drop the selection onto the surface below it, optionally aligned to it',
    'd_SnapIncrement',
    null,
    false,
    true,
  ],
  [
    'History',
    'Navigation History',
    'SCENE TOOLS',
    'Step back and forward through selections and camera positions',
    'd_UnityEditor.HistoryWindow',
    null,
    false,
    true,
  ],
  [
    'BoxSelect',
    'Box Select',
    'SCENE TOOLS',
    'Drag a box that selects everything it touches, not just what fits inside it',
    'd_RectTool',
    null,
    false,
    true,
  ],
  [
    'Keyboard',
    'Keyboard',
    'KEYS & MENUS',
    'Every key Blendon answers to, in one table',
    'd_Keyboard',
    null,
    false,
    false,
  ],
  [
    'PieMenus',
    'Pie Menus',
    'KEYS & MENUS',
    'Radial menus you hold a key to open - the shipped ones and your own',
    'd_AvatarPivot',
    null,
    false,
    true,
  ],
  [
    'SceneMenu',
    'Context Menu',
    'KEYS & MENUS',
    "Right-click the Scene View for a grouped, searchable menu with every entry Unity's has",
    'd__Menu',
    null,
    false,
    true,
  ],
];

const PAGE_OWNER: Record<string, string> = {
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

// Icons the window draws itself, beyond the ones the pages name.
const CHROME_ICONS = [
  'd_Search Icon',
  'd_Close',
  'd_Preset.Context',
  'd_Grid.PaintTool',
  'd_SceneViewCamera',
  'd_Keyboard',
  'd_Settings',
  '_Help',
  'd_Refresh',
  'd_AvatarPivot',
  'd_ToolsToggle',
  'd_Toolbar Plus',
  'd_Folder Icon',
  'd_EyeDropper.Large',
  'MouseRight',
  'MouseLeft',
  'MouseMiddle',
  'd_Grid.PickingTool',
  'd_Transform Icon',
  'd__Menu',
];

// The page header videos are the feature clips the landing page shows too.
export const HEADER_CLIP: Record<string, string> = {
  OrbitSelected: 'OrbitSelected',
  Pan: 'Pan',
  Zoom: 'Zoom',
  NumpadViews: 'NumpadViews',
  OrientationGizmo: 'OrientationGizmo',
  'NavigationHistory/SelectionHeader': 'SelectionHistory',
  'NavigationHistory/ViewHeader': 'ViewHistory',
  Move: 'Move',
  Rotate: 'Rotate',
  Scale: 'Scale',
  Transform: 'Transform',
  AllTools: 'AllTools',
  BoxSelect: 'BoxSelect',
  FrameSelected: 'FrameSelected',
  IsolateView: 'IsolateView',
  SnapToFloor: 'SnapToFloor',
  PieMenus: 'PieMenus',
  ContextMenu: 'ContextMenu',
};

const FRAME_INFO: Record<string, [string, string]> = {
  SelectionCenter: ['Selection Center', 'Turn the camera to the middle of the whole selection'],
  ActivePivot: ['Active Pivot', "Turn the camera to the active object's pivot"],
  ZoomIn: ['Zoom In', "Close in until the selection fills the view, Unity's own frame"],
  BackToStart: ['Back to Start', 'Go back to the view you had before the first press'],
};

const TIP_TITLE = (title: string, body: string) => '<size=14><b>' + title + '</b></size>\n' + body;
const PRESET_NOTE = '\n\n<size=9><color=#92929A>Asks before applying. Switches Blendon on if it is off</color></size>';
const LEFT_OFF = '\n\n<size=9><b><color=#92929A>LEFT OFF</color></b></size>\n';

/**
 * Converts one Draw* method of a settings class to ops, following its calls into the other Draw* methods
 * (`bodies` from readDrawBodies). `shortcutTips`: the card each two-argument ShortcutField row shows.
 */
export function pageConverter(
  bodies: Map<string, Stmt[]>,
  consts: Record<string, string>,
  shortcutTips: Record<string, Tip>,
): (owner: string, name: string) => Op[] {
  const run = (owner: string, name: string, ctx?: Ctx): Op[] => {
    const body = bodies.get(owner + '#' + name);
    if (!body) throw new Error('No ' + name + ' in ' + owner);
    return convert(ctx ?? new Ctx(owner, consts, shortcutTips), body, HELPERS);
  };
  const axisColors: Helper = () => run('SharedGizmoSettings', 'DrawAxisColorsGroup');
  const part =
    (owner: string): Helper =>
    () =>
      run(owner, 'DrawSettings');
  const HELPERS: Record<string, Helper> = {
    DrawAppearance: (ctx) => run(ctx.owner, 'DrawAppearance', ctx),
    DrawAxisColorsGroup: axisColors,
    'SharedGizmoSettings.DrawAxisColorsGroup': axisColors,
    'Move.DrawSettings': part('TransformMoveSettings'),
    'Rotate.DrawSettings': part('TransformRotateSettings'),
    'Scale.DrawSettings': part('TransformScaleSettings'),
    'Zoom.Settings.DrawKeyboardSettings': () => run('ZoomSettings', 'DrawKeyboardSettings'),
    DrawKeyboardSettings: () => run('ZoomSettings', 'DrawKeyboardSettings'),
    DrawShortcut: (ctx) => run(ctx.owner, 'DrawShortcut'),
    // Another page's key row (DrawMirroredShortcut draws the owner's DrawShortcut), grayed with that page.
    's.MirroredShortcut': (_ctx, args) => {
      const page = (args[0] ?? '').split('.').pop() ?? '';
      const owner = PAGE_OWNER[page];
      if (!owner) throw new Error('No settings class for mirrored page ' + page);
      return [['dis', ['!', ['f', 'pageEnabled', page]], run(owner, 'DrawShortcut')]];
    },
    // Drawn by a helper outside DrawSettings in C#, so its condition is spelled out here.
    TrackballRingNote: (ctx) => {
      const o = ctx.owner;
      const c: Cond = [
        '&&',
        ['&&', ['v', o + '.TrackballEnabled'], ['v', o + '.ScreenRingEnabled']],
        ['!', ['<', ['v', o + '.TrackballRadius'], ['v', o + '.ScreenRingRadius']]],
      ];
      return [
        [
          'if',
          c,
          [
            [
              'note',
              "The ball reaches the screen ring, so the ring can't be grabbed.",
              'The trackball hit-tests as a filled disc, so anything inside its radius belongs to it. ' +
                "Keep this radius under the Screen Ring's, or switch the ring off if the ball is what you want out there.",
            ],
          ],
          null,
        ],
      ];
    },
    'FrameSelectedSequenceTable.Draw': () => [['frameSeq']],
    'SceneMenuExtrasTable.Draw': () => [['extras']],
  };

  return (owner, name) => run(owner, name);
}

/** Asset paths (relative to the site root) the data points at, and where each comes from. */
export interface WindowDataResult {
  data: WindowDataFile;
  assets: AssetPlan[];
}

const keysOf = (k: DumpKeys): Keys => ({ b: k.blendon, u: k.unity });

/** A Tip holding only what is set, so a card without tokens stays one text in the JSON. */
const tipOf = (t: string, i: string, src: string | undefined): Tip => (src === undefined ? { t, i } : { t, i, src });

/**
 * Files every problem in `out` and goes as far as it can: the C# pages and the constants are checked even when
 * the dump breaks the contract, the data itself is only built (non-null) from a dump that keeps it.
 * `extraIcons`: editor icons drawn by pages the ops don't describe (the tutorial's chapters).
 */
export function buildWindowData(paths: PluginPaths, out: Problems, extraIcons: string[] = []): WindowDataResult | null {
  const { dump, consts: C, shortcutTips } = loadDump(paths.ref, out);
  const bodies = readDrawBodies(paths.editor);
  const assets: AssetPlan[] = [];
  const asset = (plan: AssetPlan) => {
    assets.push(plan);
    return plan.out;
  };
  // A constant the site reads by name: gone from the plugin is an error, never an empty text.
  const need = (name: string): string => {
    const v = C[name];
    if (v !== undefined) return v;
    out.add('model2.json: no constant ' + name);
    return '';
  };

  // ---- page ops ----
  // A shortcut row shows the tooltip file's card. The dump's is the Overview's, with its click note added.
  const keyNote = need('OverviewTips.KeyNote');
  const cut = (s: string) => (keyNote && s.endsWith(keyNote) ? s.slice(0, -keyNote.length) : s);
  const rowTips: Record<string, Tip> = {};
  for (const [id, tip] of Object.entries(shortcutTips))
    rowTips[id] = tipOf(cut(tip.t), tip.i, tip.src === undefined ? undefined : cut(tip.src));
  const run = pageConverter(bodies, C, rowTips);

  // One page that fails to convert is filed, the rest still convert.
  const page = (id: string, ...parts: [string, string][]): Op[] =>
    out.guard('C# page ' + id, () => parts.flatMap(([owner, name]) => run(owner, name))) ?? [];
  const pages: Record<string, Op[]> = {
    OrbitSelected: page('OrbitSelected', ['OrbitSelectedSettings', 'DrawSettings']),
    Pan: page('Pan', ['PanSettings', 'DrawSettings']),
    Zoom: page('Zoom', ['ZoomSettings', 'DrawSettings']),
    ViewportNav: page('ViewportNav', ['ViewportNavSettings', 'DrawSettings']),
    OrientationGizmo: page('OrientationGizmo', ['OrientationGizmoSettings', 'DrawSettings']),
    SharedGizmos: page('SharedGizmos', ['SharedGizmoSettings', 'DrawSettings']),
    MoveGizmo: page('MoveGizmo', ['MoveGizmoSettings', 'DrawSettings']),
    RotateGizmo: page('RotateGizmo', ['RotateGizmoSettings', 'DrawSettings']),
    ScaleGizmo: page('ScaleGizmo', ['ScaleGizmoSettings', 'DrawSettings']),
    TransformGizmo: page('TransformGizmo', ['TransformGizmoSettings', 'DrawSettings']),
    FrameSelected: page('FrameSelected', ['FrameSelectedSettings', 'DrawSettings']),
    IsolateView: page('IsolateView', ['IsolateViewSettings', 'DrawSettings']),
    SnapToFloor: page('SnapToFloor', ['SnapToFloorSettings', 'DrawSettings']),
    History: page('History', ['HistorySettings', 'DrawSettings'], ['ViewHistorySettings', 'DrawSettings']),
    BoxSelect: page('BoxSelect', ['BoxSelectSettings', 'DrawSettings']),
    PieMenus: [
      ...page('PieMenus', ['PieMenuSettings', 'DrawSettings'], ['WireframeToggleSettings', 'DrawSettings']),
      ['pieList'],
    ],
    SceneMenu: page('SceneMenu', ['SceneMenuSettings', 'DrawSettings']),
    Keyboard: [['keyboard']],
    Tutorial: [['tutorial']],
  };

  // OverviewPage draws the Tool Context section from GeneralSettings rows, copied here and checked below.
  const toolContext: Op[] = [
    ['sub', 'Tool Context', 'd_Transform Icon', 15, 0],
    ...page(
      'Overview',
      ['GeneralSettings', 'DrawToggleContextShortcut'],
      ['GeneralSettings', 'DrawEscapeKeepsContextToggle'],
    ),
  ];
  checkOverviewCopy(paths.editor, out);
  pages.Overview = [['overview', page('Overview', ['GeneralSettings', 'DrawSettings']), toolContext]];

  // ---- constants ----
  const consts: Record<string, string> = {
    masterOffWarning: need('SettingsEditorWindow.MasterOffWarning'),
    masterOffNote: need('OverviewPage.MasterOffNote'),
    layoutTooltip: need('OverviewPage.LayoutTooltip'),
    tutorialStartOverTip: need('TutorialPage.StartOverTooltip'),
    tutorialStartOverImage: need('TutorialPage.StartOverImage'),
    tutorialRestartTitle: need('TutorialPage.RestartTitle'),
    tutorialRestartBody: need('TutorialPage.RestartBody'),
    tutorialSearchCaption: need('TutorialPage.SearchCaption'),
    tutorialChooseNote: need('TutorialTaskRow.ChooseNote'),
    tutorialBadgeLabel: need('TutorialBadge.LabelText'),
    tutorialBadgeCloseTip: need('TutorialBadge.CloseTooltip'),
    tipsShownTip: need('OverviewPage.TipsShownTooltip'),
    ioTooltip: need('OverviewPage.SettingsIoTooltip'),
    exportTip: need('OverviewPage.ExportSettingsTooltip'),
    importTip: need('OverviewPage.ImportSettingsTooltip'),
    keyboardIntro: need('KeyboardPage.Intro'),
    appearanceTip: need('FoldBands.AppearanceTooltip'),
    contestedLinkHint: need('OverviewContestedTable.LinkHint'),
    customPresetTip: need('GizmoAppearancePresets.CustomDescription'),
    gizmoPresetsNote: need('GizmoAppearancePresets.PresetsNote'),
    presetsOn: need('OverviewMasterPanel.PresetsOn'),
    presetsOff: need('OverviewMasterPanel.PresetsOff'),
    restoreTip: need('ShortcutRows.RestoreTooltip'),
  };
  const kbImages = [need('OverviewPage.ApplyBlenderImage'), need('OverviewPage.ApplyUnityImage')];
  const pieNote = need('OverviewTips.PieNote');
  const rowImage = need('OverviewContestedTable.RowImage');

  if (!dump) return null;
  const { m1: M1, m2: M2, m3: M3 } = dump;

  // ---- keys ----
  const keymap: Record<string, Keys> = {};
  for (const [id, k] of Object.entries(M2.keymap)) keymap[id] = keysOf(k);
  const keyed = (id: string, where: string, keys?: DumpKeys) => {
    const k = keymap[id];
    if (!k) out.add(`model2.json keymap: no ${id}, which ${where} names`);
    else if (keys && (keys.blendon !== k.b || keys.unity !== k.u))
      out.add(`${where}: keys of ${id} differ from model2.json keymap`);
  };

  for (const id of Object.keys(M2.contextNeed)) keyed(id, 'model2.json contextNeed');

  // ---- props ----
  const enumLabels: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(M3.enums)) enumLabels[k] = Object.fromEntries(v);
  const modLabels = Object.fromEntries(M3.modifierOptions.map((o, i) => [o, M3.modifierLabels[i] ?? o]));
  const props: Record<string, PropInfo> = {};
  const headers: Record<string, PageHeader> = {};
  const switchTips: Record<string, Tip> = {};
  for (const p of M1.pages) {
    if (p.header) {
      const h = p.header;
      headers[p.type] = {
        image: h.image,
        video: h.video,
        footer: h.footer ?? '',
        sections: h.sections,
        keys: h.keys.map((k) => ({ action: k.action, active: k.active, bindings: k.bindings.map(keysOf) })),
        search: '',
      };
    }
    switchTips[p.type] = toTip(p.switchTip);
    for (const x of p.props) {
      const e: PropInfo = { l: x.label, ...toTip(x.tip), d: x.default, k: x.ptype };
      if (x.icon) e.ic = x.icon;
      if (x.options) {
        if (x.ptype === 'ModifierKey') e.o = M3.modifierOptions.map((o) => [o, modLabels[o] ?? o]);
        else {
          const lab = enumLabels[x.ptype] ?? {};
          e.o = x.options.map((o) => [o, lab[o] ?? o]);
        }
      }
      props[p.type + '.' + x.name] = e;
    }
  }
  const switchOf = (owner: string): Tip => {
    const tip = switchTips[owner];
    if (!tip) out.add('model.json: no page ' + owner);
    return tip ?? { t: '', i: '' };
  };
  // The All Tools page's master switch reads all four tools at once.
  props['SharedGizmoSettings.AllToolsEnabled'] = {
    l: 'Enable All Tools',
    ...switchOf('SharedGizmoSettings'),
    d: true,
    k: 'Boolean',
  };
  // The master switch's card is the Enabled row's.
  const master = props['GeneralSettings.Enabled'];
  if (!master) out.add('model.json: no GeneralSettings.Enabled');
  switchTips.GeneralSettings = master ? tipOf(master.t, master.i, master.src) : switchOf('GeneralSettings');

  // ---- shortcuts ----
  const shortcuts: Record<string, ShortcutInfo> = {};
  for (const ps of Object.values(M2.pageShortcuts))
    for (const s of ps.ids) {
      keyed(s.id, 'model2.json pageShortcuts', s.keys);
      shortcuts[s.id] = { d: s.keys.blendon, n: s.name, ...toTip(s.tip) };
    }
  for (const p of M3.pies) {
    keyed(p.shortcutId, 'model3.json pies', p.keys);
    shortcuts[p.shortcutId] ??= { d: p.keys.blendon, n: p.title, t: '', i: '' };
  }

  // The Transform parts' own props fall back to the standalone tools' where the dump has none.
  const PART_BASE: Record<string, string> = {
    TransformMoveSettings: 'MoveGizmoSettings',
    TransformRotateSettings: 'RotateGizmoSettings',
    TransformScaleSettings: 'ScaleGizmoSettings',
  };
  const fillParts = (o: unknown): void => {
    if (!Array.isArray(o)) return;
    for (const x of o) {
      if (typeof x === 'string') {
        const [cls, name] = x.split('.');
        const base = cls ? PART_BASE[cls] : undefined;
        if (base && name && !(x in props)) {
          const b = props[base + '.' + name];
          if (b) props[x] = { ...b };
        }
      }
      fillParts(x);
    }
  };
  for (const v of Object.values(pages)) fillParts(v);
  shortcuts['Blendon/Context Menu'] ??= {
    d: String(props['SceneMenuSettings.Shortcut']?.d ?? ''),
    n: 'Context Menu',
    t: '',
    i: '',
  };

  // ---- icons ----
  const used = new Set<string>([...CHROME_ICONS, ...extraIcons]);
  const collectIcons = (o: unknown): void => {
    if (!Array.isArray(o)) return;
    if (o[0] === 'sub' && typeof o[2] === 'string' && o[2]) used.add(o[2]);
    for (const x of o) collectIcons(x);
  };
  for (const v of Object.values(pages)) collectIcons(v);
  for (const c of CATALOG) if (c[4]) used.add(c[4]);
  for (const p of M3.pies) used.add(p.icon);

  const uiManifest = readUiManifest(join(paths.ref, 'ui', 'ui.json'));
  const icons: Record<string, IconInfo> = {};
  const missing: string[] = [];
  for (const name of [...used].sort()) {
    const file = uiManifest[name];
    if (!file) {
      missing.push(name);
      continue;
    }
    icons[name] = { u: asset({ kind: 'copy', src: join(paths.ref, 'ui', file), out: 'plugin/icons/' + file }), v: '' };
  }
  if (missing.length) console.warn('  icons missing from the UI dump:', missing.join(', '));
  const pluginIcon = (key: string, rel: string) => {
    icons[key] = {
      u: asset({ kind: 'copy', src: join(paths.icons, rel), out: 'plugin/icons/' + rel.replace(/\//g, '_') }),
      v: '',
    };
  };
  pluginIcon('B', 'B@2x.png');
  pluginIcon('OrientationGizmoOverlay', 'Overlays/OrientationGizmo@2x.png');
  // The Tool Contexts overlay's switch for Blendon's context, dark skin like the rest of the Scene view.
  pluginIcon('BlendonContext', 'Overlays/d_BlendonContext@2x.png');
  pluginIcon('TipBulb', 'Notice/TipBulb@2x.png');
  pluginIcon('MouseBack', 'Shortcuts/MouseBack@2x.png');
  pluginIcon('MouseForward', 'Shortcuts/MouseForward@2x.png');
  // Icons are drawn through CSS (mask/background), each exposed as a custom property.
  Object.keys(icons)
    .sort()
    .forEach((k, i) => {
      const icon = icons[k];
      if (icon) icon.v = 'i' + i;
    });

  const catalog: CatalogPage[] = CATALOG.map(([id, label, group, summary, iconName, iconPath, indent, feature]) => ({
    id,
    label,
    group,
    summary,
    icon: iconPath ?? iconName,
    iconName,
    accent: ACCENTS[id] ?? '#F29E2E',
    indent,
    feature,
  }));

  // ---- tooltip images ----
  const tipPaths = new Set<string>();
  const walkTips = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const x of o) {
        if (typeof x === 'string' && x.startsWith('Tips/') && x.endsWith('.png')) tipPaths.add(x);
        walkTips(x);
      }
    } else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if ((k === 'i' || k === 'image') && typeof v === 'string' && v.startsWith('Tips/')) tipPaths.add(v);
        walkTips(v);
      }
    }
  };
  for (const o of [props, pages, shortcuts, M2, M3, switchTips]) walkTips(o);
  for (const n of readdirSync(join(paths.icons, 'Tips', 'Overview')))
    if (!n.endsWith('.meta')) tipPaths.add('Tips/Overview/' + n);
  const tips: Record<string, string> = {};
  const tipAR: Record<string, string> = {};
  for (const t of [...tipPaths].sort()) {
    tips[t] = asset({
      kind: 'webp',
      src: join(paths.icons, t),
      out: 'plugin/tips/' + t.slice(5).replace(/\//g, '_').replace('.png', '.webp'),
      quality: 88,
      onSize: (w, h) => (tipAR[t] = w + ' / ' + h),
    });
  }

  // ---- page headers ----
  const headerImages: Record<string, string> = {};
  const headerVideos: Record<string, string> = {};
  for (const h of Object.values(headers)) {
    const image = 'plugin/headers/' + h.image.slice(5).replace(/\//g, '_').replace('.png', '.webp');
    headerImages[h.image] = asset({ kind: 'webp', src: join(paths.icons, h.image), out: image, quality: 90 });
    const key = h.video.slice(5).replace('/Header.webm', '').replace('.webm', '');
    const clip = HEADER_CLIP[key];
    if (!clip) {
      out.add('No clip for header video ' + h.video);
      continue;
    }
    headerVideos[h.video] = asset({
      kind: 'copy',
      src: join(paths.video, clip + '.mp4'),
      out: 'plugin/video/' + clip + '.mp4',
    });
    h.search = [...h.sections.map((s) => s[0] + ' ' + s[1]), ...h.keys.map((k) => k.action), h.footer].join(' ');
  }
  const logo = asset({ kind: 'copy', src: join(paths.icons, 'Blendon.png'), out: 'plugin/icons/Blendon.png' });

  // ---- overview ----
  // OverviewContestedTable draws every state's card with the same picture.
  const rowCard = (c: DumpCard) => toTip({ ...c, image: c.image || rowImage });
  const contested: ContestedRow[] = M2.known.map((k) => {
    keyed(k.row.BlendonId, 'model2.json known');
    keyed(k.row.UnityId, 'model2.json known');
    return {
      uid: k.row.UnityId,
      ul: k.row.UnityLabel,
      bid: k.row.BlendonId,
      bl: k.row.BlendonLabel,
      key: k.row.Key,
      replaces: k.row.Replaces,
      blendonAlt: k.blendonAlt,
      editorAlt: k.editorAlt,
      cards: {
        Covered: rowCard(k.cards.Covered),
        Replaced: rowCard(k.cards.Replaced),
        Moved: rowCard(k.cards.Moved),
        Free: rowCard(k.cards.Free),
      },
    };
  });
  const pageShortcuts = Object.fromEntries(
    Object.entries(M2.pageShortcuts).map(([k, v]) => [k, v.ids.map((s) => s.id)]),
  );
  const primaryShortcut = Object.fromEntries(Object.entries(M2.pageShortcuts).map(([k, v]) => [k, v.primary]));
  for (const sid of Object.values(pageShortcuts).flat())
    shortcuts[sid] ??= { d: keymap[sid]?.b ?? '', n: sid.split('/').pop() ?? sid, t: '', i: '' };
  const featureGroups = (
    [
      ['TRANSFORM TOOLS', 'TRANSFORM TOOLS'],
      ['SCENE TOOLS', 'SCENE TOOLS'],
      ['NAVIGATING', 'NAVIGATING'],
      ['KEYS & MENUS', 'MENUS'],
    ] as const
  ).map(([g, caption]) => ({ caption, pages: catalog.filter((c) => c.feature && c.group === g).map((c) => c.id) }));
  const pies = M3.pies.map((p) => ({
    id: p.id,
    title: p.title,
    icon: p.icon,
    sid: p.shortcutId,
    enabled: p.enabled,
    filled: p.filled,
    desc: p.desc,
    tipRow: toTip(p.tipRow),
    // The Overview's card for the pie (OverviewTips.Pie): the pie's own card, noting where a click goes.
    tipOverview: p.tipGet.text
      ? toTip({ text: p.tipGet.text + pieNote, image: p.tipGet.image, source: p.tipGet.source + pieNote })
      : { t: '', i: '' },
  }));
  const featureTips: Record<string, Tip> = {};
  for (const [k, v] of Object.entries(M2.featureTips)) if (v) featureTips[k] = toTip(v);

  const labelToProp: Record<string, string> = {};
  for (const k of Object.keys(props)) if (k.startsWith('SceneMenuSettings.')) labelToProp[props[k]?.l ?? ''] = k;
  const extras = M3.extras.map((e) => {
    const pk = labelToProp[e.Label] ?? null;
    return {
      id: pk,
      section: e.Section,
      label: e.Label,
      prop: pk,
      inline: e.InlineSetting_null ? null : (labelToProp[e.Label + ' Inline'] ?? null),
      tip: toTip(e.Tip),
      inlineTip: toTip(e.InlineTip),
    };
  });
  const extraSections = (M3.enums.SceneMenuGroup ?? []).map((s): [string, string] => [
    s[0],
    ({ Extra: 'Menu Top', Align: 'View' } as Record<string, string>)[s[0]] ?? s[0],
  ]);
  const layers = M3.layers.map((l): [number, string] => {
    const i = l.indexOf(':');
    return [Number(l.slice(0, i)), l.slice(i + 1)];
  });

  // Page values that read the Defaults card (or another page) until overridden.
  const followers: Record<string, string> = {};
  const walkFollow = (o: unknown): void => {
    if (!Array.isArray(o)) return;
    if (['gtog', 'gsld', 'gpop', 'imod'].includes(o[0] as string)) followers[o[1] as string] = o[2] as string;
    for (const x of o) walkFollow(x);
  };
  for (const v of Object.values(pages)) walkFollow(v);

  // ---- presets ----
  const presets = [
    {
      name: 'Full',
      on: null,
      confirm: 'Every feature switched on. Your tuning, your keys and your shortcut profile are kept.',
      tip: {
        t:
          TIP_TITLE('Full', 'Every feature on.') +
          '\n\n<size=9><b><color=#92929A>KEPT</color></b></size>\nYour tuning, your keys and your shortcut profile.' +
          PRESET_NOTE,
        i: 'Tips/Overview/PresetFull.png',
      },
    },
    {
      name: 'Essentials',
      on: [
        'OrbitSelected',
        'Pan',
        'Zoom',
        'OrientationGizmo',
        'SharedGizmos',
        'MoveGizmo',
        'RotateGizmo',
        'ScaleGizmo',
        'TransformGizmo',
      ],
      confirm:
        "Navigation and the transform tools, with their grab and vertex-snap keys. The numpad views, pie menus, context menu and scene tools stay off, and the Editor keeps the keys they would have taken. The closest thing to Blender's feel without relearning a keypad.",
      tip: {
        t:
          TIP_TITLE('Essentials', "Navigation and the transform tools: Blender's feel without learning a keypad.") +
          LEFT_OFF +
          'Numpad views, pie menus, context menu and scene tools. The Editor keeps their keys.' +
          PRESET_NOTE,
        i: 'Tips/Overview/PresetEssentials.png',
      },
    },
    {
      name: 'Tools Only',
      on: ['SharedGizmos', 'MoveGizmo', 'RotateGizmo', 'ScaleGizmo', 'TransformGizmo'],
      confirm:
        'Just the transform gizmos, with their grab and vertex-snap keys. Navigation, the numpad, the pie menus, the context menu and the scene tools all stay off, and the Editor keeps every key they would have taken.',
      tip: {
        t:
          TIP_TITLE('Tools Only', 'Just the transform gizmos, with their grab and vertex-snap keys.') +
          LEFT_OFF +
          'Navigation, numpad, pie menus, context menu and scene tools. The Editor keeps their keys.' +
          PRESET_NOTE,
        i: 'Tips/Overview/PresetToolsOnly.png',
      },
    },
  ];
  const gizmoPresets = readGizmoPresets(
    join(paths.editor, 'Gizmos', 'Common', 'Defaults', 'presets.defaults.json'),
    props,
  );

  // The text is built from live keys in OverviewPage, only the pictures are data.
  const kbTips: Tip[] = kbImages.map((i) => ({ t: '', i }));

  const resetOwners: Record<string, string[]> = {
    Overview: ['GeneralSettings'],
    SharedGizmos: ['SharedGizmoSettings'],
    History: ['HistorySettings', 'ViewHistorySettings'],
    PieMenus: ['PieMenuSettings', 'WireframeToggleSettings'],
    TransformGizmo: TRANSFORM_PARTS,
  };
  for (const [k, v] of Object.entries(PAGE_OWNER)) resetOwners[k] ??= [v];

  const data: WindowDataFile = {
    catalog,
    icons,
    props,
    shortcuts,
    keymap,
    contextNeed: M2.contextNeed,
    pages,
    headers,
    switchTips,
    consts,
    contested,
    // OverviewContestedTable.MinWidth: the label indent, two name/key column pairs with their gutters, the action column
    // one row square.
    contestedMinWidth: 22 + (118 + 8 + 148 + 14) * 2 + 10 + 20,
    featureGroups,
    pies,
    pageShortcuts,
    primaryShortcut,
    featureTips,
    frameSteps: M3.frameSteps.map(([id, on]) => ({ id, on })),
    frameStepInfo: Object.fromEntries(Object.entries(FRAME_INFO).map(([k, [label, tip]]) => [k, { label, tip }])),
    extras,
    extraSections,
    layers,
    mouseIcons: ['MouseRight', 'MouseLeft', 'MouseMiddle', 'MouseBack', 'MouseForward'],
    headerImages,
    headerVideos,
    tips,
    tipAR,
    logo,
    // The captured editor's values that are off their defaults.
    initial: {
      'SharedGizmoSettings.PerObjectLocalAxes': true,
      'SceneMenuSettings.Grouping': true,
    },
    presets,
    gizmoPresets,
    kbTips,
    followers,
    pageOwner: PAGE_OWNER,
    resetOwners,
  };
  checkTokens(data, data, out);
  return { data, assets };
}

// OverviewPage's statements the sync copies by hand, in draw order.
const OVERVIEW_COPY = [
  's.SubLabel("Tool Context", "d_Transform Icon");',
  'general.DrawToggleContextShortcut(s);',
  'general.DrawEscapeKeepsContextToggle(s);',
];

/** The Overview's own layout isn't parsed, so a change to the part the sync copies must stop the sync. */
function checkOverviewCopy(editorDir: string, out: Problems): void {
  const file = walkFiles(editorDir).find((f) => basename(f) === 'OverviewPage.cs');
  if (!file) return out.add('OverviewPage.cs: not found');
  const code = stripComments(readFileSync(file, 'utf8')).replace(/\s+/g, ' ');
  let at = 0;
  for (const statement of OVERVIEW_COPY) {
    const i = code.indexOf(statement, at);
    if (i < 0) return out.add('OverviewPage.cs no longer draws, in this order: ' + OVERVIEW_COPY.join(' '));
    at = i + statement.length;
  }
}

/** Every {key:} and {setting:} a text in `texts` names must resolve on the site, as TipText warns in the Editor. */
export function checkTokens(texts: unknown, data: Pick<WindowDataFile, 'keymap' | 'props'>, out: Problems): void {
  const walk = (o: unknown): void => {
    if (typeof o === 'string') {
      for (const m of o.matchAll(/\{key:([^}]*)\}/g))
        if (!data.keymap[m[1] ?? '']) out.add(`A text names {key:${m[1]}}, which model2.json keymap lacks`);
      for (const m of o.matchAll(/\{setting:([^}]*)\}/g))
        if (!data.props[m[1] ?? '']) out.add(`A text names {setting:${m[1]}}, which is no setting`);
    } else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(texts);
}

/** Icon name -> file in the UI dump. The dump writes numbers with the editor's locale decimal comma. */
function readUiManifest(path: string): Record<string, string> {
  const raw = readFileSync(path, 'utf8').replace(/"ppp":(\d+),(\d+)/, '"ppp":$1.$2');
  const ui = JSON.parse(raw) as { icons: Record<string, string> };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ui.icons)) if (v) out[k] = v.split(':')[0] ?? v;
  return out;
}

interface PresetsFile {
  Presets: { Name: string; Description: string; Values: Record<string, Record<string, PropValue>> }[];
}

function readGizmoPresets(path: string, props: Record<string, PropInfo>) {
  const file = readJson<PresetsFile>(path);
  const SECTION_OWNER: Record<string, string> = {
    Shared: 'SharedGizmoSettings',
    AxisColors: 'GeneralSettings',
    Move: 'MoveGizmoSettings',
    Rotate: 'RotateGizmoSettings',
    Scale: 'ScaleGizmoSettings',
    TransformMove: 'TransformMoveSettings',
    TransformRotate: 'TransformRotateSettings',
    TransformScale: 'TransformScaleSettings',
  };
  const AXIS: Record<string, string> = { X: 'AxisColorX', Y: 'AxisColorY', Z: 'AxisColorZ', Outline: 'OutlineColor' };
  return file.Presets.map((p) => {
    const values: Record<string, PropValue> = {};
    for (const [section, owner] of Object.entries(SECTION_OWNER)) {
      for (const [k, raw] of Object.entries(p.Values[section] ?? {})) {
        const key = owner + '.' + (section === 'AxisColors' ? (AXIS[k] ?? k) : k);
        const prop = props[key];
        if (!prop) continue;
        values[key] = typeof raw === 'string' && prop.k === 'Color' ? '#' + raw.toUpperCase() : raw;
      }
    }
    return { name: p.Name, desc: p.Description, values };
  });
}
