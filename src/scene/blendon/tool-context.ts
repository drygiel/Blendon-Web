// BlendonContext, ContextSwitch and EscapeGuard: Game Object (Blendon), the tool context Blendon's gizmos live in.
// Blendon puts the view there on start, Toggle Blendon goes back and forth, and outside it the gizmo keys and the
// selection gestures are Unity's own.
import { PlaygroundEvents } from '../../bridge/events.ts';
import { Keymap } from '../../bridge/keymap.ts';
import { ToolModes } from '../engine/unity-native/commands.ts';
import {
  EditorApplication,
  Prefs,
  ShortcutManager,
  ShortcutModifiers,
  ShortcutStage,
  Tool,
  ToolContext,
  ToolManager,
  Tools,
} from '../unity/editor.ts';
import { Event, EventType, GUIUtility, IS_MAC, KeyCode, keyCodeFromDom } from '../unity/imgui.ts';
import { SceneView } from '../unity/sceneview.ts';
import { GizmoTools } from './gizmos/shared-settings.ts';
import { GeneralSettings, sBool } from './settings.ts';

export const ToggleContextId = 'Blendon/Tool Context/Toggle Blendon';

const SlotPages: Partial<Record<Tool, string>> = {
  [Tool.Move]: 'MoveGizmoSettings',
  [Tool.Rotate]: 'RotateGizmoSettings',
  [Tool.Scale]: 'ScaleGizmoSettings',
  [Tool.Transform]: 'TransformGizmoSettings',
};

let started = false;
let installed = false;
let active = false;
let wanted = false;
const listeners = new Set<() => void>();

/** At least one gizmo draws. Each gizmo's switch already folds in the master switch. */
const wantedNow = () => GeneralSettings.Enabled && GizmoTools.some((t) => sBool(t + '.Enabled', true));

const switchTo = (context: ToolContext) => ToolManager.setActiveContext(context);

function onContextChanged() {
  const now = ToolManager.activeContext === ToolContext.Blendon;
  if (now === active) return;
  active = now;
  // The gates read the context when a binding is resolved, and bindings are cached.
  ShortcutManager.invalidate();
  for (const l of [...listeners]) l();
  SceneView.repaintAll();
}

// Every visit starts in GameObject, so Blendon puts its own context in on the first look.
function start() {
  if (started) return;
  started = true;
  ToolManager.onContextChanged(onContextChanged);
  Prefs.onChange(rebind);
  wanted = wantedNow();
  if (wanted) switchTo(ToolContext.Blendon);
  // Read once anyway, the context may have been set before anyone listened.
  onContextChanged();
}

/**
 * After a gizmo switch or the master switch. All off leaves, back on from all off comes back, and a pick of
 * GameObject by hand holds otherwise.
 */
function rebind() {
  const was = wanted;
  wanted = wantedNow();
  if (!wanted) {
    if (active) switchTo(ToolContext.GameObject);
    return;
  }
  if (!active && !was) switchTo(ToolContext.Blendon);
}

/** The Reset button is a fresh visit: back in Blendon's context unless every gizmo is off. */
function restart() {
  wanted = wantedNow();
  switchTo(wanted ? ToolContext.Blendon : ToolContext.GameObject);
}

/** A built-in slot a context resolves, not View or a custom tool. */
const isSlot = (tool: Tool) =>
  tool === Tool.Move || tool === Tool.Rotate || tool === Tool.Scale || tool === Tool.Rect || tool === Tool.Transform;

// hotControl as the press found it, before Unity's own tool (which runs ahead of these hooks) could release it.
let hotBeforeTool = 0;

export const EscapeGuard = {
  /**
   * An Escape the Editor would answer by leaving the context. A custom tool steps back instead and the view
   * tool ignores it, so both pass. With Blendon or every gizmo off the context holds Unity's tools only.
   */
  holds(ev: Event) {
    return (
      ev.type === EventType.KeyDown &&
      ev.keyCode === KeyCode.Escape &&
      sBool('GeneralSettings.EscapeKeepsContext', true) &&
      wantedNow() &&
      !Tools.viewToolActive &&
      isSlot(Tools.current)
    );
  },

  /** After a Blendon tool's pass, so the gizmo's own Escape (a drag, a typed value, a vertex pick) comes first. */
  afterTool(ev: Event) {
    if (EscapeGuard.holds(ev)) ev.use();
  },

  /** Before Unity's own tool in a slot. A press with one of its handles held is that handle's to cancel. */
  beforeUnityTool(ev: Event) {
    if (EscapeGuard.holds(ev) && hotBeforeTool === 0 && GUIUtility.hotControl === 0) ev.use();
  },
};

