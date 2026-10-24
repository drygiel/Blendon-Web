// Zoom: the wheel (Blender's Continue/Dolly/Scale methods, toward the cursor, selection or center) and Num +/-.
import { ShortcutManager } from '../../unity/editor.ts';
import { Event, EventType } from '../../unity/imgui.ts';
import { Mathf, Rect, type Vector3 } from '../../unity/math.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { EditorRaycastUtility, ModalViewportGate, SceneTutorial, SelectionCache } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { ShortcutGates } from '../shortcut-gates.ts';
import { GeneralSettings, sBool, sEnum, sNum } from '../settings.ts';
import { ViewProjection } from './camera.ts';
import { OrbitSelected } from './orbit-selected.ts';

export const ZoomMethod = { Continue: 0, Dolly: 1, Scale: 2 } as const;
/** The point that stays put on screen while the wheel or the keypad zooms. */
export const ZoomTarget = { Cursor: 0, Selection: 1, Center: 2 } as const;
const K = 'ZoomSettings.';
export const ZoomSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(K + 'Enabled', true);
  },
  get ContextOnly() {
    return sBool(K + 'ContextOnly', false);
  },
  get ZoomTo() {
    return sEnum(K + 'ZoomTo', ['Cursor', 'Selection', 'Center'], ZoomTarget.Cursor);
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
const MinStep = 0.01;
const MaxStep = 0.9;
// Far geometry under the cursor can stretch a notch to this many plain ones, no more.
const MaxDepthStepBoost = 2;
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
  // Outside Blendon's context the wheel may be Unity's.
  if (!ZoomSettings.Enabled || !ShortcutGates.allows(ZoomSettings.ContextOnly) || ModalViewportGate.isBlocked) {
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
  const factor = notchFactor(ZoomSettings.KeyboardStep, steps);
  const over = new Rect(0, 0, view.cameraViewport.width, view.cameraViewport.height).contains(
    Event.current.mousePosition,
  );
  const cursorPoint = over ? EditorRaycastUtility.getScreenPoint() : view.pivot;
  applyScale(view, anchor(view, cursorPoint), cursorPoint, factor);
  view.repaint();
}

function applyZoom(view: SceneView, amount: number) {
  // Needed even without an anchor, to keep the zoom rate constant at the cursor's depth.
  const cursorPoint = EditorRaycastUtility.getScreenPoint();
  const target = anchor(view, cursorPoint);
  switch (effectiveMethod(ZoomSettings.Method, view.orthographic)) {
    case ZoomMethod.Dolly:
      applyDolly(view, amount, target);
      break;
    case ZoomMethod.Continue:
      applyScale(view, target, cursorPoint, Math.exp(-amount * ZoomSettings.Speed));
      break;
    default:
      applyScale(view, target, cursorPoint, notchFactor(ZoomSettings.Speed, Mathf.Sign(amount)));
  }
}

/** The point that stays put on screen. Null zooms toward the middle of the view. */
function anchor(view: SceneView, cursorPoint: Vector3): Vector3 | null {
  switch (ZoomSettings.ZoomTo) {
    case ZoomTarget.Cursor:
      return cursorPoint;
    case ZoomTarget.Selection:
      return selectionAnchor(view);
    default:
      return null;
  }
}

// Off screen it would stay off screen, and behind the camera zooming in would back away from it.
function selectionAnchor(view: SceneView) {
  if (SelectionCache.count === 0) return null;
  const center = OrbitSelected.resolveOrbitCenter(view);
  const p = view.camera.worldToViewportPoint(center);
  return p.z > 0 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 ? center : null;
}

// Moving the viewpoint changes nothing in ortho, so Dolly zooms by size there.
function effectiveMethod(method: number, orthographic: boolean) {
  return method === ZoomMethod.Dolly && orthographic ? ZoomMethod.Scale : method;
}

// Size factor of `direction` notches (negative = out). Out is the exact reciprocal of in.
function notchFactor(step: number, direction: number) {
  return Math.pow(1 - Mathf.Clamp(step, MinStep, MaxStep), direction);
}

/** Scales size around the anchor. Without one the step is sized from the depth probe, as the pivot can't follow. */
function applyScale(view: SceneView, anchor: Vector3 | null, depthProbe: Vector3, factor: number) {
  const oldSize = Mathf.Clamp(view.size, MinSize, MaxSize);
  const minSize = Math.max(MinSize, nearClipMinSize(view));
  let newSize: number;
  if (anchor) {
    newSize = Mathf.Clamp(oldSize * factor, minSize, MaxSize);
    // At the size floor a zoom-in still dollies the pivot onto the anchor.
    const applied = factor < 1 ? factor : newSize / oldSize;
    const pivot = anchor.add(view.pivot.sub(anchor).mul(applied));
    view.pivot = view.orthographic ? ViewProjection.pivotAtCenterDepth(pivot, view.pivot, view.rotation) : pivot;
  } else {
    const apparent = ViewProjection.apparentHalfHeight(view, depthProbe);
    newSize = depthScaledSize(oldSize, apparent, factor, minSize);
  }
  view.size = newSize;
}

// The step follows the depth under the cursor, but a far hit must not throw the view to the clamp.
function depthScaledSize(oldSize: number, apparentHalfHeight: number, factor: number, minSize: number) {
  const share = 1 - factor;
  const limit = oldSize * Math.abs(share) * MaxDepthStepBoost;
  const step = Mathf.Clamp(apparentHalfHeight * share, -limit, limit);
  return Mathf.Clamp(oldSize - step, minSize, MaxSize);
}

function nearClipMinSize(view: SceneView) {
  if (view.orthographic) return MinSize;
  return ViewProjection.pivotSizeForDistance(view, view.camera.nearClipPlane * NearClipSafetyFactor, false);
}

/** Dollies along the ray to the anchor, else along forward. */
function applyDolly(view: SceneView, amount: number, anchor: Vector3 | null) {
  const cam = view.camera;
  const dir = anchor ? anchor.sub(cam.position).normalized : cam.forward;
  view.pivot = view.pivot.add(dir.mul(amount * ZoomSettings.Speed * view.size));
}
