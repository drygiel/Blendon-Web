// PieMenu: where an open menu lives. Owns the Scene view hooks, turns raw events into controller calls
// and drives the unfold from the editor update loop. Content only builds data and calls request().
import { EditorApplication, ShortcutManager } from '../../unity/editor.ts';
import { EditorGUIUtility, Handles, HandleUtility, MouseCursor } from '../../unity/handles.ts';
import { Event, EventType, GUIUtility, KeyCode } from '../../unity/imgui.ts';
import { Rect, type Vector2 } from '../../unity/math.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { ModalViewportGate } from '../foundation.ts';
import { GizmoController } from '../gizmos/common/controller.ts';
import { Signal } from '../gizmos/common/signal.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { PieMenuController, PieOutcome } from './controller.ts';
import type { PieMenuData } from './model.ts';
import { PieRegistry } from './registry.ts';
import { PieMenuRenderer } from './renderer.ts';
import { PieMenuSettings } from './settings.ts';

// A press no pass could serve must not open a menu out of nowhere much later. Longer than Unity's
// 0.25 s: a page under load can take that long to reach its next frame.
const RequestLifetimeSeconds = 1;
const GateOwner = {};

let active: PieMenuController | null = null;
let requested: { data: PieMenuData; view: SceneView; shortcutId: string; at: number; released: boolean } | null = null;

export const PieMenu = {
  Settings: PieMenuSettings,

  /** View, the cursor the key was pressed at, and the shortcut id - for "what was under the cursor". */
  opened: new Signal<[SceneView, Vector2, string]>(),
  /** However the menu ended; a latched menu outlives its key, so this is the moment it's gone. */
  closed: new Signal<[string]>(),

  get isOpen() {
    return active != null;
  },

  get active() {
    return active;
  },

  /** From a pie's clutch Begin stage; the view the key was pressed in is pinned. */
  request(data: PieMenuData, view: SceneView, shortcutId: string) {
    if (!PieMenuSettings.Enabled) return;
    if (active) {
      // Unity hands the raw re-press to the GUI pass, where it closes a latched menu; here the
      // Shortcut Manager takes the key first, so the same toggle is made from the clutch.
      if (active.clickStyle && active.shortcutId === shortcutId) cancel();
      return;
    }
    // A modal grab owns the viewport: the key belongs to it (Z is an axis lock mid-grab).
    if (GizmoController.hasModalSession) {
      ViewportGesture.claimed(shortcutId);
      return;
    }
    requested = { data, view, shortcutId, at: EditorApplication.timeSinceStartup, released: false };
    view.repaint();
  },

  /** From a pie's clutch End stage. */
  notifyHotkeyReleased(shortcutId: string) {
    // Released before any pass served the press: a tap, so the menu opens latched.
    if (requested?.shortcutId === shortcutId) requested.released = true;
    const c = active;
    if (!c || c.shortcutId !== shortcutId) return;
    finish(c.onHotkeyReleased());
    c.view.repaint();
  },

  /** A number key offered by a binding that owns it (the numpad); an open menu owns every digit. */
  tryAccelerator(n: number) {
    const c = active;
    if (!c) return false;
    const outcome = c.tryAccelerator(n);
    if (outcome != null) finish(outcome);
    c.view.repaint();
    return true;
  },

  cancel() {
    cancel();
  },

  install() {
    SceneView.beforeSceneGui.add(onBeforeSceneGui);
    SceneView.duringSceneGui.add(onDuringSceneGui);
    EditorApplication.focusChanged.add((hasFocus) => {
      // Losing focus swallows both the key release and the clutch End.
      if (!hasFocus) cancel();
    });
    PieRegistry.isOpen = () => active != null;
    PieRegistry.tryAccelerator = (digit) => PieMenu.tryAccelerator(digit);
  },
};