function onBeforeSceneGui() {
  const ev = Event.current;
  if (ev.type === EventType.KeyDown && ev.keyCode === KeyCode.Escape) hotBeforeTool = GUIUtility.hotControl;
}

// Last of the scene hooks, so a grab, a box, a pie and the tool's own pass had the Escape first.
function onToolsPass() {
  const ev = Event.current;
  if (active) {
    if (BlendonContext.ownsSlot(Tools.current)) EscapeGuard.afterTool(ev);
    else EscapeGuard.beforeUnityTool(ev);
  }
  // TryPopToolState, on whatever the guard let through.
  ToolManager.escapeToGameObject(ev);
  hotBeforeTool = 0;
}

// A click on something that takes no focus leaves the keys with the page's body.
let pointerInDock = false;
const onPagePointer = (e: PointerEvent) =>
  void (pointerInDock = e.target instanceof Element && !!e.target.closest('[data-playground]'));

// Toggle Blendon works in every window, so the settings window hears it too. The Scene view has its own route.
function onPageKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.repeat) return;
  const t = e.target instanceof HTMLElement ? e.target : null;
  if (!t || t.closest('[role=application]')) return;
  if (!t.closest('[data-playground]') && !(t === document.body && pointerInDock)) return;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
  let mods = 0;
  if (e.shiftKey) mods |= ShortcutModifiers.Shift;
  if (e.altKey) mods |= ShortcutModifiers.Alt;
  if (IS_MAC ? e.metaKey : e.ctrlKey) mods |= ShortcutModifiers.Action;
  if (IS_MAC && e.ctrlKey) mods |= ShortcutModifiers.Control;
  if (!ShortcutManager.matches(ToggleContextId, keyCodeFromDom(e.code, e.key), mods)) return;
  e.preventDefault();
  ContextSwitch.toggle();
  for (const l of ShortcutManager.onTriggered) l(ToggleContextId, ShortcutStage.Begin);
}

/** Game Object (Blendon) is the active tool context: the one read for everything that follows the context. */
export function blendonContextActive() {
  start();
  return active;
}

export const BlendonContext = {
  /** For useSyncExternalStore, with blendonContextActive as the snapshot. */
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  /** A built-in slot resolves to Blendon's tool there, else to Unity's own. */
  ownsSlot(tool: Tool) {
    const page = SlotPages[tool];
    return blendonContextActive() && !!page && GeneralSettings.Enabled && sBool(page + '.Enabled', true);
  },
};

/** Toggle Blendon's key as the profile holds it, '' when unbound. */
export const toggleBlendonKey = () => Keymap.binding(ToggleContextId) ?? '';

export const ContextSwitch = {
  /** Between Blendon's context and GameObject, the only other one the demo has. Only the master switch parks it. */
  toggle() {
    start();
    switchTo(active ? ToolContext.GameObject : ToolContext.Blendon);
  },

  install() {
    if (installed) return;
    installed = true;
    start();
    // The scene's settings are in now, so what start() read from the defaults is checked again.
    rebind();
    ShortcutManager.register(ToggleContextId, () => ContextSwitch.toggle(), false, 'B');
    // The Editor's Cycle Tool Modes steps through the contexts, of which Blendon's is the second.
    ToolModes.cycle = () =>
      ToolManager.setActiveContext(
        ToolManager.activeContext === ToolContext.Blendon ? ToolContext.GameObject : ToolContext.Blendon,
      );
    SceneView.beforeSceneGui.add(onBeforeSceneGui);
    SceneView.duringSceneGui.add(onToolsPass);
    document.addEventListener('keydown', onPageKey);
    document.addEventListener('pointerdown', onPagePointer, true);
    PlaygroundEvents.on('reset', () => EditorApplication.delayCall(restart));
  },
};
