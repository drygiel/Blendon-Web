// SceneMenu's content: nodes grouped into sections, the Editor's own entries sorted in by the Known
// table, and Blendon's extras (the catalog) merged in. Everything here is data; the session places it.
import { Rect } from '../../../unity/math.ts';
import type { SceneMenuItem, SceneMenuSnapshot } from './editor-menu.ts';

export const Group = {
  Quick: 0,
  Extra: 1,
  Align: 2,
  Transform: 3,
  Visibility: 4,
  Object: 5,
  Prefab: 6,
  Components: 7,
  Tool: 8,
  Context: 9,
  Extensions: 10,
  More: 11,
} as const;
export type Group = (typeof Group)[keyof typeof Group];
const GroupNames = Object.keys(Group);

export type Glyph = 'Cut' | 'Copy' | 'Paste' | 'PasteAsChild' | 'Duplicate' | 'Rename' | 'Delete' | 'Submenu' | 'Check';
const Glyphs = new Set<string>([
  'Cut',
  'Copy',
  'Paste',
  'PasteAsChild',
  'Duplicate',
  'Rename',
  'Delete',
  'Submenu',
  'Check',
]);

export class MenuNode {
  readonly key: string;
  readonly label: string;
  readonly item: SceneMenuItem | null;
  readonly children: MenuNode[] = [];
  command: (() => void) | null = null;
  staysOpen = false;
  available = true;
  inline = false;
  caption = '';
  iconName = '';
  glyph: Glyph | null = null;
  separatorBefore = false;
  private hotkeyText = '';

  constructor(key: string, label: string, item: SceneMenuItem | null) {
    this.key = key;
    this.label = label;
    this.item = item;
  }

  get hotkey() {
    return this.item?.hotkey ?? this.hotkeyText;
  }
  set hotkey(v: string) {
    this.hotkeyText = v;
  }

  get isFolder() {
    return !this.item && !this.command;
  }

  get enabled() {
    return this.item ? this.item.enabled : this.available;
  }

  /** Shown as Unity shows it, but there is nothing behind it in the demo. */
  get demoOnly() {
    return !!this.item?.demoOnly;
  }

  get hasIcon() {
    return !!this.glyph || !!this.iconName;
  }

  setIcon(icon: string) {
    if (Glyphs.has(icon)) this.glyph = icon as Glyph;
    else this.iconName = icon;
  }
}

export interface MenuSection {
  title: string;
  showTitle: boolean;
  nodes: MenuNode[];
}

export interface MenuModel {
  quick: MenuNode[];
  sections: MenuSection[];
}

export interface MenuExtra {
  group: Group;
  node: MenuNode;
  prepend: boolean;
}

// Keyed on the top segment; a trailing "/" marks a submenu.
const Known: Record<string, [Group, string]> = {
  Cut: [Group.Quick, 'Cut'],
  Copy: [Group.Quick, 'Copy'],
  Paste: [Group.Quick, 'Paste'],
  'Paste As Child': [Group.Quick, 'PasteAsChild'],
  Duplicate: [Group.Quick, 'Duplicate'],
  Rename: [Group.Quick, 'Rename'],
  Delete: [Group.Quick, 'Delete'],
  'Move to View': [Group.Align, 'd_SceneViewCamera'],
  'Align with View': [Group.Align, 'd_ViewToolOrbit'],
  'Move to Closest Grid Point': [Group.Align, 'd_SnapIncrement'],
  'Align to Grid Rotation': [Group.Align, 'd_AngleSnap'],
  'Grid/': [Group.Align, 'd_GridAndSnap'],
  Isolate: [Group.Visibility, 'd_SceneViewVisibility'],
  'Exit Isolation': [Group.Visibility, 'd_SceneViewVisibility'],
  'Add Component...': [Group.Object, 'd_Toolbar Plus'],
  'Properties...': [Group.Object, 'd_UnityEditor.InspectorWindow'],
  'Prefab/': [Group.Prefab, 'd_Prefab Icon'],
};

// Components whose submenu the browser scene lists, and the type icon their folder wears.
const ComponentIcons: Record<string, string> = { Transform: 'd_Transform Icon' };

const isExtra = (n: MenuNode) => n.key.startsWith('Blendon/');
const head = (s: MenuSection) => {
  let n = 0;
  while (n < s.nodes.length && isExtra(s.nodes[n])) n++;
  return n;
};

