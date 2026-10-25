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

  it('finds each contested row by its Blendon shortcut', () => {
    expect(D.contested.length).toBeGreaterThan(0);
    for (const row of D.contested) expect(D.known[row.bid]).toBe(row);
  });

  it('stores nothing for a value within half the finest slider step of its default', () => {
    const h = harness();
    const key = 'TransformRotateSettings.AxisLength';
    const d = Number(h.model().def(key));
    h.model().set(key, d + 0.0003);
    expect(key in h.state().vals).toBe(false);
    expect(h.model().isDefault(key)).toBe(true);
    h.model().set(key, d + 0.001);
    expect(h.state().vals[key]).toBeCloseTo(d + 0.001, 6);
    expect(h.model().isDefault(key)).toBe(false);
  });

  it("drops a General override row's flag with its value, so the row follows again", () => {
    const h = harness();
    const key = 'PanSettings.CursorWrapEnabled';
    const src = D.followers[key];
    const followed = h.model().val(src);
    h.model().update((s) => ({ ovr: { ...s.ovr, [key]: true }, vals: { ...s.vals, [key]: !followed } }));
    expect(h.model().val(key)).toBe(!followed);
    // A stored value no longer counts once the row follows.
    h.model().update((s) => ({ ovr: { ...s.ovr, [key]: false } }));
    expect(h.model().val(key)).toBe(followed);
    h.model().update((s) => ({ ovr: { ...s.ovr, [key]: true } }));
    h.model().revert(key);
    expect(h.model().overriding(key)).toBe(false);
    expect(key in h.state().vals).toBe(false);
    h.model().set(src, !followed);
    expect(h.model().val(key)).toBe(!followed);
  });

  it("resets the Transform page's borrowed rows and leaves the tools' other forwarded settings", () => {
    const h = harness();
    h.model().set('TransformMoveSettings.AxisHeadFlat', !D.props['MoveGizmoSettings.AxisHeadFlat'].d);
    h.model().set('TransformMoveSettings.SurfaceSnapEnabled', false);
    h.model().set('TransformRotateSettings.AxisLength', 2);
    h.model().resetPage('TransformGizmo');
    const vals = h.state().vals;
    expect('MoveGizmoSettings.AxisHeadFlat' in vals).toBe(false);
    expect('TransformRotateSettings.AxisLength' in vals).toBe(false);
    expect(vals['MoveGizmoSettings.SurfaceSnapEnabled']).toBe(false);
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

  it('spells the keys in shortcut row cards', () => {
    const items = layoutWindow(harness({ page: 'Zoom' }).model()).rows.flatMap((r) => r.cells.flatMap((c) => c.items));
    const zoomIn = items.find((it) => it.k === 'sc' && it.sid === 'Blendon/Zoom/Zoom In');
    expect(zoomIn?.k === 'sc' && zoomIn.tip.t).toContain('<b><color=#D98E38>' + D.keymap['Blendon/Zoom/Zoom In']?.b);
    for (const it of items) if (it.k === 'sc') expect(it.tip.t, it.sid).not.toContain('{key:');
  });

  it("keeps an off feature's keys editable on the Keyboard page, under a note", () => {
    const items = (patch: Partial<WindowState>) =>
      layoutWindow(harness({ page: 'Keyboard', ...patch }).model()).rows.flatMap((r) =>
        r.cells.flatMap((c) => c.items),
      );
    const text = (list: ReturnType<typeof items>) =>
      list.flatMap((it) => (it.k === 'banner' ? [it.runs.map((r) => r.t).join('')] : []));
    const zoomOff = items({ vals: { ...D.initial, 'ZoomSettings.Enabled': false } });
    const note = (D.consts.keyboardOffNote ?? '').replace('{0}', 'Zoom');
    expect(note).toContain('can still be changed');
    expect(text(zoomOff)).toContain(note);
    const rows = zoomOff.filter((it) => it.k === 'sc' && D.pageShortcuts.Zoom.includes(it.sid));
    expect(rows.length).toBe(D.pageShortcuts.Zoom.length);
    for (const row of rows) expect(row.dis, row.k === 'sc' ? row.sid : '').toBe(false);
    // With Blendon off the window's own warning says it once.
    const masterOff = items({
      vals: { ...D.initial, 'GeneralSettings.Enabled': false, 'ZoomSettings.Enabled': false },
    });
    expect(text(masterOff)).not.toContain(note);
  });

  it('searches across all pages', () => {
    const L = layoutWindow(harness({ search: 'snap' }).model());
    expect(L.searching).toBe(true);
    expect(L.matchCount).toBe(50);
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
