import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaygroundEvents } from '../../src/bridge/events.ts';
import { Keymap } from '../../src/bridge/keymap.ts';
import { SharedSettings } from '../../src/bridge/settings.ts';
import { loadWindowData, D } from '../../src/plugin/window-data.ts';
import { ShortcutTips } from '../../src/scene/blendon/foundation.ts';
import { ShortcutTipCard } from '../../src/scene/blendon/shortcut-tips.ts';
import { TutorialBadgeSpot } from '../../src/scene/blendon/tutorial/badge-spot.ts';
import { TutorialProgress } from '../../src/scene/blendon/tutorial/progress.ts';
import { SceneTutorial } from '../../src/scene/blendon/tutorial/scene-tutorial.ts';
import { Prefs } from '../../src/scene/unity/editor.ts';

const GRAB = 'Blendon/Grab';

// The card runs on its own rAF clock, driven here one frame at a time.
let clockMs = 0;
let frames: FrameRequestCallback[] = [];
const frame = (ms = 16) => {
  clockMs += ms;
  const due = frames;
  frames = [];
  for (const f of due) f(clockMs);
};
const run = (seconds: number) => {
  for (let t = 0; t < seconds * 1000; t += 16) frame();
};

beforeAll(async () => {
  vi.spyOn(performance, 'now').mockImplementation(() => clockMs);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  await loadWindowData();
  Prefs.source = {
    val: (key) => (key in D.initial ? D.initial[key] : D.props[key]?.d),
    shortcut: (id) => D.shortcuts[id]?.d,
  };
  SharedSettings.publish({
    val: (key) => Prefs.get(key, D.props[key]?.d ?? false),
    shortcut: (id) => Keymap.binding(id) ?? '',
    pieOn: () => true,
  });
  ShortcutTipCard.install();
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  PlaygroundEvents.emit('reset');
  TutorialProgress.reset();
  TutorialBadgeSpot.setTipShown(false);
  Keymap.reset();
  // Lets the clock see the reset and stop.
  frame();
});

describe('shortcut tips', () => {
  it('show while the tutorial badge is up', () => {
    expect(SceneTutorial.isShowing).toBe(true);
    ShortcutTips.note(GRAB);
    frame();
    expect(ShortcutTipCard.card?.ours.id).toBe(GRAB);
  });

  it('make way for the badge hover card', () => {
    ShortcutTips.note(GRAB);
    frame();
    TutorialBadgeSpot.setTipShown(true);
    run(0.3);
    expect(ShortcutTipCard.card).toBeNull();
  });

  it('count their time down on the ring, held at the grace while hovered', () => {
    ShortcutTips.note(GRAB);
    frame();
    expect(ShortcutTipCard.remaining).toBeCloseTo(1, 1);
    run(5);
    expect(ShortcutTipCard.remaining).toBeCloseTo(0.5, 1);
    ShortcutTipCard.setHovered(true);
    run(8);
    expect(ShortcutTipCard.card).not.toBeNull();
    expect(ShortcutTipCard.remaining).toBeGreaterThanOrEqual(0.24);
    ShortcutTipCard.setHovered(false);
  });

  it('wait for the badge hover card to close', () => {
    TutorialBadgeSpot.setTipShown(true);
    ShortcutTips.note(GRAB);
    run(1);
    expect(ShortcutTipCard.card).toBeNull();
    TutorialBadgeSpot.setTipShown(false);
    frame();
    expect(ShortcutTipCard.card?.ours.id).toBe(GRAB);
  });
});
