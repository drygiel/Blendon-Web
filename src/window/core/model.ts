// The window's settings model and its interaction plumbing: a port of the C# SettingsEditorWindow
// state handling. A model wraps one rendered state; changes go through `update`.
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { PropValue } from '../../plugin/schema.ts';
import { D } from '../../plugin/window-data.ts';
import type { DialogState, FrameStep, MenuItem, StatePatch, TipSource, WindowState } from './state.ts';
import { rich } from './text.ts';
import { clamp, M } from './util.ts';

const TOOLS = ['MoveGizmoSettings', 'RotateGizmoSettings', 'ScaleGizmoSettings', 'TransformGizmoSettings'];

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

// Pages whose switch drives several settings classes at once.
const PAGE_SWITCHES: Record<string, string[]> = {
  SharedGizmos: TOOLS,
  History: ['HistorySettings', 'ViewHistorySettings'],
  PieMenus: ['PieMenuSettings', 'WireframeToggleSettings'],
};

export const pageInfo = (id: string) => D.catalog.find((p) => p.id === id) ?? D.catalog[0];

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
  };
}

export class WindowModel {
  readonly st: WindowState;
  readonly inst: Instance;
  readonly update: (patch: StatePatch) => void;
  /** Set while laying out: whether the search is active, and the page width being laid out. */
  searching = false;
  pageW = 900;

  constructor(st: WindowState, inst: Instance, update: (patch: StatePatch) => void) {
    this.st = st;
    this.inst = inst;
    this.update = update;
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
    const vals = this.st.vals;
    if (key in vals) return vals[key];
    if (key === 'SharedGizmoSettings.AllToolsEnabled') return TOOLS.every((t) => this.val(t + '.Enabled'));
    const p = D.props[key];
    if (!p) return undefined;
    // General overrides: a page that follows the Defaults card shows the Defaults value.
    const follows = D.followers[key];
    if (follows && !this.overriding(key)) return this.val(follows);
    return p.d;
  }

  num(key: string): number {
    return Number(this.val(key));
  }

  isDefault(key: string): boolean {
    const v = this.val(key);
    const d = D.props[key] ? D.props[key].d : v;
    return typeof v === 'number' ? Math.abs(v - Number(d)) < 1e-6 : v === d;
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
    this.update((s) => ({ vals: { ...s.vals, [key]: v } }));
  }

