// Zoom: the wheel (Blender's Continue/Dolly/Scale methods, zoom to cursor) and Num +/-.
import { ShortcutManager } from '../../unity/editor.ts';
import { Event, EventType } from '../../unity/imgui.ts';
import { Mathf, Rect, type Vector3 } from '../../unity/math.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { EditorRaycastUtility, ModalViewportGate, SceneTutorial } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { GeneralSettings, sBool, sEnum, sNum } from '../settings.ts';
import { ViewProjection } from './camera.ts';

export const ZoomMethod = { Continue: 0, Dolly: 1, Scale: 2 } as const;
const K = 'ZoomSettings.';
export const ZoomSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(K + 'Enabled', true);
  },
  get ZoomToCursor() {
    return sBool(K + 'ZoomToCursor', true);
  },
  get Method() {
    return sEnum(K + 'Method', ['Continue', 'Dolly', 'Scale'], ZoomMethod.Scale);
  },
  get Speed() {
    return sNum(K + 'Speed', 0.2);
  },
  get InvertDirection() {
    return sBool(K + 'InvertDirection', false);
  },
  get KeyboardEnabled() {
    return sBool(K + 'KeyboardEnabled', true);
  },
  get KeyboardStep() {
    return sNum(K + 'KeyboardStep', 0.2);
  },
};

const MinSize = 0.01;
const MaxSize = 100000;
const NearClipSafetyFactor = 4;
const ZoomInShortcutId = 'Blendon/Zoom/Zoom In';
const ZoomOutShortcutId = 'Blendon/Zoom/Zoom Out';

let pendingSteps = 0;
let pendingView: SceneView | null = null;

export const Zoom = {
  install() {
    SceneView.duringSceneGui.add(onSceneGUI);
    ShortcutManager.register(ZoomInShortcutId, () => requestKeyboardZoom(1), false, 'Num +');
    ShortcutManager.register(ZoomOutShortcutId, () => requestKeyboardZoom(-1), false, 'Num -');
  },
};

function onSceneGUI(view: SceneView) {
  if (!ZoomSettings.Enabled || ModalViewportGate.isBlocked) {
    pendingSteps = 0;
    pendingView = null;
    return;
  }
  const e = Event.current;
  if (e.type === EventType.Repaint) applyPendingKeyboardZoom(view);
  if (e.type !== EventType.ScrollWheel) return;
  // Unity reports positive delta.y scrolling down (zoom out).
  let amount = -e.delta.y;
  if (ZoomSettings.InvertDirection) amount = -amount;
  if (Mathf.Approximately(amount, 0)) return;
  applyZoom(view, amount);
  SceneTutorial.report('ZoomWheel');
  e.use();
  view.repaint();
}

function requestKeyboardZoom(direction: number) {
  // Mid-grab the keypad minus is the sign of the typed value.
  if (ViewportGesture.claimed(direction > 0 ? ZoomInShortcutId : ZoomOutShortcutId)) return;
  if (ModalViewportGate.isBlocked) return;
  if (!ZoomSettings.Enabled || !ZoomSettings.KeyboardEnabled) return;
  const view = SceneView.lastActiveSceneView;
  if (!view) return;
  if (pendingView !== view) pendingSteps = 0;
  pendingView = view;
  pendingSteps += direction;
  view.repaint();
}

function applyPendingKeyboardZoom(view: SceneView) {
  if (pendingSteps === 0 || pendingView !== view) return;
  const steps = pendingSteps;
  pendingSteps = 0;
  pendingView = null;
  const step = Mathf.Clamp(ZoomSettings.KeyboardStep, 0.01, 0.9);
  const factor = Math.pow(1 - step, steps);
  const over = new Rect(0, 0, view.cameraViewport.width, view.cameraViewport.height).contains(
    Event.current.mousePosition,
  );
  const anchor = over ? EditorRaycastUtility.getScreenPoint() : view.pivot;
  applyScale(view, anchor, factor);
  view.repaint();
}

function applyZoom(view: SceneView, amount: number) {
  const cursorPoint = EditorRaycastUtility.getScreenPoint();
  switch (ZoomSettings.Method) {
    case ZoomMethod.Dolly:
      applyDolly(view, amount, ZoomSettings.ZoomToCursor ? cursorPoint : view.pivot);
      break;
    case ZoomMethod.Continue:
      applyScale(view, cursorPoint, Math.exp(-amount * ZoomSettings.Speed));
      break;
    default:
      applyScale(view, cursorPoint, 1 - Mathf.Sign(amount) * ZoomSettings.Speed);
  }
}

function applyScale(view: SceneView, anchor: Vector3, factor: number) {
  const oldSize = Mathf.Clamp(view.size, MinSize, MaxSize);
  const minSize = Math.max(MinSize, nearClipMinSize(view));
  let newSize: number;
  if (ZoomSettings.ZoomToCursor) {
    newSize = Mathf.Clamp(oldSize * factor, minSize, MaxSize);
    // At the size floor a zoom-in still dollies the pivot onto the anchor.
    const applied = factor < 1 ? factor : newSize / oldSize;
    const pivot = anchor.add(view.pivot.sub(anchor).mul(applied));
    view.pivot = view.orthographic ? ViewProjection.pivotAtCenterDepth(pivot, view.pivot, view.rotation) : pivot;
  } else {
    const apparent = ViewProjection.apparentHalfHeight(view, anchor);
    newSize = Mathf.Clamp(oldSize - apparent * (1 - factor), minSize, MaxSize);
  }
  view.size = newSize;
}

function nearClipMinSize(view: SceneView) {
  if (view.orthographic) return MinSize;
  return ViewProjection.pivotSizeForDistance(view, view.camera.nearClipPlane * NearClipSafetyFactor, false);
}

function applyDolly(view: SceneView, amount: number, target: Vector3) {
  const cam = view.camera;
  const dir = ZoomSettings.ZoomToCursor ? target.sub(cam.position).normalized : cam.forward;
  view.pivot = view.pivot.add(dir.mul(amount * ZoomSettings.Speed * view.size));
}
