// Builds the settings window's data (src/window/data/schema.ts) from the Blendon sources and the
// Unity model dumps in Metadata~/PlaygroundRef.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  CatalogPage,
  ContestedRow,
  Cond,
  IconInfo,
  Op,
  PageHeader,
  PropInfo,
  PropValue,
  ShortcutInfo,
  Tip,
  WindowData,
} from '../../src/window/data/schema.ts';
import type { AssetPlan } from './assets.ts';
import { drawMethods, parse, type Stmt } from './csharp.ts';
import { convert, Ctx, type Helper } from './ops.ts';

// ---- Unity dump shapes (only the parts read here) ------------------------------------------------

interface DumpTip {
  text: string;
  image: string;
}
interface DumpProp {
  name: string;
  ptype: string;
  label: string;
  icon?: string;
  tip: DumpTip;
  default: PropValue;
  options?: string[];
}
interface DumpHeader {
  image: string;
  video: string;
  footer?: string;
  sections: [string, string][];
  keys: { action: string; active: boolean; bindings: string[] }[];
}
interface Model1 {
  pages: { type: string; switchTip: DumpTip; header?: DumpHeader; props: DumpProp[] }[];
}
interface Model2 {
  consts: Record<string, string>;
  pageShortcuts: Record<
    string,
    { primary: string | null; ids: { id: string; text: string; name: string; tip: DumpTip }[] }
  >;
  known: {
    row: { BlendonId: string; BlendonLabel: string; UnityLabel: string; Key: string; Tooltip: string };
    unityText: string;
  }[];
  featureTips: Record<string, DumpTip | null>;
}
interface Model3 {
  pies: {
    id: string;
    title: string;
    icon: string;
    shortcutId: string;
    text: string;
    enabled: boolean;
    filled: number;
    desc: string;
    tipRow: DumpTip;
  }[];
  extras: {
    Section: string;
    Label: string;
    InlineSetting_null: boolean;
    Tip: DumpTip;
    InlineTip: DumpTip;
  }[];
  frameSteps: [string, boolean][];
  tutorialStatus: string;
  modifierLabels: string[];
  modifierOptions: string[];
  enums: Record<string, [string, string][]>;
  layers: string[];
}

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

