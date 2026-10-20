// The page's one shortcut profile, shared by the settings window and the Scene view (SC-2). Every shortcut has
// the key it declares unless the user changed it: a rebind, a keyboard preset and a Move are all the user's keys.
// A switched-off feature writes nothing, its gate just shuts and the Editor's command hears the key again.
import { TipResolver, type TokenSource } from '../plugin/keys.ts';
import type { ContestedRow, ContestState, KeyboardPreset } from '../plugin/schema.ts';
import { D } from '../plugin/window-data.ts';
import { PlaygroundEvents } from './events.ts';
import { SharedSettings, type SharedValue } from './settings.ts';

/** What the gates read: the settings' live values and which pie menus are on. */
export interface GateReader {
  val(key: string): SharedValue | undefined;
  pieOn(pieId: string): boolean;
}

/** A reader whose version moves with every value, for filled-in text that names a setting. */
export interface LiveSettings extends GateReader {
  readonly version: number;
}

const MENU = 'Scene View/Menu';
const OUR_MENU = 'Blendon/Context Menu';
const TOOLS = ['MoveGizmoSettings', 'RotateGizmoSettings', 'ScaleGizmoSettings', 'TransformGizmoSettings'];
// HierarchyWalk's keys, which Box Select's Hierarchy Keys switch can shut on their own.
const HIERARCHY = new Set([
  'Blendon/Select Parent',
  'Blendon/Select Children',
  'Blendon/Add Parent To Selection',
  'Blendon/Add Children To Selection',
]);

let overrides: Record<string, string> = {};
let version = 0;
let batching = 0;
let dirty = false;
const listeners = new Set<() => void>();
let pageOf: Map<string, string> | null = null;
let pieOf: Map<string, string> | null = null;

function changed() {
  version++;
  if (batching) {
    dirty = true;
    return;
  }
  for (const l of listeners) l();
}

// The captured values, else the shipped ones; a page that follows the Defaults card reads the General value.
function defaultVal(key: string): SharedValue | undefined {
  if (key in D.initial) return D.initial[key];
  const follows = D.followers[key];
  if (follows) return defaultVal(follows);
  return D.props[key]?.d;
}

/** The window's values once it has loaded, the defaults until then. */
export const sharedSettings: LiveSettings = {
  val: (key) => SharedSettings.val(key) ?? defaultVal(key),
  pieOn: (pie) => SharedSettings.reader?.pieOn(pie) ?? !!D.pies.find((p) => p.id === pie)?.enabled,
  get version() {
    return SharedSettings.version;
  },
};

function flag(r: GateReader, key: string): boolean {
  const v = r.val(key);
  return v === undefined ? D.props[key]?.d !== false : !!v;
}

/**
 * IsShortcutLive: whether a Blendon shortcut's feature is switched on, whatever the tool context. Every page's
 * Enabled folds in the master switch.
 */
export function switchedOn(id: string, r: GateReader = sharedSettings): boolean {
  if (!id.startsWith('Blendon/') || !flag(r, 'GeneralSettings.Enabled')) return false;
  const on = (cls: string) => flag(r, cls + '.Enabled');
  if (id === OUR_MENU) return on('SceneMenuSettings');
  if (id === 'Blendon/Toggle Wireframe') return on('WireframeToggleSettings');
  if (id.startsWith('Blendon/History/')) return on(id.endsWith('View') ? 'ViewHistorySettings' : 'HistorySettings');
  if (id.startsWith('Blendon/Pie Menus/')) {
    pieOf ??= new Map(D.pies.map((p) => [p.sid, p.id]));
    const pie = pieOf.get(id);
    return on('PieMenuSettings') && !!pie && r.pieOn(pie);
  }
  if (id.startsWith('Blendon/Zoom/')) return on('ZoomSettings') && flag(r, 'ZoomSettings.KeyboardEnabled');
  pageOf ??= new Map(Object.entries(D.pageShortcuts).flatMap(([page, ids]) => ids.map((i) => [i, page] as const)));
  const page = pageOf.get(id);
  if (page === 'Overview') return true;
  if (page === 'SharedGizmos') return TOOLS.some(on);
  if (page === 'BoxSelect')
    return on('BoxSelectSettings') && (!HIERARCHY.has(id) || flag(r, 'BoxSelectSettings.HierarchyKeys'));
  const owner = page ? D.pageOwner[page] : undefined;
  return owner ? on(owner) : false;
}

