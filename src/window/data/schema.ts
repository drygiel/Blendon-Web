// Shape of src/generated/window-data.json, written by `pnpm sync` from the Blendon sources and the
// Unity model dumps. Asset fields hold paths relative to the site root (see assetUrl).

/** A boolean-ish expression over setting values, mirroring the C# conditions of the DrawSettings code. */
export type Cond =
  | ['v', string]
  | ['c', string | number | boolean]
  | ['f', 'anyTool' | 'searching']
  | ['f', 'supportsBounds' | 'wrapsAtEdge' | 'aimClash', Cond]
  | ['f', 'pageEnabled', string]
  | ['!', Cond]
  | ['&&' | '||' | '==' | '!=' | '<', Cond, Cond];

/** Lead-in above a sub label: fixed, or [_, with preview, without preview]. */
export type SubSpace = number | ['previewSpace', number, number];

/** One SettingsControls call (or a structural marker) of a settings page, in draw order. */
export type Op =
  | ['sub', string, string, SubSpace, number | string]
  | ['tog', string]
  | ['sld', string, number, number]
  | ['pop', string]
  | ['col', string]
  | ['msk', string]
  | ['gtog', string, string]
  | ['gpop', string, string]
  | ['gsld', string, string, number, number]
  | ['imod', string, string, string]
  | ['sc', string, string]
  | ['sc', string, null, string, string, string]
  | ['nat', string]
  | ['clash', string]
  | ['note', string, string]
  | ['info', string]
  | ['warn', string]
  | ['ilink', string, string, string, string]
  | ['plink', string, string]
  | ['space', number]
  | ['master', 'page', string, string]
  | ['master', 'custom', string, string, string, string]
  | ['master', 'gizmo', string, string, string]
  | ['prev', string]
  | ['card', string]
  | ['endcard']
  | ['dis', Cond, Op[]]
  | ['if', Cond, Op[], Op[] | null]
  | ['fold', string, Op[]]
  | ['overview', Op[]]
  | ['frameSeq']
  | ['extras']
  | ['pieList']
  | ['keyboard'];

/** A tooltip: Unity rich text plus an optional image (key into WindowData.tips). */
export interface Tip {
  t: string;
  i: string;
}

export type PropValue = boolean | number | string;

export interface PropInfo {
  /** Label. */
  l: string;
  /** Tooltip text and image. */
  t: string;
  i: string;
  /** Default value. */
  d: PropValue;
  /** C# type name (Boolean, Single, Color, an enum...). */
  k: string;
  /** Enum options as [value, label]. */
  o?: [string, string][];
  /** Inline icon shown before the label. */
  ic?: string;
}

export interface ShortcutInfo {
  /** Default binding text. */
  d: string;
  /** Display name. */
  n: string;
  t: string;
  i: string;
}

export interface CatalogPage {
  id: string;
  label: string;
  group: string;
  summary: string;
  icon: string;
  iconName: string;
  accent: string;
  indent: boolean;
  feature: boolean;
}

export interface IconInfo {
  /** Asset path. */
  u: string;
  /** CSS custom property name the icon is exposed under. */
  v: string;
}

export interface PageHeader {
  image: string;
  video: string;
  footer: string;
  sections: [string, string][];
  keys: { action: string; active: boolean; bindings: string[] }[];
  /** Plain text for search matching. */
  search: string;
}

export interface KnownShortcut {
  ul: string;
  key: string;
  uMove: string;
  bMove: string;
}

export interface ContestedRow {
  bid: string;
  bl: string;
  ul: string;
  key: string;
  tip: string;
  uMove: string;
  bMove: string;
}

export interface PieInfo {
  id: string;
  title: string;
  icon: string;
  sid: string;
  enabled: boolean;
  filled: number;
  desc: string;
  tipRow: Tip;
}

export interface SceneMenuExtra {
  id: string | null;
  section: string;
  label: string;
  prop: string | null;
  inline: string | null;
  tip: Tip;
  inlineTip: Tip;
}

export interface FeaturePreset {
  name: string;
  restores: boolean;
  on: string[];
  confirm: string;
  tip: Tip;
}

export interface GizmoPreset {
  name: string;
  desc: string;
  values: Record<string, PropValue>;
}

export interface WindowData {
  catalog: CatalogPage[];
  icons: Record<string, IconInfo>;
  props: Record<string, PropInfo>;
  shortcuts: Record<string, ShortcutInfo>;
  known: Record<string, KnownShortcut>;
  pages: Record<string, Op[]>;
  headers: Record<string, PageHeader>;
  switchTips: Record<string, Tip>;
  consts: Record<string, string>;
  contested: ContestedRow[];
  contestedMinWidth: number;
  featureGroups: { caption: string; pages: string[] }[];
  pies: PieInfo[];
  pageShortcuts: Record<string, string[]>;
  primaryShortcut: Record<string, string | null>;
  featureTips: Record<string, Tip>;
  frameSteps: { id: string; on: boolean }[];
  frameStepInfo: Record<string, { label: string; tip: string }>;
  extras: SceneMenuExtra[];
  extraSections: [string, string][];
  layers: [number, string][];
  mouseIcons: string[];
  headerImages: Record<string, string>;
  headerVideos: Record<string, string>;
  tips: Record<string, string>;
  /** Tooltip image aspect ratios ("w / h"), so a tooltip is sized before its image loads. */
  tipAR: Record<string, string>;
  logo: string;
  /** Values the captured editor had off their defaults. */
  initial: Record<string, PropValue>;
  presets: FeaturePreset[];
  gizmoPresets: GizmoPreset[];
  kbTips: Tip[];
  followers: Record<string, string>;
  pageOwner: Record<string, string>;
  resetOwners: Record<string, string[]>;
}