  revert(key: string) {
    key = DELEGATED[key] ?? key;
    this.update((s) => {
      const vals = { ...s.vals };
      delete vals[key];
      return { vals };
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
  shortcutDefault(id: string): string {
    const row = D.known[id];
    if (row && this.st.kbSide === 'Unity') return row.bMove;
    return D.shortcuts[id]?.d ?? '';
  }

  shortcut(id: string): string {
    const sc = this.st.sc;
    return id in sc ? (sc[id] ?? '') : this.shortcutDefault(id);
  }

  shortcutChanged(id: string): boolean {
    const sc = this.st.sc;
    return id in sc && sc[id] !== this.shortcutDefault(id);
  }

  setShortcut(id: string, binding: string) {
    this.update((s) => ({ sc: { ...s.sc, [id]: binding }, capturing: null }));
  }

  clearShortcutOverride(id: string) {
    this.update((s) => {
      const sc = { ...s.sc };
      delete sc[id];
      return { sc, capturing: null };
    });
  }

  unityMoved(row: { uMove: string; key: string }): string {
    return this.st.kbSide === 'Blendon' ? row.uMove : row.key;
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
  frameSteps() {
    const seq = this.st.frameSeq ?? D.frameSteps.map((s) => ({ id: s.id, on: s.on }));
    return seq.map((s) => ({ ...D.frameStepInfo[s.id], id: s.id, on: s.on }));
  }

  setFrame(seq: FrameStep[]) {
    this.update({ frameSeq: seq });
  }

  extrasOrder() {
    const order = this.st.extras ?? D.extras.map((e) => e.id ?? '');
    return order.map((id) => D.extras.find((e) => e.id === id)!);
  }

  moveExtra(ids: string[], i: number, j: number) {
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    this.update({ extras: next });
  }

  pieOn(id: string): boolean {
    const pies = this.st.pies;
    return id in pies ? !!pies[id] : !!D.pies.find((p) => p.id === id)?.enabled;
  }

  setPie(id: string, on: boolean) {
    this.update((s) => ({ pies: { ...s.pies, [id]: on } }));
  }

  // ---- presets ----------------------------------------------------------------------------------
  /** The gizmo appearance preset the current values match (Custom when none). */
  gizmoPresets() {
    let sel = D.gizmoPresets.length;
    for (let i = 0; i < D.gizmoPresets.length; i++) {
      const p = D.gizmoPresets[i];
      const match = Object.keys(p.values).every((k) => {
        const v = this.val(k);
        const w = p.values[k];
        return typeof w === 'number'
          ? Math.abs(Number(v) - w) < 0.0005
          : String(v).toUpperCase() === String(w).toUpperCase();
      });
      if (match) {
        sel = i;
        break;
      }
    }
    return {
      sel,
      labels: [...D.gizmoPresets.map((p) => p.name), 'Custom'],
      tips: [...D.gizmoPresets.map((p) => p.desc), D.consts.customPresetTip ?? ''],
      note: D.consts.gizmoPresetsNote ?? '',
    };
  }

  confirm(dlg: DialogState) {
    this.update({ dlg });
  }

  applyGizmoPreset(i: number) {
    const p = D.gizmoPresets[i];
    this.confirm({
      title: `Apply "${p.name}"`,
      body: `Sets every transform tool's appearance - shapes, colors and the shared axis palette - to ${p.name}'s values. Nothing about what the tools do changes.`,
      ok: 'Apply',
      run: () => this.update((s) => ({ vals: { ...s.vals, ...p.values } })),
    });
  }

  applyPreset(i: number) {
    const p = D.presets[i];
    if (p.restores) {
      this.update({
        preset: i,
        vals: { 'GeneralSettings.Enabled': true },
        sc: {},
        ovr: {},
        frameSeq: null,
        extras: null,
        pies: {},
      });
      return;
    }
    this.update((s) => {
      const vals: Record<string, PropValue> = { ...s.vals, 'GeneralSettings.Enabled': true };
      for (const page of D.catalog) {
        if (!page.feature) continue;
        const on = p.on.includes(page.id);
        const owners = page.id === 'SharedGizmos' ? [] : (PAGE_SWITCHES[page.id] ?? [D.pageOwner[page.id]]);
        for (const t of owners) if (t) vals[t + '.Enabled'] = on;
      }
      return { preset: i, vals };
    });
  }

  resetPage(page: string) {
    const owners = D.resetOwners[page] ?? [];
    const owned = (k: string) => owners.includes(k.split('.')[0] ?? '');
    this.update((s) => {
      const vals = { ...s.vals };
      const ovr = { ...s.ovr };
      const sc = { ...s.sc };
      for (const k of Object.keys(vals)) if (owned(k)) delete vals[k];
      for (const k of Object.keys(ovr)) if (owned(k)) delete ovr[k];
      for (const id of D.pageShortcuts[page] ?? []) delete sc[id];
      const patch: Partial<WindowState> = { vals, ovr, sc };
      if (page === 'FrameSelected') patch.frameSeq = null;
      if (page === 'SceneMenu') patch.extras = null;
      if (page === 'PieMenus') patch.pies = {};
      return patch;
    });
  }

  resetAll() {
    this.update({
      vals: {},
      sc: {},
      ovr: {},
      frameSeq: null,
      extras: null,
      pies: {},
      preset: null,
      kbSide: 'Blendon',
    });
  }

  // ---- navigation -------------------------------------------------------------------------------
  goTo(page: string, hl?: string) {
    this.dismissTip();
    this.update({ page, search: '', hl: hl ?? null, menu: null });
    requestAnimationFrame(() => {
      const scroll = this.inst.scroll;
      if (!scroll) return;
      scroll.scrollTop = 0;
      if (hl) {
        const el = scroll.querySelector<HTMLElement>('[data-hl="true"]');
        if (el) scroll.scrollTop = Math.max(0, el.offsetTop - 60);
      }
      this.syncScrollbars();
    });
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
    const isRich = (!tip.native && tip.t.includes('<size=14>')) || !!tip.i;
    const img = tip.i ? (D.tips[tip.i] ?? '') : '';
    const maxW = Math.max(0, w.width - 12 - 16);
    const width = img ? clamp(640 / 1.75, Math.min(320, maxW), maxW) : Math.min(320, maxW);
    this.update({
      tip: {
        src: tip.t,
        rich: isRich,
        runs: rich(tip.t),
        img,
        aspect: img && tip.i ? (D.tipAR[tip.i] ?? '') : '',
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
