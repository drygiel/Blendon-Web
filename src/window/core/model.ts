// The window's settings model and its interaction plumbing: a port of the C# SettingsEditorWindow
// state handling. A model wraps one rendered state; changes go through `update`.
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { type GateReader, Keymap, type LiveSettings, switchedOn } from '../../bridge/keymap.ts';
import { TipResolver } from '../../plugin/keys.ts';
import type { ContestedRow, KeyboardPreset, PropValue, SceneMenuExtra } from '../../plugin/schema.ts';
import { D } from '../../plugin/window-data.ts';
import { SceneTutorial } from '../../scene/blendon/foundation.ts';
import type { DialogState, FrameStep, MenuItem, StatePatch, TipSource, WindowState } from './state.ts';
import { rich } from './text.ts';
import { clamp, M } from './util.ts';

const TOOLS = ['MoveGizmoSettings', 'RotateGizmoSettings', 'ScaleGizmoSettings', 'TransformGizmoSettings'];

const FRAME_SEQUENCE = 'FrameSelectedSettings.SequenceText';
const EXTRA_PREFIX = 'SceneMenuSettings.';
const EXTRA_ORDER = EXTRA_PREFIX + 'ExtraOrderText';

// The Transform tool's sub-settings that store nothing of their own (DelegateTarget in C#).
const DELEGATED: Record<string, string> = {};
for (const n of ['AxisHeadFlat', 'SurfaceSnapEnabled', 'SurfaceSnapModifier'])
  DELEGATED['TransformMoveSettings.' + n] = 'MoveGizmoSettings.' + n;
for (const n of [
  'RingDepthGradientEnabled',
  'RotateToCursorEnabled',
  'LookAtEnabled',
  'LookAtModifier',
  'AngleArcEnabled',
  'AngleArcOpacity',
  'DynamicOpacity',
])
  DELEGATED['TransformRotateSettings.' + n] = 'RotateGizmoSettings.' + n;
for (const n of ['AxisHeadFlat', 'AxisForceLocalOrientation'])
  DELEGATED['TransformScaleSettings.' + n] = 'ScaleGizmoSettings.' + n;

// Forwarded rows the Transform page draws (TransformGizmoPage.BorrowedRows). Its reset reverts these and leaves the
// tools' other forwarded settings as their own pages have them.
const TRANSFORM_BORROWED = [
  'TransformMoveSettings.AxisHeadFlat',
  'TransformRotateSettings.RingDepthGradientEnabled',
  'TransformRotateSettings.AngleArcEnabled',
  'TransformRotateSettings.AngleArcOpacity',
  'TransformRotateSettings.DynamicOpacity',
  'TransformScaleSettings.AxisHeadFlat',
].map((k) => DELEGATED[k]);

// Pages whose switch drives several settings classes at once.
const PAGE_SWITCHES: Record<string, string[]> = {
  SharedGizmos: TOOLS,
  History: ['HistorySettings', 'ViewHistorySettings'],
  PieMenus: ['PieMenuSettings', 'WireframeToggleSettings'],
};

export const pageInfo = (id: string) => D.catalog.find((p) => p.id === id) ?? D.catalog[0];

const values = (n: number) => (n === 1 ? '1 value' : n + ' values');

// SettingsBase.SameValue: half the finest slider step, so a difference no slider shows is no change.
const sameNumber = (a: number, b: number) => Math.abs(a - b) < 0.0005;

/** DOM handles and timers that outlive a render. */
export interface Instance {
  host: HTMLElement | null;
  win: HTMLElement | null;
  scroll: HTMLElement | null;
  thumb: HTMLElement | null;
  track: HTMLElement | null;
  hthumb: HTMLElement | null;
  htrack: HTMLElement | null;
  sscroll: HTMLElement | null;
  sthumb: HTMLElement | null;
  strack: HTMLElement | null;
  tipTimer: number;
  /** A tooltip dismissed by a click stays away until the pointer leaves its anchor. */
  dismissed: string | null;
  menuPick: ((value: unknown, index: number) => void) | null;
  foldCounts: Record<string, number>;
  move: ((e: PointerEvent) => void) | null;
  up: ((e: PointerEvent) => void) | null;
  /** Live gizmo preview canvases by settings owner; `live` ones spin. */
  gizmos: Map<string, { el: HTMLCanvasElement; live: boolean }>;
  gizmoAngle: number;
  gizmoLast: number;
  /** Fixed gizmo yaw for side-by-side checks against Unity captures (?yaw=). */
  gizmoYaw: number | null;
  /** The model of the latest render, which the window's live cards read. */
  model: WindowModel | null;
  /** Cards filled from the live keys and this window's values, cached across renders. */
  tips: TipResolver | null;
  /** Bumped when the values a card can name change: settings, overrides, pie switches. */
  settingsVersion: number;
  /** The values, overrides and pie switches the version was last bumped for. */
  seen: [unknown, unknown, unknown];
}

