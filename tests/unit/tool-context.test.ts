import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Keymap } from '../../src/bridge/keymap.ts';
import { loadWindowData } from '../../src/plugin/window-data.ts';
import { GizmoActions, PivotPointActions } from '../../src/scene/blendon/piemenus/actions.ts';
import { SharedGizmoSettings } from '../../src/scene/blendon/gizmos/shared-settings.ts';
import { ShortcutGates } from '../../src/scene/blendon/shortcut-gates.ts';
import {
  BlendonContext,
  blendonContextActive,
  ContextSwitch,
  EscapeGuard,
} from '../../src/scene/blendon/tool-context.ts';
import { PivotMode, Prefs, Tool, ToolContext, ToolManager, Tools } from '../../src/scene/unity/editor.ts';
import { Event, EventType, GUIUtility, KeyCode } from '../../src/scene/unity/imgui.ts';

const Gizmos = ['MoveGizmoSettings', 'RotateGizmoSettings', 'ScaleGizmoSettings', 'TransformGizmoSettings'];
const setGizmos = (on: boolean) => {
  for (const g of Gizmos) Prefs.local.set(g + '.Enabled', on);
  Prefs.changed();
};

beforeAll(async () => {
  await loadWindowData();
});

beforeEach(() => {
  Prefs.local.clear();
  Prefs.source = null;
  Prefs.changed();
  ToolManager.setActiveContext(ToolContext.Blendon);
});

describe("Blendon's tool context", () => {
  it('starts in Blendon and Toggle Blendon goes back and forth', () => {
    expect(blendonContextActive()).toBe(true);
    ContextSwitch.toggle();
    expect(ToolManager.activeContext).toBe(ToolContext.GameObject);
    expect(blendonContextActive()).toBe(false);
    ContextSwitch.toggle();
    expect(blendonContextActive()).toBe(true);
  });

  it('leaves with every gizmo off and comes back once one is on again', () => {
    setGizmos(false);
    expect(blendonContextActive()).toBe(false);
    setGizmos(true);
    expect(blendonContextActive()).toBe(true);
  });

  it('keeps a pick of Game Object by hand while other settings change', () => {
    ContextSwitch.toggle();
    Prefs.set('MoveGizmoSettings.Enabled', false);
    Prefs.set('MoveGizmoSettings.Enabled', true);
    expect(blendonContextActive()).toBe(false);
  });

  it('shuts the keys that follow the context, the pies only on the Editor key they cover', () => {
    ShortcutGates.inBlendonContext = blendonContextActive;
    // The Tools pie as the Unity preset has it, off the View tool's Q.
    Keymap.rebind('Blendon/Pie Menus/Tools', 'Alt+Q');
    ContextSwitch.toggle();
    expect(ShortcutGates.isOpen('Blendon/Move/Grab')).toBe(false);
    expect(ShortcutGates.isOpen('Blendon/All Tools/Vertex Snap')).toBe(false);
    expect(ShortcutGates.isOpen('Blendon/Pie Menus/Draw Mode')).toBe(false);
    expect(ShortcutGates.isOpen('Blendon/Pie Menus/Tools')).toBe(true);
    expect(ShortcutGates.isOpen('Blendon/Orbit Selected')).toBe(true);
    expect(ShortcutGates.isOpen('Blendon/Toggle Blendon')).toBe(true);
    ContextSwitch.toggle();
    expect(ShortcutGates.isOpen('Blendon/Move/Grab')).toBe(true);
    Keymap.reset();
  });

  it("resolves a slot to Blendon's tool only in its context and with the gizmo on", () => {
    expect(BlendonContext.ownsSlot(1)).toBe(true);
    Prefs.set('MoveGizmoSettings.Enabled', false);
    expect(BlendonContext.ownsSlot(1)).toBe(false);
    expect(BlendonContext.ownsSlot(2)).toBe(true);
    ContextSwitch.toggle();
    expect(BlendonContext.ownsSlot(2)).toBe(false);
  });

  it("greys Hide Gizmo out of the context and keeps the Pivot Point pie to Unity's two sides there", () => {
    const hide = GizmoActions[0].createItem(null);
    const [center, median, pivot] = PivotPointActions.map((a) => a.createItem(null));
    expect(hide.isEnabled).toBe(true);
    expect(median.isEnabled).toBe(true);

    SharedGizmoSettings.PivotPoint = 1;
    ContextSwitch.toggle();
    expect(hide.isEnabled).toBe(false);
    expect(median.isEnabled).toBe(false);
    expect(center.isEnabled).toBe(true);
    // Unity's toggle only, Blendon's Center side keeps Median for its return.
    pivot.action();
    expect(Tools.pivotMode).toBe(PivotMode.Pivot);
    expect(pivot.isCurrent).toBe(true);
    center.action();
    expect(Tools.pivotMode).toBe(PivotMode.Center);
    ContextSwitch.toggle();
    expect(SharedGizmoSettings.PivotPoint).toBe(1);
  });
});

describe('EscapeGuard', () => {
  const escape = () => {
    const ev = new Event(EventType.KeyDown);
    ev.keyCode = KeyCode.Escape;
    return ev;
  };

  beforeEach(() => {
    Tools.current = Tool.Move;
    Tools.viewToolActive = false;
    GUIUtility.hotControl = 0;
  });

  it("uses the Escape after Blendon's tool, so the Editor never leaves the context on it", () => {
    const ev = escape();
    EscapeGuard.afterTool(ev);
    expect(ev.type).toBe(EventType.Used);
  });

  it("leaves a press that holds one of Unity's handles to that handle", () => {
    GUIUtility.hotControl = 7;
    const held = escape();
    EscapeGuard.beforeUnityTool(held);
    expect(held.type).toBe(EventType.KeyDown);
    GUIUtility.hotControl = 0;
    const idle = escape();
    EscapeGuard.beforeUnityTool(idle);
    expect(idle.type).toBe(EventType.Used);
  });

  it('lets the Escape through with Esc Keeps Context off, every gizmo off, or the View tool', () => {
    Prefs.set('GeneralSettings.EscapeKeepsContext', false);
    expect(EscapeGuard.holds(escape())).toBe(false);
    Prefs.set('GeneralSettings.EscapeKeepsContext', true);
    expect(EscapeGuard.holds(escape())).toBe(true);
    Tools.current = Tool.View;
    expect(EscapeGuard.holds(escape())).toBe(false);
    Tools.current = Tool.Move;
    setGizmos(false);
    expect(EscapeGuard.holds(escape())).toBe(false);
  });
});
