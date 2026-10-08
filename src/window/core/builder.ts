// The page layout builder: runs a page's draw ops (SettingsControls calls) into rows of cells,
// with the two-column grid, cards and folds of SettingsEditorWindow.
import type { Cond, Op, PageHeader, Tip } from '../../plugin/schema.ts';
import { D } from '../../plugin/window-data.ts';
import { type WindowModel, pageInfo } from './model.ts';
import type { TipSource } from './state.ts';
import { type Run, rich } from './text.ts';
import { clamp, M, plain } from './util.ts';

export type PropKind = 'tog' | 'sld' | 'pop' | 'col' | 'msk';

export type ItemData =
  | { k: 'cap'; text: string; icon: string }
  | {
      k: PropKind;
      label: string;
      pkey: string;
      tip: TipSource;
      mark: boolean;
      min?: number;
      max?: number;
      /** A General override row: follows `src` on `srcPage` unless overridden here. */
      ovrRow?: boolean;
      src?: string;
      srcPage?: string;
      ovr?: boolean;
    }
  | { k: 'sc'; sid: string; label: string; tip: TipSource; mark: boolean; caption: string }
  | { k: 'nat'; lead: string; link: string; hint: string; ul: string }
  | { k: 'note'; runs: Run[]; tip: TipSource }
  | { k: 'banner'; warn: boolean; runs: Run[]; indent: boolean; lead: boolean; link?: BannerLink }
  | { k: 'plink'; page: string; text: string; icon: string; accent: string; tip: TipSource }
  | { k: 'link'; lead: string; text: string; tip: TipSource }
  | { k: 'space'; h: number }
  | { k: 'prev'; owner: string }
  | { k: 'action'; label: string; btn: string; act: 'restart' | 'tips'; tip: TipSource }
  | { k: 'actions2'; a: { text: string; tip: TipSource }; b: { text: string; tip: TipSource } }
  | {
      k: 'master';
      icon: string;
      title: string;
      subtitle: string;
      pkey: string;
      tip: TipSource;
      header: PageHeader | null;
      gizmoPresets: boolean;
    }
  | { k: 'ovMaster'; tip: TipSource }
  | { k: 'kbPreset' }
  | { k: 'contested'; rows: typeof D.contested }
  | { k: 'fhead' }
  | { k: 'frow'; page: string; stripe: number }
  | { k: 'fpie'; pie: string; stripe: number }
  | { k: 'fsub'; page: string; sid: string; name: string; stripe: number }
  | { k: 'frameSeq'; mark: boolean }
  | { k: 'extras' }
  | { k: 'pieTable'; pies: string[]; header: boolean }
  | { k: 'pieEmpty' }
  | { k: 'pieFooter' };

export interface BannerLink {
  page: string;
  word: string;
  accent: string;
}

export interface ItemCommon {
  key: string;
  dis: boolean;
  /** The accent of the page the item was drawn for. */
  acc: string;
}

export type Item = ItemData & ItemCommon;
export type ItemOf<K extends Item['k']> = Extract<Item, { k: K }>;

export interface Cell {
  items: Item[];
  span: 1 | 2;
  lw: number;
  bare: boolean;
  master?: boolean;
}

export interface Wrap {
  kind: 'card' | 'fold';
  id: number;
  rows: Row[];
  accent: string;
  // card
  label?: string;
  icon?: string;
  page?: string;
  group?: boolean;
  // fold
  title?: string;
  open?: boolean;
  key?: string;
  tip?: string;
  count?: number;
}

export interface Row {
  id: number;
  mt: number;
  cells: Cell[];
  wrap: Wrap | null;
  band?: boolean;
  grid?: boolean;
  bare?: boolean;
  master?: boolean;
  empty?: boolean;
  /** Space below the row. */
  after?: number;
}

interface PendingSub {
  text: string;
  icon: string;
  space: number;
  minWidth: number;
}

interface PendingCard {
  label: string;
  icon: string;
  accent: string;
  id: string;
}