function classify(item: SceneMenuItem, snapshot: SceneMenuSnapshot): [Group, string] {
  const nested = item.folderPath.length > 0;
  if (nested && snapshot.componentRoots.has(item.root)) return [Group.Components, ''];
  const rule = Known[nested ? item.root + '/' : item.root];
  return rule ?? [Group.More, ''];
}

const title = (group: Group) => (group === Group.Quick ? 'Edit' : GroupNames[group]);

function sectionFor(sections: Map<Group, MenuSection>, group: Group) {
  let s = sections.get(group);
  if (!s) sections.set(group, (s = { title: title(group), showTitle: group >= Group.Components, nodes: [] }));
  return s;
}

function insert(section: MenuSection, item: SceneMenuItem, icon: string) {
  let siblings = section.nodes;
  let key = section.title;
  if (item.folderPath) {
    const folders = item.folderPath.split('/');
    folders.forEach((name, i) => {
      key += '/' + name;
      let folder = siblings.find((n) => n.isFolder && n.label === name);
      if (!folder) {
        folder = new MenuNode(key, name, null);
        if (i === 0) folder.setIcon(ComponentIcons[name] ?? icon);
        siblings.push(folder);
      }
      siblings = folder.children;
    });
  }
  const leaf = new MenuNode(`${key}/${item.label}#${siblings.length}`, item.label, item);
  leaf.separatorBefore = item.separatorBefore && siblings.length > 0;
  if (!item.folderPath) leaf.setIcon(icon);
  siblings.push(leaf);
}

/** SceneMenuLayout.Build: the Editor's entries by section, the icon row, then Blendon's extras. */
export function buildModel(snapshot: SceneMenuSnapshot, iconRow: boolean, extras: MenuExtra[]): MenuModel {
  const model: MenuModel = { quick: [], sections: [] };
  const sections = new Map<Group, MenuSection>();
  for (const item of snapshot.items) {
    const [classified, icon] = classify(item, snapshot);
    let group: Group = classified;
    // A quick action has no room for a submenu, so a nested one goes back to the list.
    if (group === Group.Quick && !item.folderPath && iconRow) {
      const quick = new MenuNode('Quick/' + item.path, item.label, item);
      quick.setIcon(icon);
      model.quick.push(quick);
      continue;
    }
    if (group === Group.Quick && item.folderPath) group = Group.More;
    insert(sectionFor(sections, group), item, icon);
  }
  for (const extra of extras) {
    // The icon row is the edit group when it is on, so a quick entry joins the icons there.
    if (extra.group === Group.Quick && iconRow) {
      model.quick.push(extra.node);
      continue;
    }
    const section = sectionFor(sections, extra.group);
    if (extra.prepend) {
      section.nodes.splice(head(section), 0, extra.node);
      continue;
    }
    extra.node.separatorBefore =
      extra.group !== Group.Quick && section.nodes.length > 0 && !isExtra(section.nodes[section.nodes.length - 1]);
    section.nodes.push(extra.node);
  }
  for (const section of sections.values()) {
    const h = head(section);
    if (h > 0 && h < section.nodes.length) section.nodes[h].separatorBefore = true;
  }
  for (const g of Object.values(Group)) {
    const s = sections.get(g);
    if (s) model.sections.push(s);
  }
  return model;
}

/** Every node, folders' children included. */
export function* allNodes(model: MenuModel): Generator<MenuNode> {
  function* walk(n: MenuNode): Generator<MenuNode> {
    yield n;
    for (const c of n.children) yield* walk(c);
  }
  yield* model.quick;
  for (const s of model.sections) for (const n of s.nodes) yield* walk(n);
}

// ---- rows ----

export const Theme = {
  RowHeight: 20,
  LabelHeight: 18,
  SeparatorHeight: 7,
  HeaderHeight: 28,
  QuickBarHeight: 32,
  QuickWidth: 30,
  QuickHeight: 26,
  QuickGap: 2,
  InlineRowHeight: 26,
  InlineHeight: 22,
  InlineGap: 2,
  InlinePadX: 6,
  PadY: 4,
  HighlightInset: 4,
  TextX: 9,
  IconSize: 16,
  IconGap: 6,
  HintGap: 18,
  ArrowSize: 12,
  MinWidth: 210,
  MaxWidth: 340,
  SearchWidth: 118,
  TitleMaxWidth: 150,
  SearchHeight: 20,
  ViewMargin: 6,
  FlyoutOverlap: 3,
};

