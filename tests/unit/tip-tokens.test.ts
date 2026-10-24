import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fillTokens,
  KEY_END,
  KEY_OPEN,
  NO_KEY,
  presetSource,
  TipResolver,
  type SettingValue,
  type TokenSource,
} from '../../src/plugin/keys.ts';
import type { KeyboardPreset, Keys, PropInfo } from '../../src/plugin/schema.ts';

// ---- entries copied from the plugin's tooltip files (Editor/Content/Tips/*.md, remediation/2026-10) ----

// NumpadViews.md
const VIEW_FRONT = `## shortcut:Blendon/Numpad Views/Front
image: Tips/NumpadViews/AxisViews.png

### Front View
Look straight at the front of the scene.

#### KEY
{key:Blendon/Numpad Views/Front}

> The same poses as clicking the Orientation Gizmo's handles
`;

// The same entry as the dump's `source`: TipMarkup's rich text, the token left for display time.
const VIEW_FRONT_SOURCE =
  "<size=14><b>Front View</b></size>\nLook straight at the front of the scene.\n\n<size=9><b><color=#92929A>KEY</color></b></size>\n{key:Blendon/Numpad Views/Front}\n\n<size=9><color=#92929A>The same poses as clicking the Orientation Gizmo's handles</color></size>";

// AllTools.md
const ALL_TOOLS_SWITCH = `## switch:SharedGizmoSettings
image: Tips/AllTools/AllTools.png

### All Tools
Turns Blendon's four transform gizmos on or off in one click.

#### TOOLS
- [Move]  {key:Tools/Move}
- [Rotate]  {key:Tools/Rotate}
- [Scale]  {key:Tools/Scale}
- [Transform]  {key:Tools/Transform}

> On only while all four are on. A tool switched off falls back to Unity's own gizmo
`;

// AllTools.md
const VERTEX_SNAP = `## shortcut:Blendon/All Tools/Vertex Snap
image: Tips/AllTools/VertexSnapping.png

### Vertex Snapping
Place an object exactly on another object's vertex.

#### HOW
**1**  Hold {key:Blendon/All Tools/Vertex Snap} - the gizmo jumps to the vertex nearest the cursor.
**2**  Drag onto another object - that vertex lands on its nearest vertex.
**3**  Release the mouse to drop.

> Replaces Unity's own vertex snapping in the Scene View. The Unity keyboard preset on the Overview page gives Unity's back its key
`;

// AllTools.md
const PRECISION = `## SharedGizmoSettings.PrecisionModeEnabled
image: Tips/AllTools/PrecisionMode.png

### Precision Mode
Slow a drag right down for fine adjustments.

#### HOW
Hold {setting:SharedGizmoSettings.PrecisionModifier} while dragging any handle. The selection moves at a fraction of the cursor's speed, and the {mod:Ctrl} snap step halves.

> The key and the speed are set in the two rows below. Shared by every gizmo
`;

// App/SettingsWindow/Overview/OverviewTips.cs HistoryText, built from Tip.KeyRef in code.
const HISTORY =
  '<size=14><b>Navigation History</b></size>\nStep back and forward like a browser: through what you selected, and through camera views.\n\n<size=9><b><color=#92929A>BUTTONS</color></b></size>\n{key:Blendon/Navigation History/Selection Back} / {key:Blendon/Navigation History/Selection Forward} - selections\n{key:Blendon/Navigation History/View Back} / {key:Blendon/Navigation History/View Forward} - views';

/** An entry's body as TipStore keeps it: everything after the key line and its field lines. */
function body(entry: string): string {
  const lines = entry.split('\n').slice(1);
  while (lines[0] !== undefined && /^(image|video|shortcut):/.test(lines[0])) lines.shift();
  return lines.join('\n');
}

const key = (k: string) => KEY_OPEN + k + KEY_END;

const KEYMAP: Record<string, Keys> = {
  'Blendon/Numpad Views/Front': { b: 'Num 1', u: 'Num 1' },
  'Blendon/All Tools/Vertex Snap': { b: 'V', u: 'Alt+V' },
  'Tools/Move': { b: 'W', u: 'W' },
  'Tools/Rotate': { b: 'E', u: 'E' },
  'Tools/Scale': { b: 'R', u: 'R' },
  'Tools/Transform': { b: 'Y', u: 'Y' },
  'Blendon/Navigation History/Selection Back': { b: 'Mouse 3', u: 'Mouse 3' },
  'Blendon/Navigation History/Selection Forward': { b: 'Mouse 4', u: 'Mouse 4' },
  'Blendon/Navigation History/View Back': { b: 'Shift+Mouse 3', u: 'Shift+Mouse 3' },
  'Blendon/Navigation History/View Forward': { b: '', u: '' },
};

const MODIFIER_OPTIONS: [string, string][] = [
  ['None', 'None'],
  ['Shift', 'Shift'],
  ['Action', 'Ctrl'],
  ['Alt', 'Alt'],
];

const PROPS: Record<string, PropInfo> = {
  'SharedGizmoSettings.PrecisionModifier': {
    l: 'Precision Key',
    t: '',
    i: '',
    d: 'Shift',
    k: 'ModifierKey',
    o: MODIFIER_OPTIONS,
  },
  'SharedGizmoSettings.PrecisionModeEnabled': { l: 'Precision Mode', t: '', i: '', d: true, k: 'Boolean' },
};