/** The shipped key: what Blendon's shortcut declares, or the Editor command's own. */
function declared(id: string): string | undefined {
  const k = D.keymap[id];
  if (!k) return D.shortcuts[id]?.d;
  return id.startsWith('Blendon/') ? k.b : k.u;
}

// SceneMenuHandover: two actions on one mouse button make Unity ask which to run, so the Editor's menu is
// unset while Blendon's answers the same button, and has it back once ours stops.
function handedOver(r: GateReader): boolean {
  const theirs = declared(MENU);
  return !!theirs && !(MENU in overrides) && switchedOn(OUR_MENU, r) && Keymap.binding(OUR_MENU) === theirs;
}

/** Resolution.KeepsKey: the Unity keys leave ours on the Blender key too. */
function keepsKey(row: ContestedRow): boolean {
  return row.blendonAlt === row.key;
}

/** ShortcutPresets.GiveBackLanding: an Editor command parked where ours lands, or where the Blender keys moved it. */
function giveBackLanding(row: ContestedRow) {
  // Unset on purpose, by the user or the menu handover.
  const live = Keymap.binding(row.uid);
  if (!live) return;
  // A kept key is the Editor command's own.
  const landing = keepsKey(row) ? '' : row.blendonAlt;
  if (live === landing || live === row.editorAlt) Keymap.clear(row.uid);
}