export function evalCond(app: WindowModel, e: Cond): unknown {
  switch (e[0]) {
    case '!':
      return !evalCond(app, e[1]);
    case '&&':
      return evalCond(app, e[1]) && evalCond(app, e[2]);
    case '||':
      return evalCond(app, e[1]) || evalCond(app, e[2]);
    case '==':
      return evalCond(app, e[1]) === evalCond(app, e[2]);
    case '!=':
      return evalCond(app, e[1]) !== evalCond(app, e[2]);
    case '<':
      return Number(evalCond(app, e[1])) < Number(evalCond(app, e[2]));
    case 'c':
      return e[1];
    case 'v':
      return app.val(e[1]);
    case 'f':
      switch (e[1]) {
        case 'anyTool':
          return app.anyTool();
        case 'supportsBounds':
          return evalCond(app, e[2]) === 'Native';
        case 'wrapsAtEdge': {
          const v = evalCond(app, e[2]);
          return v === 'Native' || v === 'Unity';
        }
        case 'aimClash':
          return app.aimClash(evalCond(app, e[2]) as string);
        case 'pageEnabled':
          return app.pageEnabled(e[2]);
        case 'searching':
          return app.searching;
      }
  }
  return false;
}

const tipOf = (t: string, i = ''): TipSource => ({ t, i });

// Settings the browser's Scene view can't act on, and why; the tooltip says so.
const pointer = "a web page can't move the mouse pointer";
const NotSimulated: Record<string, string> = {
  'GeneralSettings.CursorWrapEnabled': pointer,
  'GeneralSettings.CursorWrap': pointer,
  'GeneralSettings.WrapBounds': pointer,
  'PanSettings.CursorWrapEnabled': pointer,
  'PanSettings.CursorWrap': pointer,
  'PanSettings.WrapBounds': pointer,
  'SharedGizmoSettings.CursorWrapEnabled': pointer,
  'SharedGizmoSettings.CursorWrap': pointer,
  'SharedGizmoSettings.WrapBounds': pointer,
  'PieMenuSettings.LockCursorToViewport': pointer,
  'ViewportNavSettings.MatchFieldOfView': 'the demo scene has no cameras',
  'SharedGizmoSettings.ShowPreview': 'the demo window has no gizmo preview',
  'SnapToFloorSettings.SurfaceLayers': 'the demo scene has a single layer',
  'BoxSelectSettings.SelectPrefabRoots': 'the demo scene has no prefabs',
  'BoxSelectSettings.RespectSelectionBase': 'the demo scene has no Selection Base objects',
  'SceneMenuSettings.SharpText': 'the browser lays out its own text',
};

const propTip = (key: string, t: string, i = '') => {
  const why = NotSimulated[key];
  return tipOf(
    why ? `${t}\n\n<size=9><b><color=#D98E38>BROWSER DEMO</color></b></size>\nNot simulated here: ${why}.` : t,
    i,
  );
};

export class Builder {
  readonly app: WindowModel;
  readonly pageW: number;
  readonly searching: boolean;
  readonly query: string;
  rows: Row[] = [];
  row: Row | null = null;
  cell: Cell | null = null;
  wrap: Wrap | null = null;
  pending: PendingSub | null = null;
  pendingPage: PendingCard | null = null;
  pendingCard: PendingCard | null = null;
  /** Depth of disabled scopes (EditorGUI.DisabledScope). */
  dis = 0;
  match = 0;
  pageMatches: Record<string, number> = {};
  page = '';
  pageName = '';
  groupName = '';
  accent = '#9EA8B8';
  underSub = false;
  subCount = 0;
  /** Drawing every page for search results: page-level notes and banners are left out. */
  spansAll = false;
  n = 0;

  constructor(app: WindowModel, pageW: number, searching: boolean, query: string) {
    this.app = app;
    this.pageW = pageW;
    this.searching = searching;
    this.query = query.toLowerCase();
  }

  get cellW() {
    return Math.max(0, (this.pageW - this.inset() - M.gutter) / 2);
  }

  inset() {
    return this.wrap ? (this.wrap.kind === 'fold' ? M.foldPadX : M.cardPadX) : 0;
  }

  gridOn() {
    return this.pageW >= M.gridBreak;
  }

  contains(t: string | undefined) {
    return !!t && t.toLowerCase().includes(this.query);
  }

  matches(label: string | undefined, tip: string | undefined) {
    return (
      !this.searching ||
      this.contains(label) ||
      this.contains(plain(tip)) ||
      this.contains(this.groupName) ||
      this.contains(this.pageName)
    );
  }