/** A live source over the fixtures: a preset, rebinds on top, settings as set, versions bumped by hand. */
function live(preset: KeyboardPreset = 'Blendon') {
  const rebinds: Record<string, string> = {};
  const values: Record<string, string | boolean> = {};
  const source = {
    keysVersion: 0,
    settingsVersion: 0,
    binding: (id: string) => rebinds[id] ?? (preset === 'Unity' ? KEYMAP[id]?.u : KEYMAP[id]?.b),
    setting: (path: string): SettingValue | undefined => {
      const p = PROPS[path];
      return p && { k: p.k, v: values[path] ?? p.d, o: p.o };
    },
  } satisfies TokenSource;
  return {
    source,
    rebind(id: string, binding: string) {
      rebinds[id] = binding;
      source.keysVersion++;
    },
    set(path: string, v: string | boolean) {
      values[path] = v;
      source.settingsVersion++;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('tooltip tokens', () => {
  it('spells a shortcut by its key on the Blendon preset', () => {
    const r = new TipResolver(live().source);
    expect(r.resolve(body(VIEW_FRONT))).toContain('#### KEY\n' + key('Num 1') + '\n');
    expect(r.resolve(VIEW_FRONT_SOURCE)).toBe(
      VIEW_FRONT_SOURCE.replace('{key:Blendon/Numpad Views/Front}', key('Num 1')),
    );
  });

  it('follows the Unity preset where it moves the key', () => {
    const blendon = new TipResolver(live('Blendon').source).resolve(body(VERTEX_SNAP));
    const unity = new TipResolver(live('Unity').source).resolve(body(VERTEX_SNAP));
    expect(blendon).toContain('Hold ' + key('V') + ' - the gizmo');
    expect(unity).toContain('Hold ' + key('Alt+V') + ' - the gizmo');
  });

  it("names the Editor's own commands", () => {
    const text = new TipResolver(live().source).resolve(body(ALL_TOOLS_SWITCH));
    expect(text).toContain('- [Move]  ' + key('W') + '\n- [Rotate]  ' + key('E'));
    expect(text).not.toContain('{key:');
  });

  it('reads a rebind at once and caches until the keys move', () => {
    const l = live();
    const r = new TipResolver(l.source);
    const before = r.version;
    expect(r.resolve(VIEW_FRONT_SOURCE)).toContain(key('Num 1'));
    expect(r.version).toBe(before);
    l.rebind('Blendon/Numpad Views/Front', 'Ctrl+F');
    expect(r.resolve(VIEW_FRONT_SOURCE)).toContain(key('Ctrl+F'));
    expect(r.version).toBe(before + 1);
  });

  it('spells a missing binding as no key', () => {
    const text = new TipResolver(live().source).resolve(HISTORY);
    expect(text).toContain(key('Mouse 3') + ' / ' + key('Mouse 4') + ' - selections\n');
    expect(text).toContain(key('Shift+Mouse 3') + ' / ' + NO_KEY + ' - views');
  });

  it('leaves an unknown token in sight and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = new TipResolver(live().source);
    const text = 'Press {key:Blendon/Gone} or {setting:Nope.Prop} or {setting:NoDot}.';
    expect(r.resolve(text)).toBe(text);
    fillTokens(text, live().source);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      'Blendon: tooltip names {key:Blendon/Gone}, which does not exist.',
      'Blendon: tooltip names {setting:Nope.Prop}, which does not exist.',
      'Blendon: tooltip names {setting:NoDot}, which does not exist.',
    ]);
  });

  it('spells a modifier setting by its display name', () => {
    const l = live();
    const r = new TipResolver(l.source);
    const text = body(PRECISION);
    expect(r.resolve(text)).toContain('Hold ' + key('Shift') + ' while dragging');
    // {mod:Ctrl} is TipMarkup's, spelled when the file loads; the resolver leaves it.
    expect(r.resolve(text)).toContain('the {mod:Ctrl} snap step');
    l.set('SharedGizmoSettings.PrecisionModifier', 'Action');
    expect(r.resolve(text)).toContain('Hold ' + key('Ctrl') + ' while dragging');
    l.set('SharedGizmoSettings.PrecisionModifier', 'None');
    expect(r.resolve(text)).toContain('Hold ' + NO_KEY + ' while dragging');
  });

  it('keeps texts cached through setting changes when none of them reads a setting', () => {
    const l = live();
    const r = new TipResolver(l.source);
    r.resolve(VIEW_FRONT_SOURCE);
    const v = r.version;
    l.set('SharedGizmoSettings.PrecisionModeEnabled', false);
    expect(r.version).toBe(v);
    r.resolve(body(PRECISION));
    l.set('SharedGizmoSettings.PrecisionModeEnabled', true);
    expect(r.version).toBe(v + 1);
  });

  it('leaves other braces alone', () => {
    const r = new TipResolver(live().source);
    expect(r.resolve('"{0}" profile {mod:Alt} {unclosed')).toBe('"{0}" profile {mod:Alt} {unclosed');
    expect(r.resolve('{a {key:Blendon/All Tools/Vertex Snap}}')).toBe('{a {key:Blendon/All Tools/Vertex Snap}}');
  });

  it('shows a card from its source, or its text when it has no tokens', () => {
    const r = new TipResolver(live('Unity').source);
    expect(r.tip({ t: 'Hold V', i: 'x.png', src: 'Hold {key:Blendon/All Tools/Vertex Snap}' })).toEqual({
      t: 'Hold ' + key('Alt+V'),
      i: 'x.png',
    });
    expect(r.tip({ t: 'Plain', i: '' })).toEqual({ t: 'Plain', i: '' });
  });

  it('reads a fixed preset with every setting at its default', () => {
    const data = { keymap: KEYMAP, props: PROPS };
    expect(fillTokens(body(VERTEX_SNAP), presetSource(data, 'Unity')).text).toContain(key('Alt+V'));
    const r = fillTokens(body(PRECISION), presetSource(data, 'Blendon'));
    expect(r.text).toContain('Hold ' + key('Shift'));
    expect(r.readsSettings).toBe(true);
  });
});
