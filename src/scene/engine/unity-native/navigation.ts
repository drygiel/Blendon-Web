// The Editor's own Scene view navigation (SceneViewMotion): Alt+LMB orbits the pivot, the middle button
// pans, Alt+RMB and the wheel zoom, a right drag looks around with WASD/QE to fly, and the View tool pans
// with the left button. Runs after duringSceneGui, on what the plugin left unused, so a plugin's live
// binding on the same press wins, as it does in the Editor.
import {
  EditorApplication,
  ShortcutManager,
  ShortcutStage,
  Tool,
  Tools,
  type ShortcutArguments,
} from '../../unity/editor.ts';
import { EditorGUIUtility } from '../../unity/handles.ts';
import { Event, EventType, GUIUtility, KeyCode } from '../../unity/imgui.ts';
import { iconUrl } from '../../unity/icons.ts';
import { Mathf, Quaternion, Rect, Vector2, Vector3 } from '../../unity/math.ts';
import type { SceneView } from '../../unity/sceneview.ts';

type Mode = 'orbit' | 'pan' | 'zoom' | 'look';

const Ids = {
  Orbit: 'Scene View/Orbit',
  Pan: 'Scene View/Pan',
  PanShift: 'Scene View/Pan (Shift)',
  Pan2: 'Scene View/Pan 2',
  Zoom: 'Scene View/Zoom',
  Look: 'Scene View/Look Around',
};

// SceneViewMotion's rates: radians per point of drag, and the share of the size one wheel line zooms.
const OrbitRate = 0.003 * Mathf.Rad2Deg;
const WheelRate = 0.015;
const DragZoomRate = 0.003;
// A right press that moves less than this is a click (the context menu), not a look.
const LookSlop = 4;
const FlySpeed = 4;
const FlyFastFactor = 4;
const FlyMaxBoost = 4;

const cursor = (icon: string) => `url(${iconUrl(icon)}) 8 8, default`;
const Cursors: Record<Mode, string> = {
  orbit: cursor('d_ViewToolOrbit'),
  pan: cursor('d_ViewToolMove'),
  zoom: cursor('d_ViewToolZoom'),
  look: cursor('d_ViewToolOrbit'),
};

const FlyKeys: Record<number, Vector3> = {
  [KeyCode.W]: Vector3.forward,
  [KeyCode.S]: Vector3.back,
  [KeyCode.A]: Vector3.left,
  [KeyCode.D]: Vector3.right,
  [KeyCode.E]: Vector3.up,
  [KeyCode.Q]: Vector3.down,
};

const st = {
  /** Armed by a clutch, waiting for its press to reach the pass unused. */
  armed: null as { mode: Mode; button: number } | null,
  mode: null as Mode | null,
  button: -1,
  control: 0,
  pressedAt: Vector2.zero,
  moved: false,
  view: null as SceneView | null,
  fly: new Set<number>(),
  shift: false,
  flyStart: 0,
  lastTick: 0,
};

function clutch(mode: Mode, button: number) {
  return (args: ShortcutArguments) => {
    if (args.stage === ShortcutStage.Begin) st.armed = { mode, button };
    else if (st.armed?.mode === mode) st.armed = null;
  };
}

function orbit(view: SceneView, delta: Vector2) {
  let q = view.rotation;
  q = Quaternion.angleAxis(delta.y * OrbitRate, q.mulV(Vector3.right)).mul(q);
  q = Quaternion.angleAxis(delta.x * OrbitRate, Vector3.up).mul(q);
  view.rotation = q;
}

/** Turns the camera about itself: the pivot swings round the camera's position. */
function look(view: SceneView, delta: Vector2) {
  const camPos = view.camera.position;
  const dist = view.cameraDistance;
  orbit(view, delta);
  view.pivot = camPos.add(view.rotation.mulV(Vector3.forward).mul(dist));
}

/** The pivot through screen space and back, so the grabbed depth follows the cursor. */
function pan(view: SceneView, delta: Vector2) {
  const cam = view.camera;
  const d = delta.mul(EditorGUIUtility.pixelsPerPoint);
  const sp = cam.worldToScreenPoint(view.pivot);
  const moved = cam.screenToWorldPoint(new Vector3(sp.x - d.x, sp.y + d.y, sp.z));
  view.pivot = view.pivot.add(moved.sub(view.pivot));
}

/** HandleUtility.niceMouseDeltaZoom: the dominant axis, right and up zooming in. */
function zoom(view: SceneView, delta: Vector2, fast: boolean) {
  const nice = Math.abs(delta.x) > Math.abs(delta.y) ? delta.x : -delta.y;
  view.size = Math.max(1e-4, view.size * Math.exp(-nice * DragZoomRate * (fast ? 3 : 1)));
}

function flyTick() {
  const view = st.view;
  if (!view || st.mode !== 'look' || st.fly.size === 0) {
    EditorApplication.update.remove(flyTick);
    return;
  }
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - st.lastTick);
  st.lastTick = now;
  let dir = Vector3.zero;
  for (const k of st.fly) dir = dir.add(FlyKeys[k]);
  if (dir.sqrMagnitude < 1e-6) return;
  // Speeds up the longer the keys are held, as the Editor's flythrough does.
  const boost = Math.min(FlyMaxBoost, 1 + (now - st.flyStart) * 0.75);
  const speed = FlySpeed * boost * (st.shift ? FlyFastFactor : 1);
  const step = view.rotation.mulV(dir.normalized).mul(speed * dt);
  view.pivot = view.pivot.add(step);
  view.repaint();
}

