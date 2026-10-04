// SceneMenuPanel + SceneMenuSession: the root panel and its flyouts, their rows, rects, scroll and
// selection. Rects are in Scene view points; the page draws them where they say.
import { Mathf, Rect, Vector2 } from '../../../unity/math.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import type { SceneMenuSnapshot } from './editor-menu.ts';
import {
  inlineRect,
  inlineWidth,
  measure,
  NativeTheme,
  nativeRowHeight,
  quickRect,
  rowHeight,
  rowSelectable,
  Theme,
  type MenuModel,
  type MenuNode,
  type MenuRow,
} from './model.ts';

export class MenuPanel {
  readonly isRoot: boolean;
  readonly parentRow: number;
  /** The root's title and search strip; the plain Editor menu has none. */
  readonly hasHeader: boolean;
  /** Drawn as Unity's own context menu, with its metrics. */
  readonly native: boolean;
  rows: MenuRow[] = [];
  rect = new Rect();
  scroll = 0;
  selected = -1;
  column = -1;
  iconGutter = true;

  constructor(isRoot: boolean, parentRow: number, hasHeader = isRoot, native = false) {
    this.isRoot = isRoot;
    this.parentRow = parentRow;
    this.hasHeader = hasHeader && !native;
    this.native = native;
  }

  height(r: MenuRow) {
    return this.native ? nativeRowHeight(r) : rowHeight(r);
  }

  private get padY() {
    return this.native ? NativeTheme.PadY : Theme.PadY;
  }

  get textOffset() {
    return this.iconGutter ? Theme.IconSize + Theme.IconGap : 0;
  }
  get headerHeight() {
    return this.hasHeader ? Theme.HeaderHeight : 0;
  }
  get contentHeight() {
    return this.rows.reduce((h, r) => h + this.height(r), 0);
  }
  get body() {
    const r = this.rect;
    return new Rect(
      r.x,
      r.y + this.headerHeight + this.padY,
      r.width,
      Math.max(0, r.height - this.headerHeight - this.padY * 2),
    );
  }
  get header() {
    return new Rect(this.rect.x, this.rect.y, this.rect.width, this.headerHeight);
  }
  get maxScroll() {
    return Math.max(0, this.contentHeight - this.body.height);
  }

  measureWidth(quickCount: number, title: string, search: boolean) {
    if (this.native) return this.measureNative();
    let width = Theme.MinWidth;
    for (const row of this.rows) {
      if (row.kind === 'inline' && row.nodes) {
        let line = Theme.HighlightInset * 2 + Theme.InlineGap * (row.nodes.length - 1);
        for (const n of row.nodes) line += inlineWidth(n);
        width = Math.max(width, line);
        continue;
      }
      if (row.kind !== 'item' || !row.node) continue;
      const node = row.node;
      let w = Theme.TextX * 2 + this.textOffset + measure(node.label, 'item');
      if (node.isFolder) w += Theme.HintGap + Theme.ArrowSize;
      else if (node.hotkey) w += Theme.HintGap + measure(node.hotkey.replace(/\+/g, ' '), 'hint');
      width = Math.max(width, w);
    }
    if (this.isRoot) {
      width = Math.max(width, Theme.TextX * 2 + quickCount * (Theme.QuickWidth + Theme.QuickGap));
      const t = measure(title, 'title');
      width = Math.max(
        width,
        search
          ? Theme.TextX * 3 + Theme.IconSize + Theme.IconGap + Math.min(t, Theme.TitleMaxWidth) + Theme.SearchWidth
          : Theme.TextX * 2 + Theme.IconSize + Theme.IconGap + t,
      );
    }
    return Math.min(Math.ceil(width), Theme.MaxWidth);
  }

  private measureNative() {
    const T = NativeTheme;
    let width = T.MinWidth;
    for (const row of this.rows) {
      const node = row.node;
      if (row.kind !== 'item' || !node) continue;
      let w = T.TextX + measure(node.label, 'native') + T.RightPad;
      if (node.isFolder) w += T.HintGap;
      else if (node.hotkey) w += T.HintGap + measure(node.hotkey, 'native');
      width = Math.max(width, w);
    }
    return Math.ceil(width);
  }

  commitRows() {
    this.iconGutter =
      !this.native &&
      this.rows.some(
        (r) =>
          r.kind === 'classic' || r.kind === 'quick' || !!r.iconFrom || !!r.node?.hasIcon || !!r.node?.item?.checked,
      );
  }

