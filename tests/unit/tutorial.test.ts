import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Keymap } from '../../src/bridge/keymap.ts';
import { SharedSettings } from '../../src/bridge/settings.ts';
import { KEY_OPEN } from '../../src/plugin/keys.ts';
import { TUTORIAL, TUTORIAL_TASKS } from '../../src/plugin/tutorial.ts';
import { loadWindowData, D } from '../../src/plugin/window-data.ts';
import { SceneTutorial as Reports, TransformTraits as T } from '../../src/scene/blendon/foundation.ts';
import {
  findTask,
  gateOf,
  Then,
  TutorialCurriculum,
  TutorialTasks,
  unusedRules,
} from '../../src/scene/blendon/tutorial/curriculum.ts';
import { TutorialProgress } from '../../src/scene/blendon/tutorial/progress.ts';
import { SceneTutorial } from '../../src/scene/blendon/tutorial/scene-tutorial.ts';
import { Prefs, Selection } from '../../src/scene/unity/editor.ts';
import { GameObject, Scene } from '../../src/scene/unity/scene.ts';
import { layoutWindow } from '../../src/window/core/layout.ts';
import { newInstance, WindowModel } from '../../src/window/core/model.ts';
import { initialState, reduce, type StatePatch, type WindowState } from '../../src/window/core/state.ts';

const scene = new Scene();
const cube = new GameObject(scene, 'Cube');

const ids = () => TutorialTasks.filter((t) => TutorialProgress.isDone(t.id)).map((t) => t.id);
const task = (id: string) => findTask(id)!;
const data = (id: string) => TUTORIAL_TASKS.find((t) => t.id === id)!;

// What the settings window would publish: its values and the pies switched off in it.
const piesOff = new Set<string>();
const set = (key: string, v: boolean | string) => Prefs.local.set(key, v);
const pieId = (shortcutId: string) => D.pies.find((p) => p.sid === shortcutId)!.id;

beforeAll(async () => {
  await loadWindowData();
  // The shipped defaults, as the Scene view reads them before the window has loaded.
  Prefs.source = {
    val: (key) => (key in D.initial ? D.initial[key] : D.props[key]?.d),
    shortcut: (id) => D.shortcuts[id]?.d,
  };
  SharedSettings.publish({
    val: (key) => Prefs.get(key, D.props[key]?.d ?? false),
    shortcut: (id) => Keymap.binding(id) ?? '',
    pieOn: (id) => !piesOff.has(id),
  });
  SceneTutorial.install();
});

beforeEach(() => {
  TutorialProgress.reset();
  Selection.set([], null, false);
  Prefs.local.clear();
  piesOff.clear();
  Keymap.reset();
});

describe('tutorial curriculum', () => {
  it('has a task for every one the plugin teaches, and no ported code left over', () => {
    expect(TutorialCurriculum).toHaveLength(TUTORIAL.chapters.length);
    expect(TutorialTasks).toHaveLength(TUTORIAL.chapters.reduce((n, c) => n + c.tasks.length, 0));
    expect(unusedRules()).toEqual([]);
  });

  it('ports every rule the plugin works out in code, and only those', () => {
    for (const t of TUTORIAL_TASKS) {
      expect({ id: t.id, ...task(t.id).ported() }).toEqual({
        id: t.id,
        keys: !!t.pressing,
        needs: !!t.needs,
        available: !!t.availableWhen,
      });
      for (const way of t.otherwise ?? []) expect(gateOf(way.gate), `${t.id}: gate ${way.gate}`).not.toBeNull();
      for (const trait of t.traits ?? []) expect(Object.keys(T), `${t.id}: trait ${trait}`).toContain(trait);
    }
  });

  it("names the plugin's pages, keys and settings", () => {
    const pages = new Set(D.catalog.map((p) => p.id));
    for (const t of TUTORIAL_TASKS) {
      expect(task(t.id).page).toBe(t.page);
      expect(pages, t.id).toContain(t.page);
      if (t.keysPage) expect(pages, t.id).toContain(t.keysPage);
      if (t.keysSetting) expect(D.props, t.id).toHaveProperty([t.keysSetting]);
      for (const id of [...(t.ids ?? []), t.keysShortcut ?? '', ...(t.otherwise ?? []).map((w) => w.keys)])
        if (id) expect(D.keymap, `${t.id}: ${id}`).toHaveProperty([id]);
      // A shortcut task's first key is a row of its own page.
      if (t.kind === 'shortcut') expect(D.pageShortcuts[t.page], t.id).toContain(t.ids?.[0]);
      // After names tasks before it, so theirs is settled first.
      const at = TUTORIAL_TASKS.indexOf(t);
      for (const e of t.after ?? [])
        expect(
          TUTORIAL_TASKS.findIndex((x) => x.id === e),
          t.id,
        ).toBeLessThan(at);
    }
  });

  it('plays a clip over every picture: the feature clip, or the one named after the picture', () => {
    for (const t of TUTORIAL_TASKS) {
      expect(t.clip, t.id).not.toBe('');
      expect(existsSync(resolve(import.meta.dirname, '../../public', t.clip)), t.clip).toBe(true);
      if (t.clip.startsWith('plugin/video/tutorial/'))
        expect(basename(t.clip, '.mp4'), t.id).toBe(basename(t.picture, '.webp').split('_').at(-1));
    }
  });

  it('draws key sequences from the live bindings', () => {
    const exact = TutorialTasks.find((t) => t.id === 'grab.exact')!;
    expect(exact.keys()).toBe('G > Y > 2 > Enter');
    expect(TutorialTasks.find((t) => t.id === 'scene.add-plane')!.keys()).toBe('Mouse 1');
  });

  it('cancels a grab on Esc once the right mouse button no longer does', () => {
    const grab = D.shortcuts['Blendon/Grab'].d;
    expect(task('grab.cancel').keys()).toBe(grab + Then + 'Mouse 1');
    set('GeneralSettings.RmbCancelEnabled', false);
    expect(task('grab.cancel').keys()).toBe(grab + Then + 'Esc');
  });

  it('skips what the browser demo cannot do', () => {
    expect(TutorialTasks.find((t) => t.id === 'nav.camera')!.isSkipped()).toBe(true);
    expect(task('nav.camera').skippedBy()).toBe('demo');
    expect(TutorialTasks.find((t) => t.id === 'nav.orbit')!.isSkipped()).toBe(false);
  });
});