  count() {
    this.match++;
    this.subCount++;
    this.pageMatches[this.page] = (this.pageMatches[this.page] ?? 0) + 1;
  }

  beginPass(page: string) {
    const info = pageInfo(page);
    this.page = page;
    this.pageName = info.label;
    this.groupName = '';
    this.accent = info.accent;
    this.pending = null;
    this.underSub = false;
    this.subCount = 0;
  }

  beginPage(info: (typeof D.catalog)[number]) {
    this.endWrap();
    this.accent = info.accent;
    this.spansAll = true;
    this.pageName = info.label;
    this.groupName = '';
    this.page = info.id;
    this.pendingPage = { label: info.label, icon: info.icon, accent: info.accent, id: info.id };
    this.pending = null;
    this.underSub = false;
    this.subCount = 0;
  }

  // ---- rows ---------------------------------------------------------------------------------------
  endCell() {
    this.cell = null;
  }

  endRow() {
    this.endCell();
    this.row = null;
  }

  newRow(mt: number, opts?: Partial<Row>): Row {
    this.endRow();
    const row: Row = { mt, cells: [], wrap: this.wrap, id: this.n++, ...opts };
    this.rows.push(row);
    this.row = row;
    this.wrap?.rows.push(row);
    return row;
  }

  newCell(row: Row, span: 1 | 2, lw: number): Cell {
    const cell: Cell = { items: [], span, lw, bare: false };
    row.cells.push(cell);
    this.cell = cell;
    return cell;
  }

  placeGroup(minWidth: number, space: number) {
    if (!this.gridOn() || minWidth > this.cellW) {
      this.newCell(this.newRow(space, { band: true }), 2, M.labelW);
      return;
    }
    if (!this.row || this.row.band || this.row.bare || this.row.cells.length >= 2) this.newRow(space, { grid: true });
    const lw = clamp((this.cellW - M.cellPadX) * 0.42, 96, M.labelW);
    this.newCell(this.row!, 1, lw);
  }

  /** Items drawn with no open cell land straight in the page body. */
  target(): Cell {
    if (this.cell) return this.cell;
    if (!this.row?.bare) {
      const c = this.newCell(this.newRow(0, { bare: true }), 2, M.labelW);
      c.bare = true;
    }
    return this.cell!;
  }

  add<T extends ItemData>(item: T & Partial<ItemCommon>): T & ItemCommon {
    const c = this.target();
    const it = {
      ...item,
      dis: item.dis ?? this.dis > 0,
      acc: item.acc ?? this.accent,
      key: `${this.page}:${this.n++}`,
    };
    c.items.push(it);
    return it;
  }

  // ---- headers ------------------------------------------------------------------------------------
  flush() {
    if (this.pendingPage) {
      const p = this.pendingPage;
      this.pendingPage = null;
      this.openCard(p);
    }
    if (this.pendingCard) {
      const p = this.pendingCard;
      this.pendingCard = null;
      this.openCard(p);
      this.wrap!.group = true;
    }
    if (this.pending) {
      const g = this.pending;
      this.pending = null;
      this.placeGroup(g.minWidth, g.space);
      this.add({ k: 'cap', text: g.text.toUpperCase(), icon: g.icon });
    }
  }

  openCard(p: PendingCard) {
    this.endWrap();
    this.wrap = {
      kind: 'card',
      label: p.label.toUpperCase(),
      icon: p.icon,
      accent: p.accent,
      page: p.id,
      rows: [],
      id: this.n++,
    };
    this.underSub = false;
    this.subCount = 0;
  }

  endWrap() {
    this.endRow();
    if (this.wrap) {
      if (!this.wrap.rows.length) {
        this.newRow(0, { empty: true });
        this.endRow();
      }
      this.wrap = null;
    }
  }

  extraAfter(h: number) {
    const last = this.rows[this.rows.length - 1];
    if (last) last.after = (last.after ?? 0) + h;
  }

  // ---- ops ----------------------------------------------------------------------------------------
  run(ops: Op[]) {
    for (const op of ops) this.op(op);
  }

