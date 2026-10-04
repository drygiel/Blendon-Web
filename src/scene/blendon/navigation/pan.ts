// Pan: Shift + middle-mouse drag, keeping the grabbed point pixel-exactly under the cursor.
import { EditorApplication, ShortcutManager, ShortcutStage, type ShortcutArguments } from '../../unity/editor.ts';
import { EditorGUIUtility, HandleUtility, MouseCursor } from '../../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility, MouseButton } from '../../unity/imgui.ts';
import { Plane, Rect, Vector2, Vector3 } from '../../unity/math.ts';
import { SceneView, type SceneCamera } from '../../unity/sceneview.ts';
import {
  CursorWrapTracker,
  EditorRaycastUtility,
  ModalViewportGate,
  SceneTutorial,
  ShortcutTips,
} from '../foundation.ts';
import { GeneralSettings, sBool } from '../settings.ts';
import { OrbitSelected } from './orbit-selected.ts';

const ShortcutId = 'Blendon/Camera Pan';
const K = 'PanSettings.';
export const PanSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(K + 'Enabled', true);
  },
  get InvertDrag() {
    return sBool(K + 'InvertDrag', false);
  },
  get Depth() {
    return sBool(K + 'Depth', true);
  },
};

const wrap = new CursorWrapTracker();
const st = {
  panning: false,
  hotControl: 0,
  shortcutHeld: false,
  trackedButton: -1,
  lastView: null as SceneView | null,
  hasAnchor: false,
  anchorWorld: Vector3.zero,
  anchorPlane: new Plane(Vector3.forward, 0),
  anchorScreen: Vector2.zero,
  startPivot: Vector3.zero,
  cancelled: false,
};

export const Pan = {
  ShortcutId,
  Settings: PanSettings,

  get isPanning() {
    return st.panning;
  },

  install() {
    ShortcutManager.register(ShortcutId, panShortcut, true, 'Shift+Mouse 2');
    SceneView.duringSceneGui.add(onSceneGUI);
    EditorApplication.focusChanged.add((has) => {
      if (!has) forceRelease();
    });
  },

  /** For gestures that reuse this pan with their own hotControl (OrbitSelected's locked fallback). */
  beginPanSession(view: SceneView) {
    st.hasAnchor = false;
    wrap.begin();
    if (PanSettings.Depth) {
      st.anchorWorld = EditorRaycastUtility.getScreenPoint();
      st.anchorPlane = new Plane(view.camera.forward, st.anchorWorld);
      st.anchorScreen = HandleUtility.worldToGUIPoint(st.anchorWorld);
      st.hasAnchor = true;
    }
  },

  updatePanSession(view: SceneView, delta: Vector2) {
    panning(view, delta);
  },

  endPanSession() {
    st.hasAnchor = false;
    wrap.end();
  },
};

function panShortcut(args: ShortcutArguments) {
  st.shortcutHeld = args.stage !== ShortcutStage.End;
  if (args.stage === ShortcutStage.End) {
    ShortcutTips.note(ShortcutId);
    SceneTutorial.reportShortcut(ShortcutId);
  }
  st.lastView?.repaint();
}

function forceRelease() {
  st.shortcutHeld = false;
  st.cancelled = false;
  if (st.panning) endPan();
  st.lastView?.repaint();
}

function onSceneGUI(view: SceneView) {
  st.lastView = view;
  const e = Event.current;
  const controlId = GUIUtility.getControlID(FocusType.Passive);

  if (e.type === EventType.MouseMove && (st.shortcutHeld || st.panning)) forceRelease();

  if (!PanSettings.Enabled || ModalViewportGate.isBlocked) {
    if (st.panning) endPan();
    return;
  }

  const shouldRelease = !st.shortcutHeld || (e.rawType === EventType.MouseUp && e.button === st.trackedButton);
  if (shouldRelease && st.panning) endPan();
  if (!st.shortcutHeld) st.cancelled = false;

  if (e.type === EventType.Layout && (st.shortcutHeld || st.panning)) HandleUtility.addDefaultControl(controlId);

  if (
    st.panning &&
    e.rawType === EventType.MouseDown &&
    e.button === MouseButton.RightMouse &&
    GeneralSettings.RmbCancelEnabled
  ) {
    st.cancelled = true;
    endPan();
    view.pivot = st.startPivot;
    view.repaint();
    e.use();
    return;
  }

  const canStart = st.shortcutHeld && !st.panning && !st.cancelled && !OrbitSelected.isOrbiting;
  if ((e.type === EventType.MouseDown || e.type === EventType.MouseDrag) && canStart) {
    st.trackedButton = e.button;
    st.panning = true;
    st.hotControl = controlId;
    GUIUtility.hotControl = controlId;
    st.startPivot = view.pivot;
    Pan.beginPanSession(view);
    e.use();
  } else if (
    e.type === EventType.MouseDrag &&
    st.panning &&
    GUIUtility.hotControl === st.hotControl &&
    e.button === st.trackedButton
  ) {
    panning(view, e.delta);
    e.use();
  }

  if (st.panning)
    EditorGUIUtility.addCursorRect(new Rect(0, 0, view.position.width, view.position.height), MouseCursor.Pan);
}

function endPan() {
  st.panning = false;
  st.trackedButton = -1;
  if (GUIUtility.hotControl === st.hotControl) GUIUtility.hotControl = 0;
  Pan.endPanSession();
}

function panning(view: SceneView, delta: Vector2) {
  const cam = view.camera;
  delta = wrap.update(delta, view.cameraViewport.size);
  if (st.hasAnchor) panPixelPerfect(view, cam);
  else panDefault(view, cam, delta);
}

/** Unity's own round trip: the pivot through screen space and back. */
function panDefault(view: SceneView, cam: SceneCamera, delta: Vector2) {
  delta = delta.mul(EditorGUIUtility.pixelsPerPoint);
  let sp = cam.worldToScreenPoint(view.pivot);
  sp = new Vector3(sp.x - delta.x, sp.y + delta.y, sp.z);
  let move = cam.screenToWorldPoint(sp).sub(view.pivot);
  if (PanSettings.InvertDrag) move = move.neg();
  view.pivot = view.pivot.add(move);
  view.repaint();
}

/** The anchor tracks back under the real cursor; inverting mirrors the cursor about its start. */
function panPixelPerfect(view: SceneView, cam: SceneCamera) {
  const cursor = wrap.projectionMousePosition;
  const gui = PanSettings.InvertDrag ? st.anchorScreen.mul(2).sub(cursor) : cursor;
  const ray = HandleUtility.guiPointToWorldRay(gui);
  const [hit, enter] = st.anchorPlane.raycast(ray);
  if (!hit) return;
  const current = ray.getPoint(enter);
  view.pivot = view.pivot.add(st.anchorWorld.sub(current));
  st.anchorPlane = new Plane(cam.forward, st.anchorWorld);
  view.repaint();
}
