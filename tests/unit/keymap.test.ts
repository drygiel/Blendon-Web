import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PlaygroundEvents } from '../../src/bridge/events.ts';
import { type GateReader, Keymap, switchedOn } from '../../src/bridge/keymap.ts';
import { SharedSettings } from '../../src/bridge/settings.ts';
import { KEY_END, KEY_OPEN, TipResolver } from '../../src/plugin/keys.ts';
import { D, loadWindowData } from '../../src/plugin/window-data.ts';
import { ShortcutGates } from '../../src/scene/blendon/shortcut-gates.ts';
import { UnityCommands } from '../../src/scene/engine/unity-native/commands.ts';
import { ShortcutManager, parseBinding } from '../../src/scene/unity/editor.ts';
import { newInstance, WindowModel } from '../../src/window/core/model.ts';
import { initialState, reduce, type StatePatch, type WindowState } from '../../src/window/core/state.ts';

const GRAB = 'Blendon/Move/Grab';
const CYCLE = 'Tools/Cycle Tool Modes';
const MENU = 'Scene View/Menu';
const key = (k: string) => KEY_OPEN + k + KEY_END;

/** Settings as the gates read them: every default, with some values set. */
function settings(vals: Record<string, boolean> = {}, pies: Record<string, boolean> = {}): GateReader {
  return {
    val: (k) => (k in vals ? vals[k] : D.props[k]?.d),
    pieOn: (p) => pies[p] ?? !!D.pies.find((x) => x.id === p)?.enabled,
  };
}

const row = (bid: string) => D.known[bid];

function harness(patch: Partial<WindowState> = {}) {
  let st: WindowState = { ...initialState(D.initial), hostW: 1100, winW: 1102, winH: 740, ...patch };
  const inst = newInstance();
  const update = (p: StatePatch) => {
    st = reduce(st, p);
  };
  return { model: () => new WindowModel(st, inst, update), state: () => st };
}

beforeAll(async () => {
  await loadWindowData();
});

afterEach(() => Keymap.reset());

describe('keyboard presets', () => {
  it('are read off the keys, and each moves the other side aside', () => {
    expect(Keymap.preset()).toBe('Blendon');
    expect(Keymap.binding(GRAB)).toBe('G');
    Keymap.applyPreset('Unity');
    expect(Keymap.preset()).toBe('Unity');
    expect(Keymap.binding(GRAB)).toBe('Shift+G');
    expect(Keymap.binding(CYCLE)).toBe('G');
    expect(Keymap.binding('Blendon/Context Menu')).toBe('Alt+Mouse 1');
    // One key tuned by hand doesn't flip the preset.
    Keymap.rebind('Blendon/Rotate/Grab', 'R');
    expect(Keymap.preset()).toBe('Unity');
    Keymap.applyPreset('Blendon');
    expect(Keymap.binding(GRAB)).toBe('G');
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
    expect(Keymap.isModified('Blendon/Rotate/Grab')).toBe(false);
  });

  it('set a row swapped on its own back, the lit preset too', () => {
    Keymap.applyPreset('Blendon');
    Keymap.act(row(GRAB), 'Moved');
    expect(Keymap.binding(CYCLE)).toBe('G');
    Keymap.applyPreset('Blendon');
    expect(Keymap.binding(GRAB)).toBe('G');
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
  });

  it("leave a switched-off feature's Editor command on its key", () => {
    // The preset reads the window's live switches. Unset values fall back to the defaults.
    const window = (off: string[]) => ({
      val: (k: string) => (off.includes(k) ? false : undefined),
      shortcut: (id: string) => Keymap.binding(id) ?? '',
      pieOn: (p: string) => !!D.pies.find((x) => x.id === p)?.enabled,
    });
    SharedSettings.publish(window(['MoveGizmoSettings.Enabled']));
    try {
      Keymap.applyPreset('Blendon');
    } finally {
      SharedSettings.publish(window([]));
    }
    expect(Keymap.binding(CYCLE)).toBe('G');
    expect(Keymap.binding('Tools/Scale')).toBe('Shift+R');
  });

  it('judge "modified" against the active preset', () => {
    Keymap.applyPreset('Unity');
    expect(Keymap.isModified(GRAB)).toBe(false);
    Keymap.rebind(GRAB, 'H');
    expect(Keymap.isModified(GRAB)).toBe(true);
    Keymap.restore(GRAB);
    expect(Keymap.binding(GRAB)).toBe('Shift+G');
  });

  it('notify once per batch', () => {
    let calls = 0;
    const off = Keymap.subscribe(() => calls++);
    Keymap.applyPreset('Unity');
    off();
    expect(calls).toBe(1);
  });
});