/** Unity's own context menu (the classic one): plain rows, no icons, the Editor's metrics at 100 %. */
export const NativeTheme = {
  RowHeight: 22,
  SeparatorHeight: 9,
  PadY: 3,
  TextX: 34,
  RightPad: 24,
  HintGap: 32,
  ArrowSize: 12,
  MinWidth: 200,
  FlyoutOverlap: 4,
};

export function nativeRowHeight(r: MenuRow) {
  return r.kind === 'separator' ? NativeTheme.SeparatorHeight : NativeTheme.RowHeight;
}

export type RowKind = 'item' | 'label' | 'separator' | 'quick' | 'inline' | 'classic';

export interface MenuRow {
  kind: RowKind;
  node?: MenuNode;
  nodes?: MenuNode[];
  text: string;
  /** A search hit's icon, inherited from the folder it was found in. */
  iconFrom?: MenuNode;
}

export function rowHeight(r: MenuRow) {
  switch (r.kind) {
    case 'label':
      return Theme.LabelHeight;
    case 'separator':
      return Theme.SeparatorHeight;
    case 'quick':
      return Theme.QuickBarHeight;
    case 'inline':
      return Theme.InlineRowHeight;
    default:
      return Theme.RowHeight;
  }
}

export function rowSelectable(r: MenuRow) {
  return r.kind === 'item' ? r.node!.enabled : r.kind === 'quick' || r.kind === 'inline' || r.kind === 'classic';
}

// ---- measuring ----

let ctx: CanvasRenderingContext2D | null = null;
export type Font = 'item' | 'hint' | 'label' | 'title' | 'native';
const Fonts: Record<Font, string> = {
  item: '400 12px Inter, system-ui, sans-serif',
  hint: '400 11px Inter, system-ui, sans-serif',
  label: '400 11px Inter, system-ui, sans-serif',
  title: '700 12px Inter, system-ui, sans-serif',
  native: '400 12px "Segoe UI", Inter, system-ui, sans-serif',
};

export function measure(text: string, font: Font) {
  if (!text) return 0;
  ctx ??= typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx) return text.length * 6.5;
  ctx.font = Fonts[font];
  return Math.ceil(ctx.measureText(text).width) + 1;
}

export function inlineWidth(node: MenuNode) {
  return Theme.InlinePadX * 2 + Theme.IconSize + Theme.IconGap + measure(node.label, 'item');
}

export function inlineRect(row: Rect, nodes: MenuNode[], index: number) {
  const natural = nodes.reduce((w, n) => w + inlineWidth(n), 0);
  const free = row.width - Theme.HighlightInset * 2 - Theme.InlineGap * (nodes.length - 1);
  const slack = Math.max(0, free - natural) / nodes.length;
  let x = row.x + Theme.HighlightInset;
  for (let i = 0; i < index; i++) x += inlineWidth(nodes[i]) + slack + Theme.InlineGap;
  return new Rect(
    x,
    row.y + (row.height - Theme.InlineHeight) / 2,
    inlineWidth(nodes[index]) + slack,
    Theme.InlineHeight,
  );
}

export function quickRect(row: Rect, index: number) {
  return new Rect(
    row.x + Theme.HighlightInset + index * (Theme.QuickWidth + Theme.QuickGap),
    row.y + (row.height - Theme.QuickHeight) / 2,
    Theme.QuickWidth,
    Theme.QuickHeight,
  );
}

/** The Editor's menu as GenericMenu shows it: its own order and folders, nothing regrouped. */
export function buildClassicModel(snapshot: SceneMenuSnapshot): MenuModel {
  const section: MenuSection = { title: '', showTitle: false, nodes: [] };
  for (const item of snapshot.items) insert(section, item, '');
  // The Editor rules off the component submenus from its own entries.
  const firstComponent = section.nodes.find((n) => n.isFolder && snapshot.componentRoots.has(n.label));
  if (firstComponent) firstComponent.separatorBefore = true;
  return { quick: [], sections: [section] };
}