type DomKey = 'host' | 'win' | 'scroll' | 'thumb' | 'track' | 'hthumb' | 'htrack' | 'sscroll' | 'sthumb' | 'strack';

export function newInstance(): Instance {
  return {
    host: null,
    win: null,
    scroll: null,
    thumb: null,
    track: null,
    hthumb: null,
    htrack: null,
    sscroll: null,
    sthumb: null,
    strack: null,
    tipTimer: 0,
    dismissed: null,
    menuPick: null,
    foldCounts: {},
    move: null,
    up: null,
    gizmos: new Map(),
    gizmoAngle: 0,
    gizmoLast: 0,
    gizmoYaw: null,
    model: null,
    tips: null,
    settingsVersion: 0,
    seen: [null, null, null],
  };
}

// The window's values as the cards read them, from whichever model rendered last.
function liveSettings(inst: Instance): LiveSettings {
  return {
    val: (key) => inst.model?.val(key),
    pieOn: (pie) => !!inst.model?.pieOn(pie),
    get version() {
      return inst.settingsVersion;
    },
  };
}

export class WindowModel {
  readonly st: WindowState;
  readonly inst: Instance;
  readonly update: (patch: StatePatch) => void;
  /** Set while laying out: whether the search is active, and the page width being laid out. */
  searching = false;
  pageW = 900;

  /** The gates read this render's values: the shared copy is only published after it. */
  readonly gates: GateReader = { val: (key) => this.val(key), pieOn: (pie) => this.pieOn(pie) };

  constructor(st: WindowState, inst: Instance, update: (patch: StatePatch) => void) {
    this.st = st;
    this.inst = inst;
    this.update = update;
    inst.model = this;
    const [vals, ovr, pies] = inst.seen;
    if (vals !== st.vals || ovr !== st.ovr || pies !== st.pies) {
      inst.seen = [st.vals, st.ovr, st.pies];
      inst.settingsVersion++;
    }
    if (!inst.tips) {
      const live = liveSettings(inst);
      inst.tips = new TipResolver(Keymap.tokens(() => live));
    }
  }

  /** A card's text as it reads now: its keys from the live bindings, its settings from this window. */
  resolve(text: string): string {
    return this.inst.tips!.resolve(text);
  }

  /** A ref callback that keeps an element's handle. */
  attach(key: DomKey) {
    return (el: HTMLElement | null) => {
      this.inst[key] = el;
    };
  }

  /** The fixed gizmo yaw of the capture-comparison hook. */
  fixGizmoYaw(yaw: number) {
    this.inst.gizmoYaw = yaw;
  }

  // ---- values -----------------------------------------------------------------------------------
  val(key: string): PropValue | undefined {
    key = DELEGATED[key] ?? key;
    // General overrides: a page that follows the Defaults card shows the Defaults value, whatever it stored.
    const follows = D.followers[key];
    if (follows && !this.overriding(key)) return this.val(follows);
    const vals = this.st.vals;
    if (key in vals) return vals[key];
    if (key === 'SharedGizmoSettings.AllToolsEnabled') return TOOLS.every((t) => this.val(t + '.Enabled'));
    if (!D.props[key]) return undefined;
    return this.def(key);
  }

  /** What a setting reads when nothing is stored: the picked look preset's value, else the shipped one. */
  def(key: string): PropValue | undefined {
    const look = D.gizmoPresets[this.st.look]?.values;
    return look && key in look ? look[key] : D.props[key]?.d;
  }