  op(o: Op) {
    const app = this.app;
    switch (o[0]) {
      case 'dis': {
        const d = !!evalCond(app, o[1]);
        if (d) this.dis++;
        this.run(o[2]);
        if (d) this.dis--;
        return;
      }
      case 'if':
        if (evalCond(app, o[1])) this.run(o[2]);
        else if (o[3]) this.run(o[3]);
        return;
      case 'sub': {
        const sp = o[3];
        const space = Array.isArray(sp) ? (app.val('SharedGizmoSettings.ShowPreview') ? sp[1] : sp[2]) : sp;
        this.sub(o[1], o[2], space, Number(o[4]) || 0);
        return;
      }
      case 'space':
        if (this.cell) this.add({ k: 'space', h: o[1] });
        else if (this.row) this.row.after = (this.row.after ?? 0) + o[1];
        else this.extraAfter(o[1]);
        return;
      case 'fold':
        return this.fold(o[1], o[2]);
      case 'card': {
        const info = pageInfo(o[1]);
        this.pendingCard = { label: info.label, icon: info.icon, accent: info.accent, id: info.id };
        return;
      }
      case 'endcard':
        this.pendingCard = null;
        if (this.wrap?.group) this.endWrap();
        return;
      case 'master':
        return this.master(o);
      case 'overview':
        return this.overview(o[1]);
      case 'tog':
      case 'pop':
      case 'col':
      case 'msk':
        this.propItem(o[1], { k: o[0] });
        return;
      case 'sld':
        this.propItem(o[1], { k: 'sld', min: o[2], max: o[3] });
        return;
      case 'gtog':
        return this.general(o[1], o[2], 'tog');
      case 'gpop':
        return this.general(o[1], o[2], 'pop');
      case 'gsld':
        return this.general(o[1], o[2], 'sld', { min: o[3], max: o[4] });
      case 'imod':
        return this.general(o[1], o[2], 'pop', { srcPage: o[3] });
      case 'sc':
        return this.shortcut(o);
      case 'nat':
        return this.nativeNote(o[1]);
      case 'note':
        return this.note(o[1], o[2]);
      case 'clash':
        return this.clash(o[1]);
      case 'info':
        return this.banner(false, o[1]);
      case 'warn':
        return this.banner(true, o[1]);
      case 'ilink': {
        const acc = pageInfo(o[4]).accent;
        this.banner(false, `${o[1]}<color=${acc}>${o[2]}</color>${o[3]}`, { page: o[4], word: o[2], accent: acc });
        return;
      }
      case 'plink':
        return this.pageLink(o[1], o[2]);
      case 'prev':
        return this.preview(o[1]);
      case 'frameSeq':
        return this.frameSeq();
      case 'extras':
        return this.extras();
      case 'pieList':
        return this.pieList();
      case 'keyboard':
        return this.keyboard();
    }
  }

  sub(text: string, icon: string, space: number, minWidth: number) {
    this.groupName = text;
    this.pending = { text, icon, space, minWidth };
    this.underSub = true;
    this.subCount = 0;
  }

  propItem(key: string, extra: { k: PropKind; min?: number; max?: number }) {
    const p = D.props[key];
    if (!this.matches(p.l, p.t)) return;
    this.count();
    this.flush();
    this.add({ ...extra, label: p.l, pkey: key, tip: propTip(key, p.t, p.i), mark: !this.app.isDefault(key) });
  }

  general(key: string, src: string, k: PropKind, extra?: { min?: number; max?: number; srcPage?: string }) {
    const p = D.props[key];
    if (!this.matches(p.l, p.t)) return;
    this.count();
    this.flush();
    const ovr = this.app.overriding(key);
    this.add({
      k,
      ...extra,
      ovrRow: true,
      label: p.l,
      pkey: key,
      src,
      srcPage: extra?.srcPage ?? 'Overview',
      ovr,
      tip: propTip(key, p.t, p.i),
      mark: ovr,
    });
  }

  shortcut(o: Extract<Op, ['sc', ...unknown[]]>) {
    const id = o[1];
    let label: string;
    let tip: string;
    let img: string;
    if (o[2] === null) [, , , label, tip, img] = o;
    else {
      const p = D.props[o[2]];
      label = p.l;
      tip = p.t;
      img = p.i;
    }
    if (!this.matches(label, tip)) return;
    this.count();
    this.flush();
    this.add({ k: 'sc', sid: id, label, tip: tipOf(tip, img), mark: this.app.shortcutChanged(id), caption: '' });
  }

