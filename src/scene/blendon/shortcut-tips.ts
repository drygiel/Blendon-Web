// ShortcutTips: the first press of a Blendon key that covers an Editor command in the Scene view, or whose
// command the user moved, raises a card naming both. Once per key per visit, armed again when either key changes.
// Only the curated pairs (D.known) are told here: the browser has no Editor shortcut registry to scan for clashes.
import { PlaygroundEvents } from '../../bridge/events.ts';
import { Keymap } from '../../bridge/keymap.ts';
import { D } from '../../plugin/window-data.ts';
import { ShortcutManager } from '../unity/editor.ts';
import { GUIUtility } from '../unity/imgui.ts';
import { ShortcutTips as Hook } from './foundation.ts';
import { GizmoRegistry } from './gizmos/viewport-gesture.ts';
import { ViewNavigationState } from './navigation/state.ts';
import { PieMenu } from './piemenus/pie-menu.ts';
import { GeneralSettings } from './settings.ts';
import { ShortcutGates } from './shortcut-gates.ts';
import { SceneTutorial } from './tutorial/scene-tutorial.ts';

export interface TipSide {
  id: string;
  label: string;
  binding: string;
  blendon: boolean;
  /** Where the key is heard. */
  context: string;
}

export interface TipCard {
  /** Covered: Blendon answers the Editor's key here. Moved: the user gave the Editor's command another key. */
  story: 'Covered' | 'Moved';
  /** A covering key that answers only in Blendon's tool context. */
  contextual: boolean;
  ours: TipSide;
  theirs: TipSide;
}

const SlideIn = 0.22;
const SlideOut = 0.18;
const Linger = 10;
const HoverGrace = 2.5;

// The Editor commands Blendon's curated keys push aside, and the context each is heard in.
const UnityContexts: Record<string, string> = {
  'Show Overlay Menu': 'Scene View',
  'Toggle Pivot Position': 'Scene View',
  'Decal: Stretch UV': 'Decal Projector',
  'Decal: Pivot & UVs': 'Decal Projector',
};

const seen = new Set<string>();
const listeners = new Set<() => void>();
let card: TipCard | null = null;
let waiting: string | null = null;
let shownAt = 0;
let expiresAt = 0;
let closingAt = 0;
let hovered = false;
let version = 0;
let pumping = false;

const now = () => performance.now() / 1000;
const bindingOf = (id: string) => Keymap.binding(id, ShortcutGates.reader) ?? '';
// Both bindings are part of the key, so a rebind, a Move or a Reset arms the card again.
const seenKey = (id: string) => `${id}|${bindingOf(id)}|${bindingOf(D.known[id]?.uid ?? '')}`;

/** A drag or an open pie owns the viewport: a card neither appears nor retires under it. */
const held = () =>
  GizmoRegistry.anyManipulation() || PieMenu.isOpen || GUIUtility.hotControl !== 0 || ShortcutManager.dragActive();

function changed() {
  version++;
  for (const l of listeners) l();
}

/** From the live keys: the Editor's command still on Blendon's key (covered) or moved by the user. */
function resolve(id: string): TipCard | null {
  const row = D.known[id];
  if (!row) return null;
  const story = Keymap.tipStory(row, ShortcutGates.reader);
  // Unset: the command has no key at all (the menu Blendon's took over), nothing to teach.
  if (story !== 'Covered' && story !== 'Moved') return null;
  return {
    story,
    contextual: story === 'Covered' && ShortcutGates.needsContext(id),
    ours: { id, label: row.bl, binding: bindingOf(id), blendon: true, context: 'Scene View' },
    theirs: {
      id: row.uid,
      label: row.ul,
      binding: bindingOf(row.uid),
      blendon: false,
      context: UnityContexts[row.ul] ?? 'Global',
    },
  };
}

function note(id: string) {
  if (waiting || card) return;
  // The tutorial owns the corner and is itself teaching this key.
  if (SceneTutorial.isShowing) return;
  if (!GeneralSettings.ShowShortcutTips || seen.has(seenKey(id))) return;
  if (!resolve(id)) return;
  waiting = id;
  pump();
}

// One clock for the whole life of a card: waiting for the view to settle, sliding, lingering, leaving.
function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    if (!tick()) {
      pumping = false;
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function tick(): boolean {
  const t = now();
  if (waiting) {
    if (ViewNavigationState.inProgress || held()) return true;
    const id = waiting;
    waiting = null;
    const c = SceneTutorial.isShowing ? null : resolve(id);
    if (!c) return false;
    // Spent when shown: a card never drawn has taught nobody anything.
    seen.add(seenKey(id));
    card = c;
    shownAt = t;
    expiresAt = t + Linger;
    closingAt = 0;
    changed();
    return true;
  }
  if (!card) return false;
  if (held() || hovered) expiresAt = Math.max(expiresAt, t + HoverGrace);
  else if (t >= expiresAt && closingAt === 0) closingAt = t;
  if (closingAt > 0 && t - closingAt >= SlideOut) {
    card = null;
    closingAt = 0;
    changed();
    return false;
  }
  changed();
  return true;
}

const ease = (t: number) => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3;

export const ShortcutTipCard = {
  get card() {
    return card;
  },

  get version() {
    return version;
  },

  /** 0 fully off the right edge, 1 docked; sliding out is sliding in run backwards. */
  get progress() {
    const t = now();
    return closingAt > 0 ? 1 - ease((t - closingAt) / SlideOut) : ease((t - shownAt) / SlideIn);
  },

  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  setHovered(h: boolean) {
    hovered = h;
  },

  dismiss() {
    if (!card || closingAt > 0) return;
    closingAt = now();
    pump();
  },

  /** The window's "bring back dismissed tips". */
  resetAll() {
    seen.clear();
  },

  install() {
    Hook.onNote = note;
    PlaygroundEvents.on('tipsReset', () => ShortcutTipCard.resetAll());
    PlaygroundEvents.on('reset', () => {
      seen.clear();
      waiting = null;
      card = null;
      changed();
    });
  },
};