describe('tutorial hints', () => {
  it('reach the landing with every key spelled out', () => {
    for (const t of TUTORIAL_TASKS) {
      expect(t.hint, t.id).not.toMatch(/\{(key|setting):/);
      if (t.hintSrc) expect(t.hintSrc, t.id).toMatch(/\{(key|setting):/);
    }
  });

  it('fill their keys from the live keymap, for the preset the window is on', () => {
    const menu = D.keymap['Blendon/Context Menu'];
    expect(data('scene.add-plane').hintSrc).toContain('{key:Blendon/Context Menu}');
    expect(task('scene.add-plane').hint).toContain(KEY_OPEN + menu.b);
    Keymap.applyPreset('Unity');
    expect(task('scene.add-plane').hint).toContain(KEY_OPEN + menu.u);
  });
});

describe('tutorial rules', () => {
  it('takes the other way while its own is off, with that way keys, hint and picture', () => {
    const t = task('handles.move-tool');
    const way = data('handles.move-tool').otherwise![0];
    expect(t.keys()).toBe(D.shortcuts[t.keysShortcutId].d);
    piesOff.add(pieId(t.keysShortcutId));
    expect(t.isSkipped()).toBe(false);
    expect(t.keys()).toBe(D.keymap[way.keys].b);
    expect(t.hintSource).toBe(way.text);
    expect(t.picture).toBe(way.picture);
    expect(t.clip).toBe('');
  });

  it('tries the ways in order and skips the task when none is open', () => {
    const t = task('scene.add-plane');
    const own = data('scene.add-plane');
    set('SceneMenuSettings.AddObject', false);
    expect(t.hintSource).toBe(own.otherwise![0].text);
    expect(t.keys()).toBe(D.shortcuts['Blendon/Pie Menus/Add Object'].d);
    piesOff.add(pieId('Blendon/Pie Menus/Add Object'));
    expect(t.skippedBy()).toBe('switch');
    expect(t.switchText).toBe(own.availableWhen!.reason);
  });

  it('skips a task once every task it builds on is skipped and none is done', () => {
    set('SceneMenuSettings.Grouping', false);
    expect(task('select.group').skippedBy()).toBe('switch');
    // The pivot kept in the chapter before is still a parent to walk.
    expect(task('select.parent').isSkipped()).toBe(false);
    set('RotateGizmoSettings.Enabled', false);
    expect(task('snap.virtual-pivot').skippedBy()).toBe('page');
    expect(task('snap.keep-pivot').skippedBy()).toBe('earlier');
    for (const id of ['select.parent', 'select.children', 'select.click-parent'])
      expect(task(id).skippedBy(), id).toBe('earlier');
    // A done one left its parent in the scene.
    TutorialProgress.complete('snap.keep-pivot');
    expect(task('select.parent').isSkipped()).toBe(false);
  });

  it('skips a task whose switch below the page is off, for the reason the plugin gives', () => {
    const t = task('grab.slow');
    expect(t.isSkipped()).toBe(false);
    set('SharedGizmoSettings.PrecisionModeEnabled', false);
    expect(t.skippedBy()).toBe('switch');
    expect(t.switchText).toBe(data('grab.slow').availableWhen!.reason);
    Prefs.local.clear();
    set('SharedGizmoSettings.PrecisionModifier', 'None');
    expect(t.skippedBy()).toBe('switch');
  });

  it('tells a feature switched off on its own from its page switched off', () => {
    set('PieMenuSettings.Enabled', false);
    set('WireframeToggleSettings.Enabled', false);
    expect(task('pie.draw-mode').skippedBy()).toBe('page');
    Prefs.local.clear();
    piesOff.add(pieId('Blendon/Pie Menus/Shading'));
    expect(task('pie.draw-mode').skippedBy()).toBe('key');
  });
});

describe('tutorial progress', () => {
  it('starts on the first task and names it once started', () => {
    expect(TutorialProgress.currentId).toBe('nav.orbit');
    expect(TutorialProgress.started).toBe(false);
    TutorialProgress.start();
    expect(TutorialProgress.started).toBe(true);
  });

  it('ticks one task per report, the first open one whose needs are met', () => {
    Reports.reportShortcut('Blendon/Orbit Selected');
    expect(ids()).toEqual(['nav.orbit']);
    // Orbit around the cube needs a selection, so the same gesture waits for one.
    Reports.reportShortcut('Blendon/Orbit Selected');
    expect(ids()).toEqual(['nav.orbit']);
    Selection.set([cube], cube, false);
    Reports.reportShortcut('Blendon/Orbit Selected');
    expect(ids()).toEqual(['nav.orbit', 'nav.orbit-selection']);
  });

  it('takes commands by key or by prefix', () => {
    Reports.reportCommand('Blendon/Add/Plane');
    Reports.reportCommand('Blendon/Add Object/Cube');
    Reports.reportCommand('Blendon/Add Object/Cube');
    Reports.reportCommand('Blendon/Shading/Wireframe');
    expect(ids()).toEqual(['scene.add-plane', 'scene.add-cube', 'pair.add-cube', 'pie.draw-mode']);
  });

  it('ticks a kept drag that has every trait a task asks for', () => {
    Selection.set([cube], cube, false);
    Reports.reportTransform(T.Move | T.Grab | T.Axis | T.Numeric);
    Reports.reportTransform(T.Move | T.Grab | T.Axis | T.Numeric);
    Reports.reportTransform(T.Move | T.Grab | T.Axis | T.Numeric);
    expect(ids()).toEqual(['grab.move', 'grab.axis', 'grab.exact']);
    Reports.reportTransform(T.Move | T.Arrow);
    expect(ids()).toContain('handles.axis');
  });

  it('asks for a chosen task first, then picks the order up again', () => {
    TutorialProgress.choose('nav.zoom');
    expect(TutorialProgress.currentId).toBe('nav.zoom');
    Reports.report('ZoomWheel');
    expect(ids()).toEqual(['nav.zoom']);
    expect(TutorialProgress.chosenId).toBe('');
    expect(TutorialProgress.currentId).toBe('nav.orbit');
  });

  it('only reads a drag while an open task wants one', () => {
    expect(Reports.wantsTransforms()).toBe(true);
    for (const t of TutorialTasks) if (t.traits) TutorialProgress.complete(t.id);
    expect(Reports.wantsTransforms()).toBe(false);
  });
});

describe('tutorial page', () => {
  function layout(patch: Partial<WindowState> = {}) {
    let st: WindowState = { ...initialState(D.initial), hostW: 1100, winW: 1102, winH: 740, ...patch };
    const update = (p: StatePatch) => {
      st = reduce(st, p);
    };
    return layoutWindow(new WindowModel(st, newInstance(), update));
  }

  it('is the page the window opens on, a header and a card per chapter', () => {
    const L = layout();
    expect(L.page).toBe('Tutorial');
    const kinds = L.rows.flatMap((r) => r.cells.flatMap((c) => c.items.map((i) => i.k)));
    expect(kinds.filter((k) => k === 'tutHeader')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'tutChapter')).toHaveLength(TutorialCurriculum.length);
    expect(L.showReset).toBe(false);
  });

  it('leaves the Overview, and is found by its switch under search', () => {
    const overview = layout({ page: 'Overview' });
    const keys = overview.rows.flatMap((r) => r.cells.flatMap((c) => c.items.map((i) => ('pkey' in i ? i.pkey : ''))));
    expect(keys).not.toContain('GeneralSettings.ShowTutorial');
    const found = layout({ search: 'badge' });
    const hits = found.rows.flatMap((r) => r.cells.flatMap((c) => c.items.map((i) => ('pkey' in i ? i.pkey : ''))));
    expect(hits).toContain('GeneralSettings.ShowTutorial');
  });
});