  nativeNote(id: string) {
    if (this.spansAll) return;
    const row = D.known[id];
    if (!row) return;
    this.flush();
    const moved = this.app.unityMoved(row);
    this.add({
      k: 'nat',
      lead: `Replaces the Editor's native "${row.ul}" command. Open in`,
      link: "Unity's Shortcuts window",
      hint: `"${row.ul}" is ${moved ? 'now on ' + moved : 'left unset'}. Open it in Unity's Shortcuts window`,
      ul: row.ul,
    });
  }

  note(text: string, tip: string, img = '') {
    if (this.spansAll) return;
    this.flush();
    this.add({ k: 'note', runs: rich('       ' + text), tip: tipOf(tip, img) });
  }

  /** The modifier popup drawn last, which a clash note refers back to. */
  lastModKey(): string {
    for (let r = this.rows.length - 1; r >= 0; r--)
      for (const c of this.rows[r].cells)
        for (let i = c.items.length - 1; i >= 0; i--) {
          const it = c.items[i];
          if (it.k === 'pop') return it.pkey;
        }
    return 'SharedGizmoSettings.AimModifier';
  }

  clash(tip: string) {
    if (this.spansAll) return;
    const other = this.app.aimClash(this.app.val(this.lastModKey()));
    this.flush();
    this.add({ k: 'note', runs: rich(`       Same key as ${String(other)}, so one drag does both.`), tip: tipOf(tip) });
  }

  banner(warn: boolean, text: string, link?: BannerLink) {
    if (this.spansAll) return;
    this.flush();
    const lead = this.underSub && this.subCount > 0;
    if (this.underSub) this.subCount++;
    this.add({ k: 'banner', warn, runs: rich(text), indent: this.underSub, lead, link });
  }

  pageLink(page: string, text: string) {
    if (this.searching) return;
    this.flush();
    const info = pageInfo(page);
    this.add({
      k: 'plink',
      page,
      text,
      icon: info.icon,
      accent: info.accent,
      tip: { t: `Open the <b><color=${info.accent}>${info.label}</color></b> settings page`, i: '', native: true },
    });
  }

  preview(owner: string) {
    if (!this.app.val('SharedGizmoSettings.ShowPreview') || this.searching) return;
    this.sub('Preview', 'd_SceneViewCamera', 11, 0);
    this.flush();
    this.add({ k: 'prev', owner });
  }

  fold(title: string, ops: Op[]) {
    const foldKey = this.page + '.' + title;
    if (this.searching) {
      this.sub(title, 'd_Grid.PaintTool', 15, 1e9);
      this.run(ops);
      return;
    }
    const open = this.app.foldOpen(foldKey);
    this.endRow();
    const prevWrap = this.wrap;
    this.endWrap();
    const start = this.match;
    this.wrap = {
      kind: 'fold',
      title,
      open,
      key: foldKey,
      accent: this.accent,
      rows: [],
      id: this.n++,
      tip: D.consts.appearanceTip,
    };
    this.underSub = false;
    this.subCount = 0;
    if (open) this.run(ops);
    const w = this.wrap;
    w.count = this.app.foldCount(foldKey, open ? this.match - start : null);
    this.endWrap();
    this.wrap = prevWrap?.kind === 'card' ? prevWrap : null;
    // EndFold's Space(4) only follows an open fold; a shut one returns before it.
    if (open) this.extraAfter(4);
  }

