import { beforeAll, describe, expect, it } from 'vitest';
import { layoutWindow } from '../../src/window/core/layout.ts';
import { newInstance, WindowModel } from '../../src/window/core/model.ts';
import { initialState, reduce, type StatePatch, type WindowState } from '../../src/window/core/state.ts';
import { bindingFromEvent, capTokens, rich } from '../../src/window/core/text.ts';
import { roundToRange, unityPx } from '../../src/window/core/util.ts';
import { D, loadWindowData } from '../../src/plugin/window-data.ts';
import { extent, preferredHeight, settings } from '../../src/window/gizmo/gizmo.ts';

/** A model over a plain state object, with updates applied in place. */
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

describe('window text helpers', () => {
  it('splits bindings into caps', () => {
    expect(capTokens('Ctrl+Shift+Z').map((t) => t.t)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(capTokens('Shift+Mouse 2')[1]).toMatchObject({ mouse: true, icon: D.mouseIcons[2] });
  });

  it('reads key events as Unity bindings', () => {
    const e = { ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, code: 'Numpad7' };
    expect(bindingFromEvent(e)).toBe('Ctrl+Shift+Num 7');
    expect(bindingFromEvent({ ...e, ctrlKey: false, shiftKey: false }, 4)).toBe('Mouse 4');
  });

  it('parses Unity rich text', () => {
    const runs = rich('a <b>b <color=#FF0000>c</color></b>');
    expect(runs.map((r) => r.t)).toEqual(['a ', 'b ', 'c']);
    expect(runs[2]?.s).toEqual({ fontWeight: 700, color: '#FF0000' });
  });

  it('rounds like Unity', () => {
    expect(unityPx(10)).toBe(10.286);
    expect(roundToRange(0.123456, 0, 1)).toBe(0.12);
  });
});

describe('window model', () => {
  it('stores values and reverts them', () => {
    const h = harness();
    h.model().set('ZoomSettings.Invert', true);
    expect(h.model().val('ZoomSettings.Invert')).toBe(true);
    h.model().revert('ZoomSettings.Invert');
    expect(h.model().isDefault('ZoomSettings.Invert')).toBe(true);
  });

  it('maps the Transform tool onto the tools it delegates to', () => {
    const h = harness();
    h.model().set('TransformMoveSettings.AxisHeadFlat', true);
    expect(h.state().vals['MoveGizmoSettings.AxisHeadFlat']).toBe(true);
  });

  it('switches every tool from All Tools', () => {
    const h = harness();
    h.model().set('SharedGizmoSettings.AllToolsEnabled', false);
    expect(h.model().anyTool()).toBe(false);
    expect(h.model().pageEnabled('SharedGizmos')).toBe(false);
  });
});

describe('window layout', () => {
  it('lays out every page', () => {
    for (const page of D.catalog) {
      const L = layoutWindow(harness({ page: page.id }).model());
      expect(L.rows.length, page.id).toBeGreaterThan(0);
    }
  });

  it('searches across all pages', () => {
    const L = layoutWindow(harness({ search: 'snap' }).model());
    expect(L.searching).toBe(true);
    expect(L.matchCount).toBe(49);
    expect(L.side.filter((s) => (s.matches ?? 0) > 0).length).toBeGreaterThan(3);
  });

  it('collapses the sidebar on a phone-sized host', () => {
    const L = layoutWindow(harness({ hostW: 390, winW: null, winH: null }).model());
    expect(L.collapsed).toBe(true);
    expect(L.winW).toBe(390);
    expect(L.winH).toBe(640);
  });
});

describe('gizmo preview', () => {
  it('sizes the preview from the gizmo extent', () => {
    const h = harness();
    for (const owner of ['MoveGizmoSettings', 'RotateGizmoSettings', 'ScaleGizmoSettings', 'TransformGizmoSettings']) {
      const [up, down] = extent(settings(h.model(), owner));
      const height = preferredHeight(up, down);
      expect(height).toBeGreaterThanOrEqual(150);
      expect(height).toBeLessThanOrEqual(320);
    }
  });
});