describe('contested rows', () => {
  it('move through Covered, Moved and Free from the switches and the keys', () => {
    const on = settings();
    expect(Keymap.contestState(row(GRAB), on)).toBe('Covered');
    Keymap.act(row(GRAB), 'Covered');
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
    expect(Keymap.contestState(row(GRAB), on)).toBe('Moved');
    Keymap.act(row(GRAB), 'Moved');
    expect(Keymap.binding(CYCLE)).toBe('G');
    expect(Keymap.binding(GRAB)).toBe('Shift+G');
    expect(Keymap.contestState(row(GRAB), on)).toBe('Free');
    Keymap.act(row(GRAB), 'Free');
    expect(Keymap.binding(GRAB)).toBe('G');
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
    Keymap.reset();
    expect(Keymap.contestState(row(GRAB), settings({ 'MoveGizmoSettings.Enabled': false }))).toBe('Free');
    expect(Keymap.contestState(row(GRAB), settings({ 'GeneralSettings.Enabled': false }))).toBe('Free');
    Keymap.applyPreset('Unity');
    expect(Keymap.contestState(row(GRAB), on)).toBe('Free');
  });

  it('leave Grab Scale without a key when its Editor command takes S back', () => {
    const scale = row('Blendon/Scale/Grab');
    Keymap.applyPreset('Blendon');
    Keymap.act(scale, 'Moved');
    expect(Keymap.binding(scale.bid)).toBe('');
    expect(Keymap.binding(scale.uid)).toBe('S');
  });

  it("replace where Blendon does the Editor command's job", () => {
    expect(Keymap.contestState(row('Blendon/All Tools/Vertex Snap'), settings())).toBe('Replaced');
  });

  it("hand the Editor's scene menu over while Blendon's answers the same button", () => {
    expect(Keymap.binding(MENU, settings())).toBe('');
    expect(Keymap.contestState(row('Blendon/Context Menu'), settings())).toBe('Replaced');
    expect(Keymap.binding(MENU, settings({ 'SceneMenuSettings.Enabled': false }))).toBe('Mouse 1');
    Keymap.applyPreset('Unity');
    expect(Keymap.binding(MENU, settings())).toBe('Mouse 1');
  });

  it('are listed while their feature is on, a replaced one only once moved by hand', () => {
    const on = settings();
    expect(Keymap.listed(row(GRAB), on)).toBe(true);
    Keymap.act(row(GRAB), 'Covered');
    expect(Keymap.listed(row(GRAB), on)).toBe(true);
    Keymap.applyPreset('Unity');
    expect(Keymap.listed(row(GRAB), on)).toBe(true);
    const snap = row('Blendon/All Tools/Vertex Snap');
    expect(Keymap.listed(snap, on)).toBe(false);
    Keymap.rebind(snap.uid, 'Alt+V');
    expect(Keymap.listed(snap, on)).toBe(true);
    Keymap.act(snap, 'Moved');
    expect(Keymap.binding(snap.uid)).toBe('V');
    expect(Keymap.listed(row('Blendon/Context Menu'), on)).toBe(false);
    // A key given to the Editor's menu by hand still has no button, the handover would fight it.
    Keymap.rebind(MENU, 'Alt+M');
    expect(Keymap.listed(row('Blendon/Context Menu'), on)).toBe(false);
    expect(Keymap.listed(row(GRAB), settings({ 'MoveGizmoSettings.Enabled': false }))).toBe(false);
  });

  it('go home under the Unity keys when moved where ours lands', () => {
    Keymap.giveKey(row(GRAB), 'Blendon');
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
    Keymap.applyPreset('Unity');
    expect(Keymap.binding(GRAB)).toBe('Shift+G');
    expect(Keymap.binding(CYCLE)).toBe('G');
    expect(Keymap.changedFromDefault(CYCLE)).toBe(false);
  });

  it("start moved on the page, so each row offers Reset, and the dock's reset moves them again", () => {
    Keymap.start();
    const moved = D.contested.filter((r) => Keymap.contestState(r, settings()) === 'Moved').map((r) => r.bid);
    expect(moved).toEqual([
      'Blendon/Move/Grab',
      'Blendon/Rotate/Grab',
      'Blendon/Scale/Grab',
      'Blendon/Numpad Views/Back',
      'Blendon/Numpad Views/Left',
      'Blendon/Pie Menus/View',
      'Blendon/Pie Menus/Draw Mode',
      'Blendon/Pie Menus/Tools',
    ]);
    expect(D.contested.some((r) => Keymap.contestState(r, settings()) === 'Covered')).toBe(false);
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
    // The Blendon preset is still the one in force, nothing of ours moved.
    expect(Keymap.preset()).toBe('Blendon');
    expect(Keymap.binding(GRAB)).toBe('G');
    // Once only: a row swapped back stays swapped.
    Keymap.act(row(GRAB), 'Moved');
    Keymap.start();
    expect(Keymap.binding(CYCLE)).toBe('G');
    PlaygroundEvents.emit('reset');
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
  });

  it('tell the shortcut tip what to say', () => {
    expect(Keymap.tipStory(row(GRAB))).toBe('Covered');
    Keymap.giveKey(row(GRAB), 'Blendon');
    expect(Keymap.tipStory(row(GRAB))).toBe('Moved');
    expect(Keymap.tipStory(row('Blendon/Context Menu'), settings())).toBe('Unset');
    Keymap.applyPreset('Unity');
    expect(Keymap.tipStory(row(GRAB))).toBeNull();
  });
});