  // ---- master headers -----------------------------------------------------------------------------
  master(o: Extract<Op, ['master', ...unknown[]]>) {
    let icon: string;
    let title: string;
    let subtitle: string;
    let key: string;
    let gizmoPresets = false;
    if (o[1] === 'page') {
      const info = pageInfo(o[2]);
      icon = info.icon;
      title = info.label;
      subtitle = info.summary;
      key = o[3];
    } else if (o[1] === 'custom') {
      [, , icon, title, subtitle, key] = o;
    } else {
      icon = o[2];
      title = o[3];
      subtitle = pageInfo(this.page).summary;
      key = o[4];
      gizmoPresets = true;
    }
    const owner = key.split('.')[0] ?? '';
    const header = D.headers[owner] ?? null;
    const p = D.props[key];
    const tip: Tip = D.switchTips[owner] ?? { t: p?.t ?? '', i: p?.i ?? '' };
    if (this.matches(p?.l ?? 'Enable', tip.t) || (header && this.searching && this.contains(plain(header.search))))
      this.count();
    this.flush();
    this.endRow();
    this.newRow(15, { band: true, master: true });
    const c = this.newCell(this.row!, 2, M.labelW);
    c.master = true;
    c.items.push({
      k: 'master',
      icon,
      title,
      subtitle,
      pkey: key,
      tip: tipOf(tip.t, tip.i),
      header: header && !this.searching ? header : null,
      gizmoPresets,
      key: 'm' + this.n++,
      dis: this.dis > 0,
      acc: this.accent,
    });
    this.endRow();
  }

  // ---- overview -----------------------------------------------------------------------------------
  overview(ops: Op[]) {
    const app = this.app;
    const C = D.consts;
    if (this.searching) this.op(['tog', 'GeneralSettings.Enabled']);
    else {
      this.endRow();
      this.newRow(15, { band: true, master: true });
      const c = this.newCell(this.row!, 2, M.labelW);
      c.master = true;
      const sw = D.switchTips.GeneralSettings;
      c.items.push({ k: 'ovMaster', key: 'ovm', tip: tipOf(sw.t, sw.i), dis: false, acc: this.accent });
      this.endRow();
    }
    if (!app.val('GeneralSettings.Enabled')) {
      this.banner(true, C.masterOffNote ?? '');
      this.extraAfter(10);
    }
    this.extraAfter(10);
    this.sub('Keyboard Presets', 'd_Keyboard', 15, D.contestedMinWidth);
    if (this.matches('Keyboard Presets', C.layoutTooltip)) {
      this.count();
      this.flush();
      this.add({ k: 'kbPreset' });
    }
    this.contested();
    const off = !app.val('GeneralSettings.Enabled');
    if (off) this.dis++;
    this.features();
    this.sub('Tutorial', '_Help', 15, 0);
    this.propItem('GeneralSettings.ShowTutorial', { k: 'tog' });
    if (!this.searching) {
      const d = !app.val('GeneralSettings.ShowTutorial');
      if (d) this.dis++;
      this.note(C.tutorialStatus ?? '', C.tutorialStatusTip ?? '', 'Tips/Overview/TutorialProgress.png');
      this.action(
        'Progress',
        C.tutorialProgressTip ?? '',
        '↺  Start Over',
        'Tips/Overview/TutorialProgress.png',
        'restart',
      );
      if (d) this.dis--;
    }
    this.propItem('GeneralSettings.ShowShortcutTips', { k: 'tog' });
    if (!this.searching) {
      const d = !app.val('GeneralSettings.ShowShortcutTips');
      if (d) this.dis++;
      this.action('Tips Shown', C.tipsShownTip ?? '', '↺  Show Again', 'Tips/Overview/TipsShown.png', 'tips');
      if (d) this.dis--;
      this.flush();
      this.add({
        k: 'link',
        lead: 'The full guide to every feature: ',
        text: 'Blendon manual (PDF)',
        tip: { t: "Open the PDF manual from the package's Documentation folder", i: '', native: true },
      });
    }
    this.sub('Export', 'd_Refresh', 15, 0);
    if (!this.searching && this.matches('', C.ioTooltip)) {
      this.count();
      this.flush();
      this.add({
        k: 'actions2',
        a: { text: 'Export Settings', tip: tipOf(C.exportTip ?? '', 'Tips/Overview/ExportSettings.png') },
        b: { text: 'Import Settings', tip: tipOf(C.importTip ?? '', 'Tips/Overview/ImportSettings.png') },
      });
    }
    this.pendingCard = { label: 'Defaults', icon: 'd_Settings', accent: '#9EA8B8', id: 'Overview' };
    this.run(ops);
    this.pendingCard = null;
    if (this.wrap?.group) this.endWrap();
    if (off) this.dis--;
  }

