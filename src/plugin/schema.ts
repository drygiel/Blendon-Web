// Shape of src/plugin/generated/window-data.json, written by `pnpm sync` from the Blendon sources and the
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
  // The Defaults card, then the Tool Context section OverviewPage draws from GeneralSettings rows.
  | ['overview', Op[], Op[]]
  | ['frameSeq']
  | ['extras']
  | ['pieList']
  | ['keyboard']
  | ['tutorial'];

/**
 * A tooltip: Unity rich text plus an optional image (key into WindowData.tips). `t` reads as on the Blendon
 * preset with default settings; `src` is the card as written, with {key:id} and {setting:Class.Prop} tokens
 * that src/plugin/keys.ts fills from the live keys. No `src` = the card has no tokens.
 */
export interface Tip {
  t: string;
  i: string;
  src?: string;
}

/** A binding per keyboard preset, spelled the way Unity does ("Shift+G", "Num 1", "Mouse 2"); "" = no key. */
export interface Keys {
  /** Blendon preset: the keys Blendon's shortcuts declare. */
  b: string;
  /** Unity preset: contested Blendon keys moved one modifier aside, the Editor's commands on their own keys. */
  u: string;
}

export type KeyboardPreset = 'Blendon' | 'Unity';

/** A Blendon key that answers only in the Game Object (Blendon) tool context: always, or while it covers a command. */
export type ContextNeed = 'Always' | 'WhenCovering';

export type PropValue = boolean | number | string;

export interface PropInfo {
  /** Label. */
  l: string;
  /** Tooltip text, image and source (see Tip). */
  t: string;
  i: string;
  src?: string;
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
  /** Blendon preset binding, the same as keymap[id].b. */
  d: string;
  /** Display name. */
  n: string;
  t: string;
  i: string;
  src?: string;
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

export interface PageHeader {
  image: string;
  video: string;
  footer: string;
  sections: [string, string][];
  /** A row's bindings are alternatives, each per preset. */
  keys: { action: string; active: boolean; bindings: Keys[] }[];
  /** Plain text for search matching. */
  search: string;
}

/** What a contested row says now, from the live keys (OverviewContestedTable.State). */
export type ContestState = 'Covered' | 'Replaced' | 'Moved' | 'Free';

/** One key Blendon and an Editor command both want (ShortcutPresets.Known), with where either side goes. */
export interface ContestedRow {
  /** The Editor command's id and label. */
  uid: string;
  ul: string;
  /** Blendon's shortcut id and label. */
  bid: string;
  bl: string;
  /** The key both want, as Blendon's shortcut declares it. */
  key: string;
  /** Blendon's shortcut does the command's job, so there is nowhere to move the command. */
  replaces: boolean;
  /** Where Blendon's side goes on the Unity preset. */
  blendonAlt: string;
  /** Where Move puts the Editor's command on the Blendon preset; "" when it replaces. */
  editorAlt: string;
  /** The row's card in each state. */
  cards: Record<ContestState, Tip>;
}

export interface PieInfo {
  id: string;
  title: string;
  icon: string;
  sid: string;
  enabled: boolean;
  filled: number;
  desc: string;
  /** The card on the Pie Menus page's row. */
  tipRow: Tip;
  /** The card on the Overview's row. */
  tipOverview: Tip;
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
  /** The feature pages it switches on, the rest off; null for every page. */
  on: string[] | null;
  confirm: string;
  tip: Tip;
}

export interface GizmoPreset {
  name: string;
  desc: string;
  values: Record<string, PropValue>;
}

/** The file `pnpm sync` writes. */
export interface WindowDataFile {
  catalog: CatalogPage[];
  /** Icon name -> its file under public/, a picture on the icon sprite. */
  icons: Record<string, string>;
  props: Record<string, PropInfo>;
  shortcuts: Record<string, ShortcutInfo>;
  /** Default bindings per preset: every Blendon id, the contested Editor commands, every id a card names. */
  keymap: Record<string, Keys>;
  /** Keys outside the Blendon tool context are Unity's; ids that answer everywhere are left out. */
  contextNeed: Record<string, ContextNeed>;
  /** A page's Blendon Context Only switch ("Type.Prop") per id it keeps to the tool context while on. */
  contextOnly: Record<string, string>;
  pages: Record<string, Op[]>;
  headers: Record<string, PageHeader>;
  switchTips: Record<string, Tip>;
  consts: Record<string, string>;
  /** In the Overview table's order. */
  contested: ContestedRow[];
  contestedMinWidth: number;
  featureGroups: { caption: string; pages: string[] }[];
  pies: PieInfo[];
  pageShortcuts: Record<string, string[]>;
  primaryShortcut: Record<string, string | null>;
  featureTips: Record<string, Tip>;
  /** The Overview text links with a card of their own, by tip key (SupportInfo.TipKey). */
  linkTips: Record<string, Tip>;
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
  /** The Keyboard Presets cards' pictures, Blendon then Unity. Their text is built from live keys. */
  kbTips: Tip[];
  followers: Record<string, string>;
  pageOwner: Record<string, string>;
  resetOwners: Record<string, string[]>;
}

/** The loaded data: the file plus indexes built from it. */
export interface WindowData extends WindowDataFile {
  /** Contested rows by Blendon id. */
  known: Record<string, ContestedRow>;
}