  place(at: Vector2, width: number, bounds: Rect) {
    const available = bounds.height - Theme.ViewMargin * 2;
    const height = Math.min(this.headerHeight + this.padY * 2 + this.contentHeight, available);
    const x = Mathf.Clamp(at.x, bounds.x + Theme.ViewMargin, bounds.xMax - Theme.ViewMargin - width);
    const y = Mathf.Clamp(at.y, bounds.y + Theme.ViewMargin, bounds.yMax - Theme.ViewMargin - height);
    this.rect = new Rect(Math.round(x), Math.round(y), width, height);
    this.scroll = Mathf.Clamp(this.scroll, 0, this.maxScroll);
  }

  placeBeside(parent: MenuPanel, row: number, width: number, bounds: Rect) {
    const anchor = parent.rowRect(row);
    const overlap = this.native ? NativeTheme.FlyoutOverlap : Theme.FlyoutOverlap;
    let x = parent.rect.xMax - overlap;
    if (x + width > bounds.xMax - Theme.ViewMargin) x = parent.rect.x - width + overlap;
    this.place(new Vector2(x, anchor.y - this.padY), width, bounds);
  }

  rowRect(index: number) {
    let y = this.body.y - this.scroll;
    for (let i = 0; i < index; i++) y += this.height(this.rows[i]);
    return new Rect(this.rect.x, y, this.rect.width, this.height(this.rows[index]));
  }

  columnRect(rect: Rect, row: MenuRow, index: number) {
    return row.kind === 'inline' ? inlineRect(rect, row.nodes!, index) : quickRect(rect, index);
  }

  contains(p: Vector2) {
    return this.rect.contains(p);
  }

  rowAt(p: Vector2) {
    const body = this.body;
    if (!body.contains(p)) return -1;
    let y = body.y - this.scroll;
    for (let i = 0; i < this.rows.length; i++) {
      const h = this.height(this.rows[i]);
      if (p.y >= y && p.y < y + h) return i;
      y += h;
    }
    return -1;
  }

  columnAt(row: number, p: Vector2, count: number) {
    const rect = this.rowRect(row);
    for (let i = 0; i < count; i++) if (this.columnRect(rect, this.rows[row], i).contains(p)) return i;
    return -1;
  }

  scrollBy(delta: number) {
    this.scroll = Mathf.Clamp(this.scroll + delta, 0, this.maxScroll);
  }

  reveal(index: number) {
    if (index < 0 || index >= this.rows.length) return;
    let top = 0;
    for (let i = 0; i < index; i++) top += this.height(this.rows[i]);
    const bottom = top + this.height(this.rows[index]);
    if (top < this.scroll) this.scroll = top;
    else if (bottom > this.scroll + this.body.height) this.scroll = bottom - this.body.height;
  }

  nextSelectable(step: number) {
    const start = this.selected >= 0 ? this.selected : step > 0 ? -1 : this.rows.length;
    for (let i = start + step; i >= 0 && i < this.rows.length; i += step) if (rowSelectable(this.rows[i])) return i;
    return this.selected;
  }
}

// Opens with the cursor just inside the header, so the first move lands on the menu.
const SpawnOffset = new Vector2(-14, -12);

export class MenuSession {
  readonly view: SceneView;
  readonly cursor: Vector2;
  readonly snapshot: SceneMenuSnapshot;
  readonly model: MenuModel;
  readonly classicRow: boolean;
  /** The Editor's own menu, drawn plainly: no header, no icon row, entries in its order. */
  readonly classic: boolean;
  panels: MenuPanel[];
  active = 0;
  lastPoint: Vector2;
  title: string;
  private readonly anchor: Vector2;
  private rootWidth = 0;

  constructor(
    view: SceneView,
    cursor: Vector2,
    snapshot: SceneMenuSnapshot,
    model: MenuModel,
    title: string,
    classicRow: boolean,
    classic: boolean,
  ) {
    this.view = view;
    this.cursor = cursor;
    this.lastPoint = cursor;
    this.anchor = classic ? cursor : cursor.add(SpawnOffset);
    this.snapshot = snapshot;
    this.model = model;
    this.title = title;
    this.classicRow = classicRow;
    this.classic = classic;
    this.panels = [new MenuPanel(true, -1, !classic, classic)];
  }