  action(label: string, tip: string, btn: string, img: string, act: 'restart' | 'tips') {
    if (!this.matches(label, tip)) return;
    this.count();
    this.flush();
    this.add({ k: 'action', label, btn, act, tip: tipOf(tip, img) });
  }

  contested() {
    const rows = D.contested.filter((r) => this.matches(r.bl, r.ul));
    for (const _ of rows) this.count();
    if (!rows.length) return;
    this.flush();
    this.add({ k: 'contested', rows });
    this.pageLink('Keyboard', 'Open');
  }

  features() {
    for (const g of D.featureGroups) {
      let captioned = false;
      let headerOwed = true;
      let stripe = 0;
      for (const id of g.pages) {
        const info = pageInfo(id);
        if (!captioned) {
          this.sub(g.caption, info.iconName || '', 15, 330);
          captioned = true;
        }
        if (this.matches(info.label, info.summary)) {
          this.count();
          this.flush();
          if (headerOwed) {
            this.add({ k: 'fhead' });
            headerOwed = false;
          }
          this.add({ k: 'frow', page: id, stripe: stripe++ });
        }
        if (id === 'PieMenus') {
          for (const pie of D.pies) {
            if (!this.matches(pie.title, pie.desc)) continue;
            this.count();
            this.flush();
            this.add({ k: 'fpie', pie: pie.id, stripe: stripe++ });
          }
        }
        const ids = D.pageShortcuts[id] ?? [];
        if (ids.length < 2) continue;
        for (const sid of ids) {
          if (id === 'PieMenus' && D.pies.some((p) => p.sid === sid)) continue;
          const name = D.shortcuts[sid]?.n ?? '';
          if (!this.matches(name, info.label)) continue;
          this.count();
          this.flush();
          this.add({ k: 'fsub', page: id, sid, name, stripe: stripe++ });
        }
      }
    }
  }

  // ---- tables -------------------------------------------------------------------------------------
  frameSeq() {
    const vis = this.app.frameSteps().filter((s) => this.matches(s.label, s.tip));
    for (const _ of vis) this.count();
    if (!vis.length) return;
    this.note(
      'What each press of the key does, top to bottom, before it starts over. Untick a step to leave it out. One step always stays in.',
      '',
    );
    this.flush();
    this.add({ k: 'frameSeq', mark: !this.app.isDefault('FrameSelectedSettings.SequenceText') });
  }

  extras() {
    const vis = this.app.extrasOrder().filter((e) => this.matches(e.label, e.tip.t));
    for (const _ of vis) this.count();
    if (!vis.length) return;
    this.flush();
    this.add({ k: 'extras' });
  }

  pieList() {
    const dis = !this.app.val('PieMenuSettings.Enabled');
    if (dis) this.dis++;
    this.sub('Built-in Pie Menus', 'd_AvatarPivot', 15, 572);
    const built = D.pies.filter((p) => this.matches(p.title, p.desc));
    if (built.length) {
      for (const _ of built) this.count();
      this.flush();
      this.add({ k: 'pieTable', pies: built.map((p) => p.id), header: !this.searching });
    }
    this.sub('Custom Pie Menus', 'd_AvatarPivot', 15, 572);
    if (!this.searching) {
      this.flush();
      this.add({ k: 'pieEmpty' });
      this.add({ k: 'pieFooter' });
    }
    if (dis) this.dis--;
  }

  keyboard() {
    if (!this.searching) this.banner(false, D.consts.keyboardIntro ?? '');
    for (const info of D.catalog) {
      const ids = D.pageShortcuts[info.id] ?? [];
      if (!ids.length) continue;
      this.sub(info.label, info.iconName || '', 15, 0);
      const enabled = this.app.pageEnabled(info.id);
      if (!enabled && !this.searching) {
        this.banner(
          false,
          `${info.label} is off, so its keys are parked and belong to the rest of the Editor. Switch it back on to edit them.`,
        );
        this.pageLink(info.id, 'Open');
        continue;
      }
      if (!enabled) this.dis++;
      for (const id of ids) this.shortcut(['sc', id, null, D.shortcuts[id]?.n ?? '', id, '']);
      if (!enabled) this.dis--;
      if (!this.searching) this.pageLink(info.id, 'Open');
    }
  }
}