function onBeforeSceneGui(view: SceneView) {
  consumeRequest(view);
  const c = active;
  if (!c || c.view !== view) return;
  const e = Event.current;
  switch (e.type) {
    // Layout carries the default-control claim made below; Repaint is where the menu draws.
    case EventType.Layout:
    case EventType.Repaint:
    case EventType.Used:
      return;
    case EventType.MouseMove:
    case EventType.MouseDrag:
      c.track(e.mousePosition);
      view.repaint();
      e.use();
      return;
    case EventType.MouseDown:
      // Only a latched menu has a click to confirm with; during the hold the press is swallowed.
      if (e.button === 0) {
        if (c.clickStyle) finish(c.onConfirmClick());
      } else cancel();
      view.repaint();
      e.use();
      return;
    case EventType.MouseUp:
      e.use();
      return;
    case EventType.KeyDown:
      handleKeyDown(c, e);
      view.repaint();
      return;
    case EventType.KeyUp:
      if (matchesBinding(c.shortcutId, e.keyCode)) finish(c.onHotkeyReleased());
      view.repaint();
      e.use();
      return;
    // The routes that would otherwise still reach the view underneath.
    case EventType.ScrollWheel:
    case EventType.ValidateCommand:
    case EventType.ExecuteCommand:
      e.use();
      return;
    // Routed elsewhere mid-gesture; the release will never arrive.
    case EventType.Ignore:
      cancel();
      return;
  }
}

function onDuringSceneGui(view: SceneView) {
  // Reserved at the same point every pass, so the id stays stable across Layout and the event.
  const id = GUIUtility.getControlID(0);
  const c = active;
  if (!c || c.view !== view) return;
  const e = Event.current;
  // Nothing underneath - a marquee, a selected object's handle - may take the click ending the menu.
  if (e.type === EventType.Layout) HandleUtility.addDefaultControl(id);
  if (e.type === EventType.Repaint) {
    Handles.beginGUI();
    PieMenuRenderer.draw(PieMenuRenderer.requestFor(c));
    Handles.endGUI();
  }
  EditorGUIUtility.addCursorRect(new Rect(0, 0, view.position.width, view.position.height), MouseCursor.Arrow);
}

function handleKeyDown(c: PieMenuController, e: Event) {
  if (e.keyCode === KeyCode.Escape || (c.clickStyle && matchesBinding(c.shortcutId, e.keyCode))) {
    cancel();
    e.use();
    return;
  }
  const n = digitOf(e.keyCode);
  const outcome = n > 0 ? c.tryAccelerator(n) : null;
  if (outcome != null) finish(outcome);
  // Everything else is swallowed so no key leaks into the view underneath.
  e.use();
}

function consumeRequest(view: SceneView) {
  const r = requested;
  if (!r || r.view !== view) return;
  requested = null;
  if (EditorApplication.timeSinceStartup - r.at > RequestLifetimeSeconds) return;
  open(r.data, view, Event.current.mousePosition, r.shortcutId);
  if (r.released) active?.onHotkeyReleased();
}

function open(data: PieMenuData, view: SceneView, cursor: Vector2, shortcutId: string) {
  active = new PieMenuController(data, view, cursor, shortcutId);
  ModalViewportGate.claim(GateOwner);
  EditorApplication.update.remove(pump);
  EditorApplication.update.add(pump);
  PieMenu.opened.invoke(view, cursor, shortcutId);
  view.repaint();
}

function finish(outcome: PieOutcome) {
  if (outcome !== PieOutcome.Open) close();
}

function cancel() {
  close();
}

function close() {
  const c = active;
  active = null;
  EditorApplication.update.remove(pump);
  ModalViewportGate.release(GateOwner);
  requested = null;
  if (!c) return;
  c.view.repaint();
  // After the gate is released: a listener drawing into the viewport needs it free.
  PieMenu.closed.invoke(c.shortcutId);
}

/** The tap timeout and the unfold - what no event advances. Unsubscribed once the menu closes. */
function pump() {
  const c = active;
  if (!c) {
    EditorApplication.update.remove(pump);
    return;
  }
  if (c.tick() !== PieOutcome.Open) {
    close();
    return;
  }
  if (c.isAnimating) c.view.repaint();
}

function matchesBinding(shortcutId: string, released: number) {
  if (released === KeyCode.None) return false;
  return ShortcutManager.getShortcutBinding(shortcutId)?.keyCode === released;
}

// Both keyboards answer, so the accelerators work with NumLock off as well.
function digitOf(key: number) {
  if (key >= KeyCode.Alpha1 && key <= KeyCode.Alpha9) return key - KeyCode.Alpha1 + 1;
  if (key >= KeyCode.Keypad1 && key <= KeyCode.Keypad9) return key - KeyCode.Keypad1 + 1;
  return 0;
}
