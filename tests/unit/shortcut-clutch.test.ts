import { describe, expect, it } from 'vitest';
import { ShortcutManager, ShortcutModifiers, ShortcutStage } from '../../src/scene/unity/editor.ts';
import { Event, EventType, KeyCode } from '../../src/scene/unity/imgui.ts';

const press = (keyCode: number) => {
  const ev = new Event(EventType.KeyDown);
  ev.keyCode = keyCode;
  return ev;
};

describe('a clutch under a modifier change', () => {
  it('stays held when the key with the new modifiers is an action, as V under Shift does', () => {
    const stages: number[] = [];
    ShortcutManager.register('Test/Hold', (a) => stages.push(a.stage), true, 'V');
    ShortcutManager.register('Test/Pick', () => stages.push(-1), false, 'Shift+V');
    expect(ShortcutManager.dispatchDown(press(KeyCode.V), null)).toBe(true);
    ShortcutManager.endMismatched(ShortcutModifiers.Shift, null);
    ShortcutManager.endMismatched(ShortcutModifiers.Action, null);
    expect(stages).toEqual([ShortcutStage.Begin]);
    ShortcutManager.dispatchUp(KeyCode.V, null);
    expect(stages).toEqual([ShortcutStage.Begin, ShortcutStage.End]);
  });

  it('ends when the key with the new modifiers is another clutch', () => {
    const stages: number[] = [];
    ShortcutManager.register('Test/Orbit', (a) => stages.push(a.stage), true, 'B');
    ShortcutManager.register('Test/Pan', () => {}, true, 'Shift+B');
    ShortcutManager.dispatchDown(press(KeyCode.B), null);
    ShortcutManager.endMismatched(ShortcutModifiers.Shift, null);
    expect(stages).toEqual([ShortcutStage.Begin, ShortcutStage.End]);
  });
});