  num(key: string): number {
    return Number(this.val(key));
  }

  /** By the stored value, so a row that follows the Defaults card, or reads off with Blendon off, is no change. */
  isDefault(key: string): boolean {
    key = DELEGATED[key] ?? key;
    if (!(key in this.st.vals)) return true;
    const v = this.st.vals[key];
    // Nothing declared: the stored value is the only evidence left.
    if (!D.props[key]) return false;
    const d = this.def(key);
    if (typeof v === 'number') return sameNumber(v, Number(d));
    // Colors are hex, a picked one may come back in another case.
    return typeof v === 'string' && typeof d === 'string' ? v.toUpperCase() === d.toUpperCase() : v === d;
  }

  overriding(key: string): boolean {
    return !!this.st.ovr[key];
  }

  set(key: string, v: PropValue) {
    key = DELEGATED[key] ?? key;
    if (key === 'SharedGizmoSettings.AllToolsEnabled') {
      this.update((s) => {
        const vals = { ...s.vals };
        for (const t of TOOLS) vals[t + '.Enabled'] = v;
        return { vals };
      });
      return;
    }
    // A value at its default is not stored, unless the row overrides a General one and must keep it.
    const d = this.def(key);
    if (typeof v === 'number' && typeof d === 'number' && !D.followers[key] && sameNumber(v, d)) {
      this.revert(key);
      return;
    }
    this.update((s) => ({ vals: { ...s.vals, [key]: v } }));
  }

  /** Back to the default. An override row's flag goes too, or it would override with its source's value. */
  revert(key: string) {
    key = DELEGATED[key] ?? key;
    this.update((s) => {
      const vals = { ...s.vals };
      delete vals[key];
      if (!(key in s.ovr)) return { vals };
      const ovr = { ...s.ovr };
      delete ovr[key];
      return { vals, ovr };
    });
  }

  /** Which other modifier already uses this key, when a drag would do both. */
  aimClash(mod: PropValue | undefined): string | false {
    if (!mod || mod === 'None') return false;
    if (
      this.val('SharedGizmoSettings.PrecisionModeEnabled') &&
      this.val('SharedGizmoSettings.PrecisionModifier') === mod
    )
      return 'Precision Mode';
    if (this.val('SharedGizmoSettings.AxisExcludeModifier') === mod) return 'Plane Lock';
    return false;
  }

  anyTool(): boolean {
    return TOOLS.some((t) => this.val(t + '.Enabled'));
  }

  pageEnabled(page: string): boolean {
    const v = (k: string) => !!this.val(k);
    switch (page) {
      case 'SharedGizmos':
        return this.anyTool();
      case 'History':
        return v('HistorySettings.Enabled') || v('ViewHistorySettings.Enabled');
      case 'PieMenus':
        return v('PieMenuSettings.Enabled') || v('WireframeToggleSettings.Enabled');
      case 'Overview':
      case 'Keyboard':
        return true;
    }
    const owner = D.pageOwner[page];
    return owner ? v(owner + '.Enabled') : true;
  }

  pageFull(page: string): boolean {
    const v = (k: string) => !!this.val(k);
    if (page === 'SharedGizmos') return v('SharedGizmoSettings.AllToolsEnabled');
    if (page === 'History') return v('HistorySettings.Enabled') && v('ViewHistorySettings.Enabled');
    if (page === 'PieMenus') return v('PieMenuSettings.Enabled') && v('WireframeToggleSettings.Enabled');
    return this.pageEnabled(page);
  }

  setPageEnabled(page: string, on: boolean) {
    const owners = PAGE_SWITCHES[page] ?? [D.pageOwner[page]];
    this.update((s) => {
      const vals = { ...s.vals };
      for (const t of owners) if (t) vals[t + '.Enabled'] = on;
      return { vals };
    });
  }

  // ---- shortcuts --------------------------------------------------------------------------------
  shortcut(id: string): string {
    return Keymap.binding(id, this.gates) ?? '';
  }

  /** The key the active keyboard preset gives a shortcut, which restore goes back to. */
  shortcutReference(id: string): string {
    return Keymap.reference(id) ?? '';
  }

  shortcutChanged(id: string): boolean {
    return Keymap.isModified(id, this.gates);
  }