  get root() {
    return this.panels[0];
  }

  get bounds() {
    return new Rect(0, 0, this.view.cameraViewport.width, this.view.cameraViewport.height);
  }

  place(search: string, searchField: boolean) {
    this.buildRoot(search);
    this.rootWidth = this.root.measureWidth(this.model.quick.length, this.title, searchField && !this.classic);
    this.root.place(this.anchor, this.rootWidth, this.bounds);
  }

  refilter(search: string) {
    this.closeFrom(1);
    this.active = 0;
    this.buildRoot(search);
    this.root.place(this.anchor, this.rootWidth, this.bounds);
  }

  openFlyout(parentIndex: number, row: number) {
    if (this.panels.length > parentIndex + 1 && this.panels[parentIndex + 1].parentRow === row) return;
    this.closeFrom(parentIndex + 1);
    const parent = this.panels[parentIndex];
    const panel = new MenuPanel(false, row, false, this.classic);
    addNodes(panel.rows, parent.rows[row].node!.children);
    panel.commitRows();
    panel.placeBeside(parent, row, panel.measureWidth(0, '', false), this.bounds);
    this.panels.push(panel);
  }

  closeFrom(index: number) {
    this.panels.length = Math.max(1, Math.min(this.panels.length, index));
    this.active = Mathf.Clamp(this.active, 0, this.panels.length - 1);
  }

  columns(panel: MenuPanel, row: number) {
    if (row < 0 || row >= panel.rows.length) return 0;
    const r = panel.rows[row];
    return r.kind === 'quick' ? this.model.quick.length : r.kind === 'inline' ? r.nodes!.length : 0;
  }

  private buildRoot(search: string) {
    const root = this.root;
    root.rows = [];
    root.selected = -1;
    root.column = -1;
    if (search) {
      for (const n of this.model.quick) match(root.rows, n, n, search);
      for (const s of this.model.sections) for (const n of s.nodes) match(root.rows, n, n, search);
      if (root.rows.length === 0) root.rows.push({ kind: 'label', text: 'No matches' });
      // The best match is one Enter away, as in Blender's menu search.
      root.selected = root.nextSelectable(1);
    } else {
      if (this.model.quick.length > 0) root.rows.push({ kind: 'quick', text: '' });
      for (const s of this.model.sections) {
        if (root.rows.length > 0) root.rows.push({ kind: 'separator', text: '' });
        if (s.showTitle) root.rows.push({ kind: 'label', text: s.title });
        addNodes(root.rows, s.nodes);
      }
    }
    if (this.classicRow && !this.classic) {
      root.rows.push({ kind: 'separator', text: '' }, { kind: 'classic', text: '' });
    }
    root.commitRows();
  }
}

function crumb(node: MenuNode) {
  const item = node.item;
  if (item) return item.folderPath ? item.folderPath.replace(/\//g, ' > ') + ' > ' : '';
  return node.caption ? node.caption + ' > ' : '';
}

function match(rows: MenuRow[], node: MenuNode, iconFrom: MenuNode, search: string) {
  if (node.isFolder) {
    for (const c of node.children) match(rows, c, c.hasIcon ? c : iconFrom, search);
    return;
  }
  const path = node.item?.path ?? node.label;
  if (!path.toLowerCase().includes(search.toLowerCase())) return;
  rows.push({ kind: 'item', node, text: crumb(node), iconFrom: iconFrom.hasIcon ? iconFrom : undefined });
}

function addNodes(rows: MenuRow[], nodes: MenuNode[]) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].separatorBefore && i > 0) rows.push({ kind: 'separator', text: '' });
    if (!nodes[i].inline) {
      rows.push({ kind: 'item', node: nodes[i], text: '' });
      continue;
    }
    const run = [nodes[i]];
    while (i + 1 < nodes.length && joinsRun(run[0], nodes[i + 1])) run.push(nodes[++i]);
    if (run[0].caption) rows.push({ kind: 'label', text: run[0].caption });
    rows.push({ kind: 'inline', nodes: run, text: '' });
    // The caption names this row only, so the group it opened closes here.
    if (run[0].caption && i + 1 < nodes.length && !nodes[i + 1].separatorBefore)
      rows.push({ kind: 'separator', text: '' });
  }
}

const joinsRun = (first: MenuNode, next: MenuNode) =>
  next.inline && !next.separatorBefore && next.caption === first.caption;