const ACCENTS: Record<string, string> = {
  Overview: '#F29E2E',
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
    'What Ɓlendon does, what is switched on, and the keys it answers to',
    '',
    'B',
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
const HEADER_CLIP: Record<string, string> = {
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

// BlendonMove per resolution (ShortcutProfileSetup.Resolutions), keyed by Blendon label.
const BLENDON_MOVE: Record<string, string> = {
  Grab: 'Shift+G',
  'Grab Rotate': 'Shift+R',
  'Grab Scale': 'Alt+S',
  'View Back': 'Ctrl+Num 5',
  'View Left': 'Ctrl+Num 6',
  'Quick Roll': 'Ctrl+Shift+Mouse 2',
  'View Pie': 'Ctrl+`',
  'Draw Mode Pie': 'Alt+Z',
  'Tools Pie': 'Alt+Q',
  'Vertex Snap': 'Alt+V',
  'Pick Virtual Pivot': 'Alt+Shift+V',
  'Context Menu': '',
  'Orbit Selected': 'Ctrl+Mouse 2',
  'Camera Pan': 'Alt+Mouse 2',
};

const TIP_TITLE = (title: string, body: string) => '<size=14><b>' + title + '</b></size>\n' + body;
const PRESET_NOTE = '\n\n<size=9><color=#92929A>Asks before applying. Switches Blendon on if it is off</color></size>';
const LEFT_OFF = '\n\n<size=9><b><color=#92929A>LEFT OFF</color></b></size>\n';

/** Asset paths (relative to the site root) the data points at, and where each comes from. */
export interface WindowDataResult {
  data: WindowData;
  assets: AssetPlan[];
}

export function buildWindowData(paths: PluginPaths): WindowDataResult {
  const M1 = readJson<Model1>(join(paths.ref, 'model.json'));
  const M2 = readJson<Model2>(join(paths.ref, 'model2.json'));
  const M3 = readJson<Model3>(join(paths.ref, 'model3.json'));
  const C = M2.consts;
  const bodies = readDrawBodies(paths.editor);
  const assets: AssetPlan[] = [];
  const asset = (plan: AssetPlan) => {
    assets.push(plan);
    return plan.out;
  };

  // ---- page ops ----
  const run = (owner: string, name: string, ctx?: Ctx): Op[] => {
    const body = bodies.get(owner + '#' + name);
    if (!body) throw new Error('No ' + name + ' in ' + owner);
    return convert(ctx ?? new Ctx(owner, C), body, HELPERS);
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
    'FrameSelected.Settings.DrawShortcut': () => run('FrameSelectedSettings', 'DrawShortcut'),
    'IsolateView.Settings.DrawShortcut': () => run('IsolateViewSettings', 'DrawShortcut'),
    DrawShortcut: (ctx) => run(ctx.owner, 'DrawShortcut'),
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

  const pages: Record<string, Op[]> = {
    OrbitSelected: run('OrbitSelectedSettings', 'DrawSettings'),
    Pan: run('PanSettings', 'DrawSettings'),
    Zoom: run('ZoomSettings', 'DrawSettings'),
    ViewportNav: run('ViewportNavSettings', 'DrawSettings'),
    OrientationGizmo: run('OrientationGizmoSettings', 'DrawSettings'),
    SharedGizmos: run('SharedGizmoSettings', 'DrawSettings'),
    MoveGizmo: run('MoveGizmoSettings', 'DrawSettings'),
    RotateGizmo: run('RotateGizmoSettings', 'DrawSettings'),
    ScaleGizmo: run('ScaleGizmoSettings', 'DrawSettings'),
    TransformGizmo: run('TransformGizmoSettings', 'DrawSettings'),
    FrameSelected: run('FrameSelectedSettings', 'DrawSettings'),
    IsolateView: run('IsolateViewSettings', 'DrawSettings'),
    SnapToFloor: run('SnapToFloorSettings', 'DrawSettings'),
    History: [...run('HistorySettings', 'DrawSettings'), ...run('ViewHistorySettings', 'DrawSettings')],
    BoxSelect: run('BoxSelectSettings', 'DrawSettings'),
    PieMenus: [
      ...run('PieMenuSettings', 'DrawSettings'),
      ...run('WireframeToggleSettings', 'DrawSettings'),
      ['pieList'],
    ],
    SceneMenu: run('SceneMenuSettings', 'DrawSettings'),
    Keyboard: [['keyboard']],
  };

  // The General (Defaults) card is drawn by hand in GeneralSettings.Defaults.cs.
  const G = 'GeneralSettings.';
  const generalOps: Op[] = [
    ['info', C['GeneralSettings.DefaultsIntro'] ?? ''],
    ['sub', 'Animation', 'Motion Icon', 15, 0],
    ['tog', G + 'AnimationEnabled'],
    ['dis', ['!', ['v', G + 'AnimationEnabled']], [['sld', G + 'AnimationDuration', 0.0001, 2]]],
    ['sub', 'Dragging', 'd_Grid.PickingTool', 15, 0],
    ['tog', G + 'RmbCancelEnabled'],
    ['tog', G + 'RestrictDragToActiveView'],
    ['sub', 'Cursor Wrap', 'DotFrame', 15, 0],
    ['tog', G + 'CursorWrapEnabled'],
    [
      'dis',
      ['!', ['v', G + 'CursorWrapEnabled']],
      [
        ['pop', G + 'CursorWrap'],
        ['if', ['f', 'supportsBounds', ['v', G + 'CursorWrap']], [['pop', G + 'WrapBounds']], null],
      ],
    ],
    ['sub', 'Axis Colors', 'd_Grid.PaintTool', 15, 0],
    [
      'dis',
      ['!', ['v', G + 'Enabled']],
      [
        ['col', G + 'AxisColorX'],
        ['col', G + 'AxisColorY'],
        ['col', G + 'AxisColorZ'],
      ],
    ],
    ['col', G + 'OutlineColor'],
  ];
  pages.Overview = [['overview', generalOps]];

  // ---- props ----
  const enumLabels: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(M3.enums)) enumLabels[k] = Object.fromEntries(v);
  const modLabels = Object.fromEntries(M3.modifierOptions.map((o, i) => [o, M3.modifierLabels[i] ?? o]));
  const props: Record<string, PropInfo> = {};
  const headers: Record<string, PageHeader> = {};
  const switchTips: Record<string, Tip> = {};
  for (const p of M1.pages) {
    if (p.header) headers[p.type] = { ...p.header, footer: p.header.footer ?? '', search: '' };
    switchTips[p.type] = { t: p.switchTip.text, i: p.switchTip.image };
    for (const x of p.props) {
      const e: PropInfo = { l: x.label, t: x.tip.text, i: x.tip.image, d: x.default, k: x.ptype };
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
  // The All Tools page's master switch reads all four tools at once.
  props['SharedGizmoSettings.AllToolsEnabled'] = {
    l: 'Enable All Tools',
    t: C['SharedGizmoSettings.SwitchTooltip'] ?? '',
    i: C['SharedGizmoSettings.SwitchImage'] ?? '',
    d: true,
    k: 'Boolean',
  };

  // ---- shortcuts ----
  const shortcuts: Record<string, ShortcutInfo> = {};
  for (const ps of Object.values(M2.pageShortcuts))
    for (const s of ps.ids) shortcuts[s.id] = { d: s.text, n: s.name, t: s.tip.text, i: s.tip.image };
  for (const p of M3.pies) shortcuts[p.shortcutId] ??= { d: p.text, n: p.title, t: '', i: '' };

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
  const used = new Set<string>(CHROME_ICONS);
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
    const out = 'plugin/tips/' + t.slice(5).replace(/\//g, '_').replace('.png', '.webp');
    tips[t] = asset({
      kind: 'webp',
      src: join(paths.icons, t),
      out,
      quality: 88,
      onSize: (w, h) => (tipAR[t] = w + ' / ' + h),
    });
  }

  // ---- page headers ----
  const headerImages: Record<string, string> = {};
  const headerVideos: Record<string, string> = {};
  for (const h of Object.values(headers)) {
    const out = 'plugin/headers/' + h.image.slice(5).replace(/\//g, '_').replace('.png', '.webp');
    headerImages[h.image] = asset({ kind: 'webp', src: join(paths.icons, h.image), out, quality: 90 });
    const key = h.video.slice(5).replace('/Header.webm', '').replace('.webm', '');
    const clip = HEADER_CLIP[key];
    if (!clip) throw new Error('No clip for header video ' + h.video);
    headerVideos[h.video] = asset({
      kind: 'copy',
      src: join(paths.video, clip + '.mp4'),
      out: 'plugin/video/' + clip + '.mp4',
    });
    h.search = [...h.sections.map((s) => s[0] + ' ' + s[1]), ...h.keys.map((k) => k.action), h.footer].join(' ');
  }
  const logo = asset({ kind: 'copy', src: join(paths.icons, 'Blendon.png'), out: 'plugin/icons/Blendon.png' });

  // ---- overview ----
  const contested: ContestedRow[] = M2.known.map((k) => ({
    bid: k.row.BlendonId,
    bl: k.row.BlendonLabel,
    ul: k.row.UnityLabel,
    key: k.row.Key,
    tip: k.row.Tooltip,
    uMove: k.unityText,
    bMove: BLENDON_MOVE[k.row.BlendonLabel] ?? '',
  }));
  const known = Object.fromEntries(
    contested.map((c) => [c.bid, { ul: c.ul, key: c.key, uMove: c.uMove, bMove: c.bMove }]),
  );
  const pageShortcuts = Object.fromEntries(
    Object.entries(M2.pageShortcuts).map(([k, v]) => [k, v.ids.map((s) => s.id)]),
  );
  const primaryShortcut = Object.fromEntries(Object.entries(M2.pageShortcuts).map(([k, v]) => [k, v.primary]));
  for (const sid of Object.values(pageShortcuts).flat())
    shortcuts[sid] ??= { d: '', n: sid.split('/').pop() ?? sid, t: '', i: '' };
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
    tipRow: { t: p.tipRow.text, i: p.tipRow.image },
  }));
  const featureTips: Record<string, Tip> = {};
  for (const [k, v] of Object.entries(M2.featureTips)) if (v) featureTips[k] = { t: v.text, i: v.image };

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
      tip: { t: e.Tip.text, i: e.Tip.image },
      inlineTip: { t: e.InlineTip.text, i: e.InlineTip.image },
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
      restores: true,
      on: [],
      confirm: 'Everything switched on, every value back to what the plugin ships with. Custom pie menus are kept.',
      tip: {
        t:
          TIP_TITLE('Full', 'Every feature on, every value back to what Blendon ships with.') +
          '\n\n<size=9><b><color=#92929A>KEPT</color></b></size>\nYour own pie menus.' +
          PRESET_NOTE,
        i: 'Tips/Overview/PresetFull.png',
      },
    },
    {
      name: 'Essentials',
      restores: false,
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
      restores: false,
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

  const consts: Record<string, string> = {
    masterOffWarning: C['SettingsEditorWindow.MasterOffWarning'] ?? '',
    masterOffNote: C['OverviewPage.MasterOffNote'] ?? '',
    layoutTooltip: C['OverviewPage.LayoutTooltip'] ?? '',
    tutorialStatus: M3.tutorialStatus,
    tutorialStatusTip: C['OverviewPage.TutorialStatusTooltip'] ?? '',
    tutorialProgressTip: C['OverviewPage.TutorialProgressTooltip'] ?? '',
    tipsShownTip: C['OverviewPage.TipsShownTooltip'] ?? '',
    ioTooltip: C['OverviewPage.SettingsIoTooltip'] ?? '',
    exportTip: C['OverviewPage.ExportSettingsTooltip'] ?? '',
    importTip: C['OverviewPage.ImportSettingsTooltip'] ?? '',
    keyboardIntro: C['KeyboardPage.Intro'] ?? '',
    appearanceTip: C['SettingsControls.AppearanceTooltip'] ?? '',
    contestedLinkHint: C['OverviewContestedTable.LinkHint'] ?? '',
    customPresetTip: C['GizmoAppearancePresets.CustomDescription'] ?? '',
    gizmoPresetsNote: C['GizmoAppearancePresets.PresetsNote'] ?? '',
  };
  const kbTips: Tip[] = [
    { t: C['OverviewPage.ApplyBlenderTooltip'] ?? '', i: 'Tips/Overview/KeyboardBlendon.png' },
    { t: C['OverviewPage.ApplyUnityTooltip'] ?? '', i: 'Tips/Overview/KeyboardUnity.png' },
  ];
  switchTips.SharedGizmoSettings = {
    t: C['SharedGizmoSettings.SwitchTooltip'] ?? '',
    i: C['SharedGizmoSettings.SwitchImage'] ?? '',
  };
  switchTips.GeneralSettings = {
    t: C['GeneralSettings.MasterSwitchTooltip'] ?? '',
    i: C['GeneralSettings.MasterSwitchTipImage'] ?? '',
  };

  const resetOwners: Record<string, string[]> = {
    Overview: ['GeneralSettings'],
    SharedGizmos: ['SharedGizmoSettings'],
    History: ['HistorySettings', 'ViewHistorySettings'],
    PieMenus: ['PieMenuSettings', 'WireframeToggleSettings'],
    TransformGizmo: TRANSFORM_PARTS,
  };
  for (const [k, v] of Object.entries(PAGE_OWNER)) resetOwners[k] ??= [v];

  const data: WindowData = {
    catalog,
    icons,
    props,
    shortcuts,
    known,
    pages,
    headers,
    switchTips,
    consts,
    contested,
    // Overview contested table: two label/key column pairs plus the divider and side padding.
    contestedMinWidth: 22 + (118 + 8 + 148 + 14) * 2 + 10 + 22,
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
      'BoxSelectSettings.Enabled': true,
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
  return { data, assets };
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