  setShortcut(id: string, binding: string) {
    Keymap.rebind(id, binding);
    this.update({ capturing: null });
    SceneTutorial.report('ShortcutRebound');
  }

  restoreShortcut(id: string) {
    Keymap.restore(id);
    this.update({ capturing: null });
    SceneTutorial.report('ShortcutRebound');
  }

  /** Whether a shortcut's feature is switched on, whatever the tool context. */
  shortcutSwitchedOn(id: string): boolean {
    return switchedOn(id, this.gates);
  }

  contestState(row: ContestedRow) {
    return Keymap.contestState(row, this.gates);
  }

  contestListed(row: ContestedRow) {
    return Keymap.listed(row, this.gates);
  }

  /**
   * NativeCollisionNote: while Blendon holds the key, the Editor command it covers or replaces, and where.
   * `binding` is the key on show, a draft in the pie menu editor.
   */
  nativeNote(id: string, binding = this.shortcut(id)): { lead: string; hint: string; ul: string } | null {
    const row = D.known[id];
    if (!row || binding !== row.key) return null;
    const theirs = this.shortcut(row.uid);
    const hint = theirs
      ? `"${row.ul}" is on ${theirs}. Open it in Unity's Shortcuts window`
      : `"${row.ul}" has no key. Open it in Unity's Shortcuts window`;
    // Outside Blendon's context the Editor's command has the key back.
    const where = Keymap.needsContext(id, this.gates) ? "in Blendon's context" : 'in the Scene View';
    const lead = `${row.replaces ? 'Replaces' : 'Covers'} the Editor's "${row.ul}" ${where}. Open in`;
    return { lead, hint, ul: row.ul };
  }

  // ---- keyboard presets -------------------------------------------------------------------------
  /** Read off the keys, nothing stored. */
  keyboardPreset(): KeyboardPreset {
    return Keymap.preset();
  }

  /** One batch of writes; the same preset again is a no-op. */
  applyKeyboardPreset(preset: KeyboardPreset) {
    if (preset !== this.keyboardPreset()) Keymap.applyPreset(preset);
  }

  // ---- folds ------------------------------------------------------------------------------------
  foldOpen(key: string): boolean {
    return this.st.folds[key] !== false;
  }

  /** FoldCounts: a closed fold shows the count it had when last open this session. */
  foldCount(key: string, n: number | null): number {
    if (n != null) this.inst.foldCounts[key] = n;
    return this.inst.foldCounts[key] ?? 0;
  }

  // ---- tables -----------------------------------------------------------------------------------
  /** FrameSelectedSettings.Parse: the stored text in order, then any step it misses, switched off. */
  frameSteps() {
    const seq: FrameStep[] = [];
    for (const token of String(this.val(FRAME_SEQUENCE) ?? '').split(',')) {
      const on = token.length > 0 && token[0] !== '-';
      const id = on ? token : token.replace(/^-+/, '');
      if (D.frameStepInfo[id] && !seq.some((s) => s.id === id)) seq.push({ id, on });
    }
    for (const s of D.frameSteps) if (!seq.some((x) => x.id === s.id)) seq.push({ id: s.id, on: false });
    return seq.map((s) => ({ ...D.frameStepInfo[s.id], id: s.id, on: s.on }));
  }

  /** FrameSelectedSettings.Store: one text, an off step keeping its place behind a '-'. */
  setFrame(seq: FrameStep[]) {
    this.set(FRAME_SEQUENCE, seq.map((s) => (s.on ? '' : '-') + s.id).join(','));
  }

  /** SceneMenuCatalog.Ordered: the stored names first, once each, then the groups they leave out. */
  extrasOrder() {
    const text = String(this.val(EXTRA_ORDER) ?? '');
    const order: SceneMenuExtra[] = [];
    for (const name of text ? text.split(',') : []) {
      const e = D.extras.find((x) => x.id === EXTRA_PREFIX + name);
      if (e && !order.includes(e)) order.push(e);
    }
    for (const e of D.extras) if (!order.includes(e)) order.push(e);
    return order;
  }

