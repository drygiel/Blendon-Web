import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type GateReader, Keymap, switchedOn } from '../../src/bridge/keymap.ts';
import { SharedSettings } from '../../src/bridge/settings.ts';
import { KEY_END, KEY_OPEN, TipResolver } from '../../src/plugin/keys.ts';
import { D, loadWindowData } from '../../src/plugin/window-data.ts';
import { ShortcutGates } from '../../src/scene/blendon/shortcut-gates.ts';
import { UnityCommands } from '../../src/scene/engine/unity-native/commands.ts';
import { ShortcutManager, parseBinding } from '../../src/scene/unity/editor.ts';
import { newInstance, WindowModel } from '../../src/window/core/model.ts';
import { initialState, reduce, type StatePatch, type WindowState } from '../../src/window/core/state.ts';

const GRAB = 'Blendon/Grab';
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
  it('are read off the keys, with nothing written for Blendon', () => {
    expect(Keymap.preset()).toBe('Blendon');
    expect(Keymap.binding(GRAB)).toBe('G');
    Keymap.applyPreset('Unity');
    expect(Keymap.preset()).toBe('Unity');
    expect(Keymap.binding(GRAB)).toBe('Shift+G');
    expect(Keymap.binding('Blendon/Context Menu')).toBe('Alt+Mouse 1');
    // One key tuned by hand doesn't flip the preset.
    Keymap.rebind('Blendon/Grab Rotate', 'R');
    expect(Keymap.preset()).toBe('Unity');
    Keymap.applyPreset('Blendon');
    expect(Keymap.binding(GRAB)).toBe('G');
    expect(Keymap.isModified('Blendon/Grab Rotate')).toBe(false);
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
    Keymap.move(row(GRAB));
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
    expect(Keymap.contestState(row(GRAB), on)).toBe('Moved');
    Keymap.giveBack(row(GRAB));
    expect(Keymap.binding(CYCLE)).toBe('G');
    expect(Keymap.contestState(row(GRAB), settings({ 'MoveGizmoSettings.Enabled': false }))).toBe('Free');
    expect(Keymap.contestState(row(GRAB), settings({ 'GeneralSettings.Enabled': false }))).toBe('Free');
    Keymap.applyPreset('Unity');
    expect(Keymap.contestState(row(GRAB), on)).toBe('Free');
  });

  it("replace where Blendon does the Editor command's job", () => {
    expect(Keymap.contestState(row('Blendon/Vertex Snap'), settings())).toBe('Replaced');
  });

  it("hand the Editor's scene menu over while Blendon's answers the same button", () => {
    expect(Keymap.binding(MENU, settings())).toBe('');
    expect(Keymap.contestState(row('Blendon/Context Menu'), settings())).toBe('Replaced');
    expect(Keymap.binding(MENU, settings({ 'SceneMenuSettings.Enabled': false }))).toBe('Mouse 1');
    Keymap.applyPreset('Unity');
    expect(Keymap.binding(MENU, settings())).toBe('Mouse 1');
  });

  it('are listed only with a button to press', () => {
    const on = settings();
    expect(Keymap.listed(row(GRAB), on)).toBe(true);
    Keymap.move(row(GRAB));
    expect(Keymap.listed(row(GRAB), on)).toBe(true);
    expect(Keymap.listed(row('Blendon/Vertex Snap'), on)).toBe(false);
    expect(Keymap.listed(row('Blendon/Context Menu'), on)).toBe(false);
    // A key given to the Editor's menu by hand still has no button, the handover would fight it.
    Keymap.rebind(MENU, 'Alt+M');
    expect(Keymap.listed(row('Blendon/Context Menu'), on)).toBe(false);
    expect(Keymap.listed(row(GRAB), settings({ 'MoveGizmoSettings.Enabled': false }))).toBe(false);
  });

  it('go home under the Unity keys when moved where ours lands', () => {
    Keymap.move(row(GRAB));
    expect(Keymap.binding(CYCLE)).toBe('Shift+G');
    Keymap.applyPreset('Unity');
    expect(Keymap.binding(GRAB)).toBe('Shift+G');
    expect(Keymap.binding(CYCLE)).toBe('G');
    expect(Keymap.changedFromDefault(CYCLE)).toBe(false);
  });

  it('tell the shortcut tip what to say', () => {
    expect(Keymap.tipStory(row(GRAB))).toBe('Covered');
    Keymap.move(row(GRAB));
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
    expect(switchedOn('Blendon/Select Parent', settings({ 'BoxSelectSettings.HierarchyKeys': false }))).toBe(false);
    expect(switchedOn('Blendon/Box Select Move Box', settings({ 'BoxSelectSettings.HierarchyKeys': false }))).toBe(
      true,
    );
    const shading = D.pies.find((p) => p.sid === 'Blendon/Pie Menus/Shading')!;
    expect(switchedOn(shading.sid, settings({}, { [shading.id]: false }))).toBe(false);
    expect(switchedOn('Blendon/Vertex Snap', settings({ 'MoveGizmoSettings.Enabled': false }))).toBe(true);
    expect(switchedOn(CYCLE, settings())).toBe(false);
  });

  it("need Blendon's context always, or only while the key covers a command", () => {
    expect(Keymap.needsContext(GRAB)).toBe(true);
    expect(Keymap.needsContext('Blendon/Orbit Selected')).toBe(false);
    const shading = row('Blendon/Pie Menus/Shading');
    expect(Keymap.needsContext(shading.bid)).toBe(true);
    Keymap.move(shading);
    expect(Keymap.needsContext(shading.bid)).toBe(false);
    Keymap.giveBack(shading);
    Keymap.applyPreset('Unity');
    expect(Keymap.needsContext(shading.bid)).toBe(false);
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
    expect(tips.resolve(D.shortcuts['Blendon/Vertex Snap'].src!)).toContain(key('V'));
  });

  it("follow the Editor's command in a moved row's card", () => {
    const card = row(GRAB).cards.Moved.src!;
    const tips = new TipResolver(Keymap.tokens(() => ({ ...settings(), version: 0 })));
    Keymap.move(row(GRAB));
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

  it('runs a moved command on its new key and gives it back on Reset', () => {
    expect(answers('Shift+G')).toBeNull();
    Keymap.move(row(GRAB));
    expect(answers('Shift+G')).toBe(CYCLE);
    expect(answers('G')).toBe(GRAB);
    Keymap.giveBack(row(GRAB));
    expect(answers('Shift+G')).toBeNull();
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
    expect(m.nativeNote('Blendon/Viewport Nav/View Back')?.lead).toContain(
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
    Keymap.move(row('Blendon/Viewport Nav/View Back'));
    Keymap.rebind(GRAB, 'H');
    harness().model().resetAll();
    expect(Keymap.binding(GRAB)).toBe('Shift+G');
    expect(Keymap.preset()).toBe('Unity');
    expect(Keymap.binding(row('Blendon/Viewport Nav/View Back').uid)).toBe('Ctrl+Num 5');
  });
});
