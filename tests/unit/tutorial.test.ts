import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadWindowData, D } from '../../src/plugin/window-data.ts';
import { TUTORIAL } from '../../src/plugin/tutorial.ts';
import { SceneTutorial as Reports, TransformTraits as T } from '../../src/scene/blendon/foundation.ts';
import { TutorialCurriculum, TutorialTasks, unusedRules } from '../../src/scene/blendon/tutorial/curriculum.ts';
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

beforeAll(async () => {
  await loadWindowData();
  // The shipped defaults, as the Scene view reads them before the window has loaded.
  Prefs.source = {
    val: (key) => (key in D.initial ? D.initial[key] : D.props[key]?.d),
    shortcut: (id) => D.shortcuts[id]?.d,
  };
  SceneTutorial.install();
});

beforeEach(() => {
  TutorialProgress.reset();
  Selection.set([], null, false);
});

describe('tutorial curriculum', () => {
  it('has a rule for every task the plugin teaches, and none left over', () => {
    expect(TutorialCurriculum).toHaveLength(TUTORIAL.chapters.length);
    expect(TutorialTasks).toHaveLength(TUTORIAL.chapters.reduce((n, c) => n + c.tasks.length, 0));
    expect(unusedRules()).toEqual([]);
  });

  it('draws key sequences from the live bindings', () => {
    const exact = TutorialTasks.find((t) => t.id === 'grab.exact')!;
    expect(exact.keys()).toBe('G > Y > 2 > Enter');
    expect(TutorialTasks.find((t) => t.id === 'scene.add-plane')!.keys()).toBe('Mouse 1');
  });

  it('skips what the browser demo cannot do', () => {
    expect(TutorialTasks.find((t) => t.id === 'nav.camera')!.isSkipped()).toBe(true);
    expect(TutorialTasks.find((t) => t.id === 'nav.orbit')!.isSkipped()).toBe(false);
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
