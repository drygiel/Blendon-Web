import { beforeAll, describe, expect, it } from 'vitest';
import { layoutWindow } from '../../src/window/core/layout.ts';
import { newInstance, WindowModel } from '../../src/window/core/model.ts';
import { initialState, reduce, type StatePatch, type WindowState } from '../../src/window/core/state.ts';
import { HIDE_MIN_SCROLL, StickyBar, type BarInput } from '../../src/window/core/sticky-bar.ts';
import { mul, skin, themeVars } from '../../src/window/core/theme.ts';
import { accented, M } from '../../src/window/core/util.ts';
import { D, loadWindowData } from '../../src/plugin/window-data.ts';

function harness(patch: Partial<WindowState> = {}) {
  let st: WindowState = { ...initialState(D.initial), hostW: 1100, winW: 1102, winH: 740, ...patch };
  const inst = newInstance();
  const update = (p: StatePatch) => {
    st = reduce(st, p);
  };
  return { model: () => new WindowModel(st, inst, update) };
}

beforeAll(async () => {
  await loadWindowData();
});

const input = (scrollY: number, over: Partial<BarInput> = {}): BarInput => ({
  enabled: true,
  scrollY,
  searching: false,
  searchFocused: false,
  dragging: false,
  ...over,
});

/** Runs the slide to its end at 60 fps, applying each scroll change like the window does. */
function settle(bar: StickyBar, scrollY: number, over: Partial<BarInput> = {}) {
  let y = scrollY;
  for (let i = 0; i < 60; i++) y += bar.step(1 / 60, input(y, over));
  return y;
}

describe('sticky search bar', () => {
  it('slides away on a scroll down past one bar and keeps the rows in place', () => {
    const bar = new StickyBar();
    bar.track(HIDE_MIN_SCROLL + 40, true, false);
    expect(bar.target).toBe(0);
    const y = settle(bar, HIDE_MIN_SCROLL + 40);
    expect(bar.height).toBe(0);
    // The view grew by the bar, so the scroll went back by as much and every row stays on screen where it was.
    expect(y).toBeCloseTo(HIDE_MIN_SCROLL + 40 - M.headerH, 6);
    expect(bar.lastScrollY).toBeCloseTo(y, 6);
  });

  it('takes the 0.18 s slide, eased', () => {
    const bar = new StickyBar();
    bar.track(500, true, false);
    let y = 500;
    y += bar.step(0.09, input(y));
    expect(bar.height).toBeCloseTo(M.headerH / 2, 6);
    y += bar.step(0.05, input(y));
    y += bar.step(0.05, input(y));
    expect(bar.height).toBe(0);
    expect(y).toBeCloseTo(500 - M.headerH, 6);
  });

  it('does not hide within the first bar of scroll', () => {
    const bar = new StickyBar();
    bar.track(HIDE_MIN_SCROLL - 1, true, false);
    expect(bar.target).toBe(1);
  });

  it('comes straight back on any scroll up', () => {
    const bar = new StickyBar();
    bar.track(600, true, false);
    let y = settle(bar, 600);
    bar.track(y - 1, true, false);
    expect(bar.target).toBe(1);
    y = settle(bar, y - 1);
    expect(bar.height).toBe(M.headerH);
    expect(y).toBeCloseTo(600 - 1, 6);
  });

  it('always shows at the top, while searching or typing, and when switched off', () => {
    for (const over of [
      { scrollY: 0 },
      { searching: true },
      { searchFocused: true },
      { enabled: false },
    ] as Partial<BarInput>[]) {
      const bar = new StickyBar();
      bar.track(600, true, false);
      settle(bar, 600);
      expect(bar.height).toBe(0);
      settle(bar, over.scrollY ?? 540, over);
      expect(bar.height).toBe(M.headerH);
    }
  });

  it('ignores scrolls while off or during a drag, and holds the geometry under a drag', () => {
    const bar = new StickyBar();
    bar.track(600, false, false);
    expect(bar.target).toBe(1);
    bar.track(1200, true, true);
    expect(bar.target).toBe(1);
    bar.track(1300, true, false);
    expect(bar.target).toBe(0);
    expect(bar.step(0.1, input(1300, { dragging: true }))).toBe(0);
    expect(bar.height).toBe(M.headerH);
  });

  it('a jump the code makes is not a user scroll, and a page switch starts shown', () => {
    const bar = new StickyBar();
    bar.sync(900);
    bar.track(900, true, false);
    expect(bar.target).toBe(1);
    bar.track(1000, true, false);
    settle(bar, 1000);
    bar.reset(0);
    expect([bar.fraction, bar.target, bar.height, bar.lastScrollY]).toEqual([1, 1, M.headerH, 0]);
  });

  it('snaps without the slide for reduced motion', () => {
    const bar = new StickyBar();
    bar.track(600, true, false);
    expect(bar.step(0.016, input(600), true)).toBe(-M.headerH);
    expect(bar.height).toBe(0);
  });
});