  /** SceneMenuCatalog.Store: every group's setting name, in the new order. */
  moveExtra(ids: string[], i: number, j: number) {
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    this.set(EXTRA_ORDER, next.map((id) => id.slice(EXTRA_PREFIX.length)).join(','));
  }

  pieOn(id: string): boolean {
    const pies = this.st.pies;
    return id in pies ? !!pies[id] : !!D.pies.find((p) => p.id === id)?.enabled;
  }

  setPie(id: string, on: boolean) {
    this.update((s) => ({ pies: { ...s.pies, [id]: on } }));
  }

  // ---- presets ----------------------------------------------------------------------------------
  /** How many settings the picked look preset covers differ from it (GizmoAppearancePresets.ChangedCount). */
  lookChanges(): number {
    const look = D.gizmoPresets[this.st.look]?.values ?? {};
    return Object.keys(look).filter((k) => !this.isDefault(k)).length;
  }

  /** The picked look preset, marked while a value differs from it (GizmoAppearancePresets.Labels and Note). */
  gizmoPresets() {
    const sel = this.st.look;
    const changed = this.lookChanges();
    const name = D.gizmoPresets[sel]?.name ?? '';
    const marked = (i: number) => changed > 0 && i === sel;
    return {
      sel,
      names: D.gizmoPresets.map((p) => p.name),
      labels: D.gizmoPresets.map((p, i) => (marked(i) ? p.name + (D.consts.gizmoPresetMark ?? '') : p.name)),
      tips: D.gizmoPresets.map((p, i) =>
        marked(i) ? p.desc + ' Some values differ from it, click to put them back.' : p.desc,
      ),
      note: changed
        ? `${values(changed)} ${changed === 1 ? 'differs' : 'differ'} from ${name}, each marked on its row. ` +
          `Click ${name} to put them back.`
        : (D.consts.gizmoPresetsNote ?? ''),
    };
  }

  confirm(dlg: DialogState) {
    this.update({ dlg });
  }

  /** Picking the preset again puts its values back; picking another makes it the default and drops the changes. */
  applyGizmoPreset(i: number) {
    const p = D.gizmoPresets[i];
    if (!p) return;
    const changed = this.lookChanges();
    const pick = () =>
      this.update((s) => {
        const vals = { ...s.vals };
        for (const k of Object.keys(p.values)) delete vals[k];
        return { vals, look: i };
      });
    if (i === this.st.look) {
      if (!changed) return;
      this.confirm({
        title: `Back to "${p.name}"`,
        body: `Puts the ${values(changed)} changed from ${p.name} back to its values. Nothing else changes.`,
        ok: 'Put Back',
        run: pick,
      });
      return;
    }
    const from = D.gizmoPresets[this.st.look]?.name ?? '';
    this.confirm({
      title: `Apply "${p.name}"`,
      body:
        `Sets every transform tool's appearance - shapes, colors and the shared axis palette - to ${p.name}'s values. ` +
        'Nothing about what the tools do changes.' +
        (changed ? `\n\nThe ${values(changed)} changed from ${from} go to ${p.name}'s too.` : ''),
      ok: 'Apply',
      run: pick,
    });
  }

  /** The feature preset the switches are in right now, or -1: read off them, so one flipped switch lights none. */
  currentPreset(): number {
    if (!this.val('GeneralSettings.Enabled')) return -1;
    return D.presets.findIndex((p) =>
      D.catalog.every((page) => {
        if (!page.feature) return true;
        const on = p.on === null || p.on.includes(page.id);
        return on ? this.pageFull(page.id) : !this.pageEnabled(page.id);
      }),
    );
  }

  /** A preset only flips feature switches: tuning, keys and the keyboard preset stay as they are. */
  applyPreset(i: number) {
    const p = D.presets[i];
    this.update((s) => {
      const vals: Record<string, PropValue> = { ...s.vals, 'GeneralSettings.Enabled': true };
      for (const page of D.catalog) {
        if (!page.feature) continue;
        const on = p.on === null || p.on.includes(page.id);
        const owners = page.id === 'SharedGizmos' ? [] : (PAGE_SWITCHES[page.id] ?? [D.pageOwner[page.id]]);
        for (const t of owners) if (t) vals[t + '.Enabled'] = on;
      }
      return { vals };
    });
  }