function stop() {
  if (st.control && GUIUtility.hotControl === st.control) GUIUtility.hotControl = 0;
  st.mode = null;
  st.button = -1;
  st.fly.clear();
  EditorApplication.update.remove(flyTick);
}

export const UnityNavigation = {
  Ids,

  /** Fly keys go to the flythrough while the right button looks around, not to their shortcuts. */
  capturesKey(keyCode: number) {
    return (
      st.mode === 'look' && (keyCode in FlyKeys || keyCode === KeyCode.LeftShift || keyCode === KeyCode.RightShift)
    );
  },

  get active() {
    return st.mode !== null;
  },

  install() {
    ShortcutManager.registerNative(Ids.Orbit, clutch('orbit', 0), true, 'Alt+Mouse 0');
    // Blendon's Orbit Selected takes the middle button, and Quick Roll Alt+middle, leaving the pans unbound.
    ShortcutManager.registerNative(Ids.Pan, clutch('pan', 2), true, 'Mouse 2');
    ShortcutManager.registerNative(Ids.PanShift, clutch('pan', 2), true, 'Shift+Mouse 2');
    ShortcutManager.registerNative(Ids.Pan2, clutch('pan', 2), true, 'Alt+Mouse 2');
    ShortcutManager.registerNative(Ids.Zoom, clutch('zoom', 1), true, 'Alt+Mouse 1');
    ShortcutManager.registerNative(Ids.Look, clutch('look', 1), true, 'Mouse 1');
    EditorApplication.focusChanged.add((has) => !has && stop());
  },

  onGUI(view: SceneView) {
    const ev = Event.current;
    const id = GUIUtility.getControlID(0);
    st.view = view;

    switch (ev.rawType) {
      case EventType.MouseDown: {
        let start = st.armed && st.armed.button === ev.button ? st.armed.mode : null;
        // The View tool: the left button pans whatever its modifiers don't already claim.
        if (!start && ev.button === 0 && Tools.current === Tool.View && !ev.alt) start = 'pan';
        st.armed = null;
        if (!start || st.mode || ev.type === EventType.Used || GUIUtility.hotControl !== 0) break;
        st.mode = start;
        st.button = ev.button;
        st.control = id;
        st.pressedAt = ev.mousePosition;
        st.moved = false;
        GUIUtility.hotControl = id;
        // The right press stays visible to the context menu, which opens on a release that didn't move.
        if (start !== 'look') ev.use();
        break;
      }

      case EventType.MouseDrag:
        if (!st.mode || GUIUtility.hotControl !== st.control || ev.button !== st.button) break;
        if (!st.moved) {
          if (st.mode === 'look' && ev.mousePosition.sub(st.pressedAt).magnitude < LookSlop) break;
          st.moved = true;
        }
        if (st.mode === 'orbit') orbit(view, ev.delta);
        else if (st.mode === 'look') look(view, ev.delta);
        else if (st.mode === 'pan') pan(view, ev.delta);
        else zoom(view, ev.delta, ev.shift);
        view.repaint();
        ev.use();
        break;

      case EventType.MouseUp:
        if (!st.mode || ev.button !== st.button) break;
        if (st.moved || st.mode !== 'look') ev.use();
        stop();
        view.repaint();
        break;

      case EventType.KeyDown:
        if (st.mode !== 'look') break;
        if (ev.keyCode === KeyCode.LeftShift || ev.keyCode === KeyCode.RightShift) st.shift = true;
        else if (ev.keyCode in FlyKeys) {
          if (st.fly.size === 0) st.flyStart = st.lastTick = performance.now() / 1000;
          st.fly.add(ev.keyCode);
          // A fly key makes the press a look, so letting go opens no menu.
          st.moved = true;
          EditorApplication.update.add(flyTick);
        } else break;
        ev.use();
        break;

      case EventType.KeyUp:
        if (ev.keyCode === KeyCode.LeftShift || ev.keyCode === KeyCode.RightShift) st.shift = false;
        if (st.fly.delete(ev.keyCode)) ev.use();
        break;

      case EventType.ScrollWheel: {
        if (ev.type === EventType.Used || Mathf.Approximately(ev.delta.y, 0)) break;
        view.size = Math.max(1e-4, view.size * (1 + ev.delta.y * WheelRate));
        view.repaint();
        ev.use();
        break;
      }
    }

    if (st.mode && (st.mode !== 'look' || st.moved))
      EditorGUIUtility.addCursorRect(new Rect(0, 0, view.position.width, view.position.height), Cursors[st.mode]);
    else if (Tools.current === Tool.View && GUIUtility.hotControl === 0 && !st.mode)
      EditorGUIUtility.addCursorRect(new Rect(0, 0, view.position.width, view.position.height), Cursors.pan);
  },
};