describe('settings window look', () => {
  it('reads Unity, the reset bar and the sticky bar by default', () => {
    const L = layoutWindow(harness().model());
    expect(L.theme).toBe('Unity');
    expect(L.resetBar).toBe(true);
  });

  it('drops the reset bar when Show Reset Bar is off', () => {
    const h = harness({ page: 'Zoom' });
    h.model().set('GeneralSettings.ShowResetBar', false);
    const L = layoutWindow(h.model());
    expect(L.resetBar).toBe(false);
    // Whether the page has a reset is unchanged, only the strip holding it is gone.
    expect(L.showReset).toBe(true);
  });

  it('reads the theme from its stored enum name', () => {
    const h = harness();
    h.model().set('GeneralSettings.SettingsTheme', 'Dark');
    expect(layoutWindow(h.model()).theme).toBe('Dark');
    h.model().set('GeneralSettings.SettingsTheme', 'Light');
    expect(h.model().theme).toBe('Light');
    h.model().set('GeneralSettings.SettingsTheme', 'Unity');
    expect(h.model().theme).toBe('Unity');
  });

  it('leaves the Unity look to the stylesheet', () => {
    expect(themeVars('Unity')).toEqual({});
  });

  it("uses Palette's forced Dark zinc ladder", () => {
    const v = themeVars('Dark') as Record<string, string>;
    expect(v['--w-sunken']).toBe('#121214');
    expect(v['--w-ground']).toBe('#161619');
    expect(v['--w-well']).toBe('#1C1C20');
    expect(v['--w-card']).toBe('#212125');
    expect(v['--w-border']).toBe('#2E2E35');
    expect([v['--w-text'], v['--w-text2'], v['--w-caption']]).toEqual(['#F2F2F4', '#B4B4C0', '#9A9AA8']);
    expect(v['--w-brand']).toBe('#3671C9');
    expect(v['--w-danger-text']).toBe('#F2998B');
    // Two-value entries keep the dark skin's value.
    expect(v['--w-warn-text']).toBe('#FFC76B');
  });

  it("uses Palette's forced Light: white cards on a cool grey page", () => {
    const v = themeVars('Light') as Record<string, string>;
    expect(v['--w-ground']).toBe('#F4F4F6');
    expect(v['--w-sunken']).toBe('#ECECF0');
    expect(v['--w-card']).toBe('#FFFFFF');
    expect(v['--w-border']).toBe('#D9D9E0');
    expect(v['--w-text']).toBe('#1A1A1F');
    expect(v['--w-brand']).toBe('#2563EB');
    expect(v['--w-rule']).toBe('rgba(0, 0, 0, 0.085)');
    // Two-value entries take the light skin's value.
    expect(v['--w-warn-text']).toBe('#7A4A00');
    expect(v['--w-key-border']).toBe('rgba(0, 0, 0, 0.25)');
  });

  it('turns page accents and chrome colours to the theme', () => {
    expect(skin('#F2D933', 'Unity')).toBe('#F2D933');
    expect(skin('#F2D933', 'Dark')).toBe('#F2D933');
    expect(skin('#F2D933', 'Light')).toBe('#796A08');
    expect(skin('#87B8DE', 'Dark')).toBe('#8FB9E8');
    expect(skin('#87b8de', 'Light')).toBe('#3660A8');
    expect(skin('#123456', 'Light')).toBe('#123456');
    const h = harness();
    h.model().set('GeneralSettings.SettingsTheme', 'Light');
    expect(h.model().skin('#E6574F')).toBe('#C4342C');
  });

  it('multiplies a tint into the style colour like GUI.contentColor', () => {
    expect(mul('#808080', '#D2D2D2')).toBe('#696969');
    expect(mul('#D9D9D9', '#C4C4C4')).toBe('#A7A7A7');
  });

  it('keeps the dark skin capture plate', () => {
    expect(accented('#40B8EB')).toBe(accented('#40B8EB', '#585858'));
  });
});