  setMaster(on: boolean) {
    if (on === !!this.val('GeneralSettings.Enabled')) return;
    this.set('GeneralSettings.Enabled', on);
  }

  resetPage(page: string) {
    const owners = D.resetOwners[page] ?? [];
    const borrowed = page === 'TransformGizmo' ? TRANSFORM_BORROWED : [];
    const owned = (k: string) => owners.includes(k.split('.')[0] ?? '') || borrowed.includes(k);
    // Shortcuts go back to the key the active preset gives each one.
    const preset = Keymap.preset();
    Keymap.batch(() => {
      for (const id of D.pageShortcuts[page] ?? []) Keymap.restore(id, preset);
    });
    this.update((s) => {
      const vals = { ...s.vals };
      const ovr = { ...s.ovr };
      for (const k of Object.keys(vals)) if (owned(k)) delete vals[k];
      for (const k of Object.keys(ovr)) if (owned(k)) delete ovr[k];
      const patch: Partial<WindowState> = { vals, ovr };
      if (page === 'PieMenus') patch.pies = {};
      return patch;
    });
  }

  /** Every page's reset: Blendon's keys back to the active preset, the Editor's commands as the user left them. */
  resetAll() {
    const preset = Keymap.preset();
    Keymap.batch(() => {
      for (const ids of Object.values(D.pageShortcuts)) for (const id of ids) Keymap.restore(id, preset);
    });
    // The gizmo look goes back to Blender's with the rest (SettingsPages.ResetAll).
    this.update({
      vals: {},
      ovr: {},
      pies: {},
      look: 0,
    });
  }

  // ---- navigation -------------------------------------------------------------------------------
  goTo(page: string, hl?: string) {
    this.dismissTip();
    this.update({ page, search: '', hl: hl ?? null, menu: null });
    // A request from another part of the page may render a few frames later, so the marked row is waited for.
    const scrollTo = (tries: number) =>
      requestAnimationFrame(() => {
        const scroll = this.inst.scroll;
        if (!scroll) return;
        const el = hl ? scroll.querySelector<HTMLElement>('[data-hl="true"]') : null;
        if (hl && !el && tries > 0) return scrollTo(tries - 1);
        // The marked row lands in the middle of the view, the way OpenAt scrolls to it. Rows sit in cells, so the
        // offset is measured against the scroller rather than read from offsetTop.
        const top = el ? scroll.scrollTop + el.getBoundingClientRect().top - scroll.getBoundingClientRect().top : 0;
        scroll.scrollTop = el ? Math.max(0, top - (scroll.clientHeight - el.offsetHeight) / 2) : 0;
        this.syncScrollbars();
      });
    scrollTo(10);
  }

  /** Anything that would leave the window (Editor windows, files, the screen) answers with this. */
  demo(what: string) {
    this.dismissTip();
    this.update({
      menu: null,
      capturing: null,
      dlg: {
        title: 'Demo only',
        ok: 'OK',
        single: true,
        body: what + "\n\nThis is only a demo of the settings window, so this option isn't available on the website.",
      },
    });
  }

  /** Opens the pie menu editor on a built-in pie, or on a new menu for NEW_PIE. */
  editPie(id: string) {
    this.dismissTip();
    this.update({ menu: null, capturing: null, pieEdit: id });
  }

  // ---- tooltips ---------------------------------------------------------------------------------
  tipIn(e: ReactMouseEvent<HTMLElement>, tip: TipSource | null | undefined) {
    if (!tip?.t) return;
    if (this.inst.dismissed === tip.t) return;
    const el = e.currentTarget;
    const mx = e.clientX;
    clearTimeout(this.inst.tipTimer);
    if (this.st.tip) this.update({ tip: null });
    this.inst.tipTimer = window.setTimeout(() => this.showTip(el, tip, mx), 500);
  }

  tipOut() {
    clearTimeout(this.inst.tipTimer);
    this.inst.dismissed = null;
    if (this.st.tip) this.update({ tip: null });
  }

  dismissTip() {
    clearTimeout(this.inst.tipTimer);
    if (!this.st.tip) return;
    this.inst.dismissed = this.st.tip.src;
    this.update({ tip: null });
  }