describe('gates', () => {
  it('follow the feature switches and the master switch', () => {
    expect(switchedOn(GRAB, settings())).toBe(true);
    expect(switchedOn(GRAB, settings({ 'MoveGizmoSettings.Enabled': false }))).toBe(false);
    expect(switchedOn('Blendon/Orbit Selected', settings({ 'GeneralSettings.Enabled': false }))).toBe(false);
    expect(switchedOn('Blendon/Zoom/Zoom In', settings({ 'ZoomSettings.KeyboardEnabled': false }))).toBe(false);
    expect(switchedOn('Blendon/Box Select/Select Parent', settings({ 'BoxSelectSettings.HierarchyKeys': false }))).toBe(
      false,
    );
    expect(switchedOn('Blendon/Box Select/Move Box', settings({ 'BoxSelectSettings.HierarchyKeys': false }))).toBe(
      true,
    );
    const shading = D.pies.find((p) => p.sid === 'Blendon/Pie Menus/Draw Mode')!;
    expect(switchedOn(shading.sid, settings({}, { [shading.id]: false }))).toBe(false);
    expect(switchedOn('Blendon/All Tools/Vertex Snap', settings({ 'MoveGizmoSettings.Enabled': false }))).toBe(true);
    expect(switchedOn(CYCLE, settings())).toBe(false);
  });

  it("need Blendon's context always, or only while the key covers a command", () => {
    expect(Keymap.needsContext(GRAB)).toBe(true);
    expect(Keymap.needsContext('Blendon/Orbit Selected')).toBe(false);
    const shading = row('Blendon/Pie Menus/Draw Mode');
    expect(Keymap.needsContext(shading.bid)).toBe(true);
    Keymap.giveKey(shading, 'Blendon');
    expect(Keymap.needsContext(shading.bid)).toBe(false);
    Keymap.applyPreset('Unity');
    expect(Keymap.needsContext(shading.bid)).toBe(false);
  });

  it("keep a page's keys to Blendon's context while its Blendon Context Only is on", () => {
    const orbitOnly = settings({ 'OrbitSelectedSettings.ContextOnly': true });
    expect(Keymap.needsContext('Blendon/Orbit Selected', orbitOnly)).toBe(true);
    expect(Keymap.needsContext('Blendon/Orbit Selected/Quick Roll', orbitOnly)).toBe(true);
    expect(Keymap.needsContext('Blendon/Pan', orbitOnly)).toBe(false);
    // Toggle Wireframe follows the pies, the hierarchy keys a row of their own.
    const piesOnly = settings({ 'PieMenuSettings.ContextOnly': true });
    expect(Keymap.needsContext('Blendon/Pie Menus/Toggle Wireframe', piesOnly)).toBe(true);
    const hierarchyOnly = settings({ 'BoxSelectSettings.HierarchyContextOnly': true });
    expect(Keymap.needsContext('Blendon/Box Select/Select Parent', hierarchyOnly)).toBe(true);
    // Off the Editor's key the Draw Mode pie answers everywhere, unless its page keeps it to the context.
    const shading = row('Blendon/Pie Menus/Draw Mode');
    Keymap.giveKey(shading, 'Blendon');
    expect(Keymap.needsContext(shading.bid)).toBe(false);
    expect(Keymap.needsContext(shading.bid, piesOnly)).toBe(true);
  });
});