export const Keymap = {
  /** Bumped by every write, for holders of a binding. */
  get version() {
    return version;
  },

  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  /** The binding the profile holds now, "" when it has none; undefined for an id the page doesn't know. */
  binding(id: string, r: GateReader = sharedSettings): string | undefined {
    if (id in overrides) return overrides[id];
    if (id === MENU && handedOver(r)) return '';
    return declared(id);
  },

  declared,

  /** IsChangedFromDefault: by value, so a key typed back to its default is no change. */
  changedFromDefault(id: string, r: GateReader = sharedSettings): boolean {
    const b = Keymap.binding(id, r);
    return b !== undefined && b !== declared(id);
  },

  /** ShortcutPresets.Active: read off the keys, Unity when most contested shortcuts sit on their Unity key. */
  preset(): KeyboardPreset {
    let blendon = 0;
    let unity = 0;
    for (const row of D.contested) {
      // Same key under both presets, it can't vote.
      if (keepsKey(row)) continue;
      const live = Keymap.binding(row.bid);
      if (live === row.blendonAlt) unity++;
      else if (live === row.key) blendon++;
    }
    return unity > blendon ? 'Unity' : 'Blendon';
  },

  /** The key a preset gives a shortcut, the baseline for "modified" and restore. */
  reference(id: string, preset: KeyboardPreset = Keymap.preset()): string | undefined {
    const row = D.known[id];
    return preset === 'Unity' && row ? row.blendonAlt : declared(id);
  },

  /** Ours against the preset's key, the Editor's against what it shipped with. */
  isModified(id: string, r: GateReader = sharedSettings): boolean {
    if (!id.startsWith('Blendon/')) return Keymap.changedFromDefault(id, r);
    return Keymap.binding(id) !== Keymap.reference(id);
  },

  rebind(id: string, binding: string) {
    overrides = { ...overrides, [id]: binding };
    changed();
  },

  /** ClearShortcutOverride: back to the shipped key. */
  clear(id: string) {
    if (!(id in overrides)) return;
    const next = { ...overrides };
    delete next[id];
    overrides = next;
    changed();
  },

  /** Back to the preset's key: a clear when that is the declared one, no record left. */
  restore(id: string, preset: KeyboardPreset = Keymap.preset()) {
    const wanted = Keymap.reference(id, preset);
    if (wanted === undefined || wanted === declared(id)) Keymap.clear(id);
    else if (Keymap.binding(id) !== wanted) Keymap.rebind(id, wanted);
  },

  /** One notification for many writes, the way ShortcutBatch rebuilds the directory once. */
  batch(fn: () => void) {
    batching++;
    try {
      fn();
    } finally {
      batching--;
      if (!batching && dirty) {
        dirty = false;
        for (const l of listeners) l();
      }
    }
  },

  /** Puts every contested Blendon shortcut on the preset's key. The Blendon preset only clears. */
  applyPreset(preset: KeyboardPreset) {
    Keymap.batch(() => {
      for (const row of D.contested) {
        Keymap.restore(row.bid, preset);
        // The Unity keys give the Editor its keys back.
        if (preset === 'Unity') giveBackLanding(row);
      }
    });
  },

  /** The dock's reset: no user key left, which is the Blendon preset. */
  reset() {
    if (!Object.keys(overrides).length) return;
    overrides = {};
    changed();
  },

  /** Blendon's key also belongs to the Editor command its row names, so the two compete for it. */
  covers(id: string, r: GateReader = sharedSettings): boolean {
    const row = D.known[id];
    if (!row) return false;
    const ours = Keymap.binding(id, r) ?? '';
    return ours.length > 0 && ours === Keymap.binding(row.uid, r);
  },

  /** ShortcutGates.NeedsContext: shut outside Blendon's tool context right now. */
  needsContext(id: string, r: GateReader = sharedSettings): boolean {
    const need = D.contextNeed[id];
    return need === 'Always' || (need === 'WhenCovering' && Keymap.covers(id, r));
  },

  /** OverviewContestedTable.Read: from the switches and the live keys, not the tool context. */
  contestState(row: ContestedRow, r: GateReader = sharedSettings): ContestState {
    if (!switchedOn(row.bid, r) || Keymap.binding(row.bid, r) !== row.key) return 'Free';
    // A replaced command with no key is the replacement itself, like the menu handover's own clear.
    if (row.replaces && !Keymap.binding(row.uid, r)) return 'Replaced';
    if (Keymap.changedFromDefault(row.uid, r)) return 'Moved';
    return row.replaces ? 'Replaced' : 'Covered';
  },

  /** OverviewContestedTable.Listed: only rows with a button. The Editor's menu follows ours on its own. */
  listed(row: ContestedRow, r: GateReader = sharedSettings): boolean {
    const state = Keymap.contestState(row, r);
    return row.uid !== MENU && (state === 'Covered' || state === 'Moved');
  },

  /** ShortcutTips.Read: what the first press of Blendon's key has to tell. */
  tipStory(row: ContestedRow, r: GateReader = sharedSettings): 'Covered' | 'Moved' | 'Unset' | null {
    if (Keymap.binding(row.bid, r) !== row.key) return null;
    if (!Keymap.changedFromDefault(row.uid, r)) return 'Covered';
    return Keymap.binding(row.uid, r) ? 'Moved' : 'Unset';
  },

  /** Move: the Editor's command onto its alternative, once. Nothing keeps it there. */
  move(row: ContestedRow) {
    if (row.editorAlt) Keymap.rebind(row.uid, row.editorAlt);
  },

  /** Reset: the Editor's command gets its own key back, and Blendon covers it again. */
  giveBack(row: ContestedRow) {
    Keymap.clear(row.uid);
  },

  /** Cards' tokens against these keys and a reader's settings. */
  tokens(settings: () => LiveSettings): TokenSource {
    return {
      // The menu's binding moves with a switch, so its handover state is part of the key version.
      get keysVersion() {
        return version * 2 + (handedOver(settings()) ? 1 : 0);
      },
      get settingsVersion() {
        return settings().version;
      },
      binding: (id) => Keymap.binding(id, settings()),
      setting: (path) => {
        const p = D.props[path];
        return p && { k: p.k, v: settings().val(path) ?? p.d, o: p.o };
      },
    };
  },
};

let shared: TipResolver | null = null;

/** Cards filled from the shared keys and the window's settings, for anything outside the window. */
export function sharedTips(): TipResolver {
  return (shared ??= new TipResolver(Keymap.tokens(() => sharedSettings)));
}

PlaygroundEvents.on('reset', () => Keymap.reset());