  private showTip(el: HTMLElement, tip: TipSource, mx: number) {
    const win = this.inst.win;
    if (!win || !el.isConnected) return;
    const w = win.getBoundingClientRect();
    const a = el.getBoundingClientRect();
    const anchor = { x: a.left - w.left, y: a.top - w.top, w: a.width, h: a.height, mx: mx - w.left };
    const text = tip.src ? this.resolve(tip.src) : tip.t;
    const isRich = (!tip.native && text.includes('<size=14>')) || !!tip.i || !!tip.url;
    const img = tip.url ?? (tip.i ? (D.tips[tip.i] ?? '') : '');
    const maxW = Math.max(0, w.width - 12 - 16);
    const width = img ? clamp(640 / 1.75, Math.min(320, maxW), maxW) : Math.min(320, maxW);
    this.update({
      tip: {
        src: tip.t,
        rich: isRich,
        runs: rich(text),
        img,
        aspect: tip.ar ?? (img && tip.i ? (D.tipAR[tip.i] ?? '') : ''),
        w: width,
        anchor,
        winW: w.width,
        winH: w.height,
        x: -9999,
        y: 0,
        measured: false,
      },
    });
  }

  /** RichTooltip.Place: positions the card once its size is known. */
  placeTip(el: HTMLElement | null) {
    const t = this.st.tip;
    if (!el || !t || t.measured) return;
    const h = el.offsetHeight;
    const wd = el.offsetWidth;
    const a = t.anchor;
    let x: number;
    let y: number;
    if (t.rich) {
      x = clamp(a.x, 6, Math.max(6, t.winW - 6 - wd));
      y = a.y + a.h + 4;
      if (y + h > t.winH - 6 && a.y > t.winH - (a.y + a.h)) y = a.y - 4 - h;
      y = clamp(y, 6, Math.max(6, t.winH - 6 - h));
    } else {
      x = clamp(a.mx, 4, Math.max(4, t.winW - 4 - wd));
      y = a.y + a.h + 2;
      if (y + h > t.winH - 4) y = a.y - h - 2;
    }
    this.update({ tip: { ...t, x, y, measured: true } });
  }

  // ---- popup menus ------------------------------------------------------------------------------
  openMenu(
    e: ReactMouseEvent<HTMLElement>,
    items: MenuItem[],
    onPick: (value: unknown, index: number) => void,
    multi = false,
  ) {
    e.preventDefault();
    e.stopPropagation();
    this.dismissTip();
    const win = this.inst.win;
    if (!win) return;
    const w = win.getBoundingClientRect();
    const a = e.currentTarget.getBoundingClientRect();
    const ctx = e.type === 'contextmenu';
    this.inst.menuPick = onPick;
    this.update({
      menu: {
        items,
        multi,
        x: (ctx ? e.clientX : a.left) - w.left,
        y: (ctx ? e.clientY : a.bottom) - w.top + (ctx ? 0 : 1),
        minW: ctx ? 0 : a.width,
        winW: w.width,
        winH: w.height,
        placed: false,
      },
    });
  }

  placeMenu(el: HTMLElement | null) {
    const m = this.st.menu;
    if (!el || !m || m.placed) return;
    const h = el.offsetHeight;
    const wd = el.offsetWidth;
    const x = clamp(m.x, 2, Math.max(2, m.winW - wd - 2));
    let y = m.y;
    if (y + h > m.winH - 2) y = Math.max(2, m.y - h - 20);
    this.update({ menu: { ...m, x, y, placed: true } });
  }

  // ---- drags (sliders, splitter, window resize, scrollbar thumbs) -------------------------------
  startDrag(move: (e: PointerEvent) => void, up?: (e: PointerEvent) => void) {
    this.endDrag();
    this.inst.move = (e) => {
      e.preventDefault();
      move(e);
    };
    this.inst.up = (e) => {
      this.endDrag();
      up?.(e);
    };
    window.addEventListener('pointermove', this.inst.move);
    window.addEventListener('pointerup', this.inst.up);
  }

  endDrag() {
    if (this.inst.move) window.removeEventListener('pointermove', this.inst.move);
    if (this.inst.up) window.removeEventListener('pointerup', this.inst.up);
    this.inst.move = this.inst.up = null;
  }