describe('live cards', () => {
  it('spell a key as bound now', () => {
    const src = D.shortcuts[GRAB].src!;
    const tips = new TipResolver(Keymap.tokens(() => ({ ...settings(), version: 0 })));
    expect(tips.resolve(src)).toContain(key('G'));
    Keymap.applyPreset('Unity');
    expect(tips.resolve(src)).toContain(key('Shift+G'));
    // Vertex snap keeps V on both presets.
    expect(tips.resolve(D.shortcuts['Blendon/All Tools/Vertex Snap'].src!)).toContain(key('V'));
  });

  it("follow the Editor's command in a moved row's card", () => {
    const card = row(GRAB).cards.Moved.src!;
    const tips = new TipResolver(Keymap.tokens(() => ({ ...settings(), version: 0 })));
    Keymap.giveKey(row(GRAB), 'Blendon');
    expect(tips.resolve(card)).toContain(key('Shift+G'));
  });
});

describe('the Scene view', () => {
  let vals: Record<string, boolean> = {};
  const combo = (k: string) => parseBinding(k)!;
  const answers = (k: string) => {
    const c = combo(k);
    return ShortcutManager.find(c.keyCode, c.modifiers)?.id ?? null;
  };

  beforeAll(() => {
    SharedSettings.publish({
      val: (k) => (k in vals ? vals[k] : D.props[k]?.d),
      shortcut: (id) => Keymap.binding(id) ?? '',
      pieOn: () => true,
    });
    // As installBlendon wires them.
    ShortcutManager.profile = (id) => Keymap.binding(id, ShortcutGates.reader);
    ShortcutManager.gate = (id) => ShortcutGates.isOpen(id);
    Keymap.subscribe(() => ShortcutManager.invalidate());
    UnityCommands.install();
    ShortcutManager.register(GRAB, () => {}, false, 'G');
  });

  const set = (next: Record<string, boolean>) => {
    vals = next;
    ShortcutManager.invalidate();
  };

  it("hears Blendon's key while its feature is on, the Editor's command once it is off", () => {
    set({});
    expect(answers('G')).toBe(GRAB);
    set({ 'MoveGizmoSettings.Enabled': false });
    expect(answers('G')).toBe(CYCLE);
    set({});
  });

  it('runs a moved command on its new key, and the swap back trades the two keys', () => {
    expect(answers('Shift+G')).toBeNull();
    Keymap.act(row(GRAB), 'Covered');
    expect(answers('Shift+G')).toBe(CYCLE);
    expect(answers('G')).toBe(GRAB);
    Keymap.act(row(GRAB), 'Moved');
    expect(answers('Shift+G')).toBe(GRAB);
    expect(answers('G')).toBe(CYCLE);
  });

  it("doesn't move the Editor's command on its own", () => {
    Keymap.applyPreset('Unity');
    expect(answers('Shift+G')).toBe(GRAB);
    expect(answers('G')).toBe(CYCLE);
    expect(answers('R')).toBe('Tools/Scale');
  });
});

describe('the window', () => {
  it('notes the covered command, and where it is covered', () => {
    const m = harness().model();
    expect(m.nativeNote(GRAB)?.lead).toBe(`Covers the Editor's "Cycle Tool Modes" in Blendon's context. Open in`);
    expect(m.nativeNote(GRAB)?.hint).toBe(`"Cycle Tool Modes" is on G. Open it in Unity's Shortcuts window`);
    expect(m.nativeNote('Blendon/Orbit Selected')?.lead).toBe(
      `Replaces the Editor's "Scene View Pan" in the Scene View. Open in`,
    );
    expect(m.nativeNote('Blendon/Numpad Views/Back')?.lead).toContain(
      'Covers the Editor\'s "Decal: Stretch UV" in the Scene View',
    );
    Keymap.applyPreset('Unity');
    expect(harness().model().nativeNote(GRAB)).toBeNull();
  });

  it('marks a value as changed by what is stored, not what a follower reads', () => {
    const h = harness();
    h.model().set('GeneralSettings.AnimationEnabled', false);
    expect(h.model().isDefault('OrbitSelectedSettings.AnimationEnabled')).toBe(true);
    h.model().set('OrbitSelectedSettings.AnimationEnabled', true);
    expect(h.model().isDefault('OrbitSelectedSettings.AnimationEnabled')).toBe(true);
    h.model().set('OrbitSelectedSettings.AnimationEnabled', false);
    expect(h.model().isDefault('OrbitSelectedSettings.AnimationEnabled')).toBe(false);
  });

  it('keeps the preset and the moved commands through Reset All Pages', () => {
    Keymap.applyPreset('Unity');
    Keymap.rebind(row('Blendon/Numpad Views/Back').uid, 'Ctrl+Num 5');
    Keymap.rebind(GRAB, 'H');
    harness().model().resetAll();
    expect(Keymap.binding(GRAB)).toBe('Shift+G');
    expect(Keymap.preset()).toBe('Unity');
    expect(Keymap.binding(row('Blendon/Numpad Views/Back').uid)).toBe('Ctrl+Num 5');
  });
});
