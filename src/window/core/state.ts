import type { PropValue, Tip } from '../data/schema.ts';
import type { Run } from './text.ts';

export interface TipSource extends Partial<Tip> {
  t: string;
  /** A one-line native tooltip rather than the rich card. */
  native?: boolean;
}

export interface TipState {
  src: string;
  rich: boolean;
  runs: Run[];
  img: string;
  aspect: string;
  w: number;
  anchor: { x: number; y: number; w: number; h: number; mx: number };
  winW: number;
  winH: number;
  x: number;
  y: number;
  measured: boolean;
}

export interface MenuItem {
  label: string;
  value?: unknown;
  on?: boolean;
  disabled?: boolean;
  sep?: boolean;
}

export interface MenuState {
  items: MenuItem[];
  multi: boolean;
  x: number;
  y: number;
  minW: number;
  winW: number;
  winH: number;
  placed: boolean;
}

export interface DialogState {
  title: string;
  body: string;
  ok: string;
  single?: boolean;
  run?: () => void;
}

export interface FrameStep {
  id: string;
  on: boolean;
}

export const NEW_PIE = 'new';

export type KeyboardSide = 'Blendon' | 'Unity';

/** Everything the window remembers; changes live only in this tab. */
export interface WindowState {
  // settings
  vals: Record<string, PropValue>;
  ovr: Record<string, boolean>;
  sc: Record<string, string>;
  pies: Record<string, boolean>;
  frameSeq: FrameStep[] | null;
  extras: string[] | null;
  preset: number | null;
  kbSide: KeyboardSide;
  // navigation
  page: string;
  search: string;
  searchFocus: boolean;
  hl: string | null;
  folds: Record<string, boolean>;
  // geometry
  hostW: number | null;
  winW: number | null;
  winH: number | null;
  sideW: number | null;
  sideCollapsed: boolean | null;
  li: number | null;
  // interaction
  tip: TipState | null;
  menu: MenuState | null;
  dlg: DialogState | null;
  /** The pie menu editor: a pie's id, NEW_PIE for Add, or null when closed. */
  pieEdit: string | null;
  capturing: string | null;
  edit: { key: string; text: string } | null;
  dragKey: string | null;
  resizing: boolean;
  /** Fills its host with no frame, tab or grip: a pane of the page's dock. */
  docked: boolean;
}

export function initialState(initial: Record<string, PropValue>): WindowState {
  return {
    vals: { ...initial },
    ovr: {},
    sc: {},
    pies: {},
    frameSeq: null,
    extras: null,
    preset: 0,
    kbSide: 'Blendon',
    page: 'Overview',
    search: '',
    searchFocus: false,
    hl: null,
    folds: { 'PieMenus.Appearance': false },
    hostW: null,
    winW: null,
    winH: null,
    sideW: null,
    sideCollapsed: null,
    li: null,
    tip: null,
    menu: null,
    dlg: null,
    pieEdit: null,
    capturing: null,
    edit: null,
    dragKey: null,
    resizing: false,
    docked: false,
  };
}

export type StatePatch = Partial<WindowState> | ((s: WindowState) => Partial<WindowState>);

export function reduce(s: WindowState, patch: StatePatch): WindowState {
  const p = typeof patch === 'function' ? patch(s) : patch;
  return { ...s, ...p };
}