  // ---- custom scrollbars (thumb geometry written straight to the thumb's style) -----------------
  syncScrollbars() {
    const i = this.inst;
    for (const [el, th, tr] of [
      [i.scroll, i.thumb, i.track],
      [i.sscroll, i.sthumb, i.strack],
    ] as const) {
      if (!el || !th || !tr) continue;
      const h = el.clientHeight;
      const sh = el.scrollHeight;
      const trackH = tr.clientHeight;
      const need = sh > h + 1;
      // Unity keeps the bar when nothing overflows, with the thumb filling the whole track.
      const size = need ? Math.max(20, (trackH * h) / sh) : trackH;
      const top = need ? (trackH - size) * (el.scrollTop / (sh - h)) : 0;
      th.style.height = size + 'px';
      th.style.transform = `translateY(${top}px)`;
      th.style.display = 'block';
    }
    const { scroll: el, hthumb: hth, htrack: htr } = i;
    if (el && hth && htr) {
      const w = el.clientWidth;
      const sw = el.scrollWidth;
      const trackW = htr.clientWidth;
      const need = sw > w + 1;
      const size = need ? Math.max(20, (trackW * w) / sw) : trackW;
      hth.style.width = size + 'px';
      hth.style.display = 'block';
      hth.style.transform = `translateX(${need ? (trackW - size) * (el.scrollLeft / (sw - w)) : 0}px)`;
    }
  }

  thumbDrag(e: ReactPointerEvent, el: HTMLElement | null, track: HTMLElement | null, horizontal = false) {
    if (!el || !track || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (horizontal) {
      const x0 = e.clientX;
      const s0 = el.scrollLeft;
      const ratio = el.scrollWidth / Math.max(1, track.clientWidth);
      this.startDrag((ev) => {
        el.scrollLeft = s0 + (ev.clientX - x0) * ratio;
      });
    } else {
      const y0 = e.clientY;
      const s0 = el.scrollTop;
      const ratio = el.scrollHeight / Math.max(1, track.clientHeight);
      this.startDrag((ev) => {
        el.scrollTop = s0 + (ev.clientY - y0) * ratio;
      });
    }
  }

  trackPage(e: ReactPointerEvent, el: HTMLElement | null, thumb: HTMLElement | null, horizontal = false) {
    if (!el || !thumb || e.target !== e.currentTarget) return;
    const r = thumb.getBoundingClientRect();
    if (horizontal) el.scrollLeft += (e.clientX < r.left ? -1 : 1) * el.clientWidth * 0.9;
    else el.scrollTop += (e.clientY < r.top ? -1 : 1) * el.clientHeight * 0.9;
  }

  // ---- window geometry --------------------------------------------------------------------------
  measure() {
    const host = this.inst.host;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const cs = getComputedStyle(host);
    const avail = Math.floor(r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    if (this.st.docked) {
      const h = Math.floor(r.height);
      this.update((s) =>
        avail !== s.hostW || avail !== s.winW || h !== s.winH ? { hostW: avail, winW: avail, winH: h } : {},
      );
      return;
    }
    this.update((s) => (avail !== s.hostW ? { hostW: avail } : {}));
  }

  sideCollapsedNow(): boolean {
    return this.st.sideCollapsed ?? (this.st.hostW ?? 1100) < 700;
  }

  splitDrag(e: ReactPointerEvent) {
    if (e.button !== 0 || !this.inst.win) return;
    e.preventDefault();
    const winLeft = this.inst.win.getBoundingClientRect().left;
    this.startDrag((ev) =>
      this.update({ sideCollapsed: false, sideW: clamp(ev.clientX - winLeft, M.sideMin, M.sideMax) }),
    );
  }

  gripDrag(e: ReactPointerEvent) {
    if (e.button !== 0 || !this.inst.win) return;
    e.preventDefault();
    const r = this.inst.win.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    this.update({ resizing: true });
    this.startDrag(
      (ev) =>
        this.update({
          winW: Math.round(r.width + ev.clientX - x0),
          winH: Math.round(clamp(r.height + ev.clientY - y0, 470, 1400)),
        }),
      () => this.update({ resizing: false }),
    );
  }
}
