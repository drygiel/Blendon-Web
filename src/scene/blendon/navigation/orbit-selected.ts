// OrbitSelected: middle-mouse orbit around the selection, with the Alt axis snap into ortho. A middle click
// without a drag stands in for the Editor's Focus.
import {
  EditorApplication,
  ShortcutManager,
  ShortcutStage,
  parseBinding,
  type ShortcutArguments,
} from '../../unity/editor.ts';
import { EditorGUIUtility, HandleUtility, Handles, MouseCursor } from '../../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility, KeyCode, MouseButton } from '../../unity/imgui.ts';
import { Quaternion, Rect, Vector2, Vector3 } from '../../unity/math.ts';
import type { GameObject, Transform } from '../../unity/scene.ts';
import { Camera, SceneView } from '../../unity/sceneview.ts';
import { withFade } from '../color.ts';
import {
  CursorWrapTracker,
  EditorRaycastUtility,
  ModalViewportGate,
  ModifierKey,
  ModifierKeys,
  SceneTutorial,
  SelectionCache,
} from '../foundation.ts';
import { GizmoColors } from '../gizmos/colors.ts';
import { GizmoHud } from '../gizmos/hud.ts';
import { DrawPrimitives } from '../gizmos/rendering.ts';
import { SelectionPivot } from '../gizmos/selection-pivot.ts';
import { SharedGizmoSettings } from '../gizmos/shared-settings.ts';
import { VertexSnappingUtility } from '../gizmos/vertex-snapping.ts';
import { GeneralSettings, sBool, sModifier, sNum } from '../settings.ts';
import { TurntableOrbit, ViewOrbitTween, ViewProjection } from './camera.ts';
import { Pan } from './pan.ts';
import { QuickRoll } from './quick-roll.ts';

const K = 'OrbitSelectedSettings.';
export const OrbitSelectedSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(K + 'Enabled', true);
  },
  get ShowPivotDot() {
    return sBool(K + 'ShowPivotDot', true);
  },
  get Depth() {
    return sBool(K + 'Depth', true);
  },
  get HorizontalOrbitDegreesPerPixel() {
    return sNum(K + 'HorizontalOrbitDegreesPerPixel', 0.25);
  },
  get VerticalTiltDegreesPerPixel() {
    return sNum(K + 'VerticalTiltDegreesPerPixel', 0.2);
  },
  get AltSnapEnabled() {
    return sBool(K + 'AltSnapEnabled', true);
  },
  get SnapModifier() {
    return sModifier(K + 'SnapModifier', ModifierKey.Alt);
  },
  get SnapThresholdDegrees() {
    return sNum(K + 'SnapThresholdDegrees', 12);
  },
  get RollEnabled() {
    return sBool(K + 'RollEnabled', true);
  },
  get RollThresholdPixels() {
    return sNum(K + 'RollThresholdPixels', 6);
  },
  get AnimationEnabled() {
    return sBool(K + 'AnimationEnabled', GeneralSettings.AnimationEnabled);
  },
};

const ShortcutId = 'Blendon/Orbit Selected';
const RollShortcutId = 'Blendon/Orbit Selected/Quick Roll';
const MaxPivotDepthShare = 0.75;
const RotationLockNoticeSeconds = 2;
// Unity's own click-vs-drag distance for a mouse shortcut. Shorter is a click, not an orbit.
const ClickSlop = 6;
// Scene View/Focus on its Editor default. The orbit's live binding on that key covers the command.
const EditorFocusKey = 'Mouse 2';

const input = new CursorWrapTracker();

/** The 12 axis-aligned views Alt snaps to: four headings each for top and bottom. */
const AxisViewRotations = [
  Quaternion.euler(0, 0, 0),
  Quaternion.euler(0, 180, 0),
  Quaternion.euler(0, 90, 0),
  Quaternion.euler(0, -90, 0),
  Quaternion.euler(90, 0, 0),
  Quaternion.euler(90, 90, 0),
  Quaternion.euler(90, 180, 0),
  Quaternion.euler(90, 270, 0),
  Quaternion.euler(-90, 0, 0),
  Quaternion.euler(-90, 90, 0),
  Quaternion.euler(-90, 180, 0),
  Quaternion.euler(-90, 270, 0),
];

const st = {
  lastView: null as SceneView | null,
  shortcutHeld: false,
  trackedButton: -1,
  snapModifierHeld: false,
  // The snap key came with the binding (Alt+LMB), so it snaps only once pressed again.
  snapKeyFromBinding: false,
  // A right press ignored mid-drag (cancel off). Its drags may then carry the right button.
  rightPressIgnored: false,
  // Press of the orbit button that has not moved past ClickSlop yet. Null once it is a drag or let go.
  pressedAt: null as Vector2 | null,
  pressedIn: null as SceneView | null,
  // Whether the orbit's clutch began for that press. The site's Shortcut Manager ends it before the release's pass.
  pressHeld: false,
  isPanning: false,
  activeControlId: -1,
  initialPivot: Vector3.zero,
  initialRotation: Quaternion.identity,
  initialOrthographic: false,
  initialSize: 1,
  lockNoticeShown: false,
};

/** Orbit centre, offset and start rotation of the running drag. */
const ctx = {
  center: Vector3.zero,
  startOffset: Vector3.zero,
  startRotation: Quaternion.identity,
  isValid: false,

  capture(view: SceneView, targets: Transform[]) {
    ctx.center = VertexSnappingUtility.hasPick
      ? VertexSnappingUtility.pickedPoint
      : targets.length === 0
        ? OrbitSelectedSettings.Depth
          ? EditorRaycastUtility.getScreenPoint()
          : view.pivot
        : selectionCenter(targets);
    ctx.startOffset = view.pivot.sub(ctx.center);
    ctx.startRotation = view.rotation;
    ctx.isValid = true;
  },

  reseat(pivot: Vector3, rotation: Quaternion) {
    const delta = rotation.mul(Quaternion.inverse(ctx.startRotation));
    ctx.startOffset = Quaternion.inverse(delta).mulV(pivot.sub(ctx.center));
  },
};

function selectionCenter(targets: Transform[]) {
  return targets.length === 1
    ? targets[0].position
    : SelectionPivot.ofMultiple(SharedGizmoSettings.PivotPoint, targets);
}

export const OrbitSelected = {
  ShortcutId,
  RollShortcutId,
  Settings: OrbitSelectedSettings,
  AxisViewRotations,

  get isOrbiting() {
    return input.isActive;
  },

  /** The point a drag, the gizmo's axis snap and the numpad steps all swing about. */
  resolveOrbitCenter(view: SceneView) {
    if (VertexSnappingUtility.hasPick) return VertexSnappingUtility.pickedPoint;
    const t = SelectionCache.transforms;
    return t.length === 0 ? view.pivot : selectionCenter(t);
  },

  repaintLastSceneView() {
    st.lastView?.repaint();
  },

  /** Closest of the 12 axis views; always answers. */
  nearestAxisRotation(rotation: Quaternion): [Quaternion, number] {
    let best = Quaternion.identity,
      bestAngle = Infinity;
    for (const c of AxisViewRotations) {
      const a = Quaternion.angle(rotation, c);
      if (a < bestAngle) {
        bestAngle = a;
        best = c;
      }
    }
    return [best, bestAngle];
  },

  install() {
    ShortcutManager.register(ShortcutId, orbitShortcut, true, 'Mouse 2');
    SceneView.duringSceneGui.add(onSceneGUI);
    EditorApplication.focusChanged.add((has) => {
      if (!has) forceReleaseStuckDrag();
    });
  },
};

function orbitShortcut(args: ShortcutArguments) {
  st.shortcutHeld = args.stage !== ShortcutStage.End;
  // Tutorial only. Orbit never raises a shortcut tip.
  if (args.stage === ShortcutStage.End) SceneTutorial.reportShortcut(ShortcutId);
  st.lastView?.repaint();
}

function startsOn(button: number) {
  return (
    (st.shortcutHeld && button === dragButton(ShortcutId)) || (QuickRoll.armed && button === dragButton(RollShortcutId))
  );
}

// A keyboard key has no button of its own, so the drag stays on the middle one.
function dragButton(id: string) {
  const keyCode = ShortcutManager.getShortcutBinding(id)?.keyCode ?? KeyCode.None;
  return keyCode >= KeyCode.Mouse0 && keyCode <= KeyCode.Mouse6 ? keyCode - KeyCode.Mouse0 : MouseButton.MiddleMouse;
}

function forceReleaseStuckDrag() {
  st.shortcutHeld = false;
  QuickRoll.shortcutHeld = false;
  QuickRoll.armed = false;
  if (!input.isActive) return;
  resetDragState(st.activeControlId);
  st.lastView?.repaint();
}

function resetDragState(controlId: number) {
  if (GUIUtility.hotControl === controlId) GUIUtility.hotControl = 0;
  st.activeControlId = -1;
  st.trackedButton = -1;
  st.snapModifierHeld = false;
  st.snapKeyFromBinding = false;
  st.rightPressIgnored = false;
  st.pressedAt = null;
  if (st.isPanning) Pan.endPanSession();
  st.isPanning = false;
  QuickRoll.reset();
  input.end();
}

// The plain orbit waits out the slop, so a click stays a click. A roll flick is judged from the press.
function stillAClick(view: SceneView, e: Event) {
  if (QuickRoll.armed) return false;
  // Pressed outside this view: the drag counts from where it is first seen.
  if (!st.pressedAt || st.pressedIn !== view) {
    st.pressedAt = e.mousePosition;
    st.pressedIn = view;
  }
  return e.mousePosition.sub(st.pressedAt).magnitude <= ClickSlop;
}

// Let go inside the slop with the clutch held: the click the orbit's binding took from the Editor's Focus.
function handleRelease(view: SceneView, e: Event) {
  const pressedAt = st.pressedAt;
  if (e.button !== dragButton(ShortcutId) || st.pressedIn !== view || !pressedAt) return;
  st.pressedAt = null;
  if (!st.pressHeld || e.mousePosition.sub(pressedAt).magnitude > ClickSlop) return;
  if (coversEditorFocus()) focusOn(view, pressedAt);
}

// On any other key the Editor's Focus is still there and answers the click itself.
function coversEditorFocus() {
  const ours = ShortcutManager.getShortcutBinding(ShortcutId);
  const focus = parseBinding(EditorFocusKey);
  return !!ours && !!focus && ours.keyCode === focus.keyCode && ours.modifiers === focus.modifiers;
}

// What the Editor's Focus does: the pivot goes to the clicked surface, the camera keeps its depth and rotation.
function focusOn(view: SceneView, guiPoint: Vector2) {
  const picked = HandleUtility.pickGameObject(guiPoint, false) as GameObject | null;
  if (!picked) return;
  const ray = HandleUtility.guiPointToWorldRay(guiPoint);
  const hit = EditorRaycastUtility.raycast(ray, null, Infinity, [picked.transform]);
  if (!hit) return;
  const forward = view.rotation.mulV(Vector3.forward);
  let size = view.size;
  // A nearer pivot needs a smaller size for the same camera distance.
  if (!view.orthographic) {
    const camera = view.pivot.sub(forward.mul(view.cameraDistance));
    size *= Vector3.dot(hit.point.sub(camera), forward) / view.cameraDistance;
  }
  view.lookAt(hit.point, view.rotation, size, view.orthographic, false);
}

function onSceneGUI(view: SceneView) {
  st.lastView = view;
  const e = Event.current;
  const controlId = GUIUtility.getControlID(FocusType.Passive);
  const clutchHeld = st.shortcutHeld || QuickRoll.shortcutHeld;

  // MouseMove only fires with no button held: a drag we think is running missed its release.
  if (e.type === EventType.MouseMove && (clutchHeld || input.isActive)) forceReleaseStuckDrag();

  if (!OrbitSelectedSettings.Enabled || ModalViewportGate.isBlocked) {
    if (input.isActive) stopOrbitDrag(view, controlId);
    return;
  }

  const shouldRelease = e.rawType === EventType.MouseUp && e.button === st.trackedButton;
  if (shouldRelease && input.isActive) stopOrbitDrag(view, controlId);

  // The site's Shortcut Manager begins the clutch before this pass, so the press also says whether it did.
  if (e.type === EventType.MouseDown && !input.isActive && e.button === dragButton(ShortcutId)) {
    st.pressedAt = e.mousePosition;
    st.pressedIn = view;
    st.pressHeld = st.shortcutHeld;
  }

  if (e.type === EventType.MouseUp && !input.isActive) handleRelease(view, e);

  if (e.type === EventType.Layout && (clutchHeld || input.isActive)) HandleUtility.addDefaultControl(controlId);

  if (input.isActive && OrbitSelectedSettings.AltSnapEnabled && !st.isPanning && !QuickRoll.isRolling)
    handleSnapModifierStateChange(view, snapKeyHeld(e));

  if (view.isRotationLocked) {
    if (clutchHeld) {
      const pos = e.mousePosition.withX(e.mousePosition.x - 100);
      if (!st.lockNoticeShown) {
        st.lockNoticeShown = true;
        GizmoHud.showError(view, 'Scene View rotation is locked', pos, RotationLockNoticeSeconds);
      } else GizmoHud.updateErrorPosition(view, pos);
    }
  } else st.lockNoticeShown = false;

  // rawType, so a right press another hook already used still counts.
  const rightPress = e.rawType === EventType.MouseDown && e.button === MouseButton.RightMouse;
  const cancel =
    (e.type === EventType.KeyDown && e.keyCode === KeyCode.Escape) || (rightPress && GeneralSettings.RmbCancelEnabled);
  if (input.isActive && cancel) {
    cancelOrbitDrag(view, controlId);
    e.use();
    return;
  }

  // Cancel off: the orbit eats the whole right click, so no tool or fly-through below takes it.
  if (input.isActive && isRightClickPart(e)) {
    st.rightPressIgnored ||= rightPress;
    e.use();
    return;
  }

  const starting = !input.isActive && startsOn(e.button);
  switch (e.type) {
    case EventType.MouseDown:
    case EventType.MouseDrag:
      if (starting) {
        if (stillAClick(view, e)) {
          e.use();
          break;
        }
        st.trackedButton = e.button;
        st.pressedAt = null;
        startOrbitDrag(view, e, controlId);
      } else if (
        e.type === EventType.MouseDrag &&
        input.isActive &&
        GUIUtility.hotControl === controlId &&
        isDragButton(e.button)
      ) {
        if (st.isPanning) {
          Pan.updatePanSession(view, e.delta);
          e.use();
        } else if (QuickRoll.isRolling) QuickRoll.executeDrag(view, e);
        else executeOrbitDrag(view, e);
      }
      break;
    case EventType.MouseUp:
      if (input.isActive && GUIUtility.hotControl === controlId && e.button === st.trackedButton)
        stopOrbitDrag(view, controlId);
      break;
    case EventType.Repaint:
      if (input.isActive && OrbitSelectedSettings.ShowPivotDot && !st.isPanning && !QuickRoll.isRolling) drawPivotDot();
      break;
  }

  if (st.isPanning && input.isActive)
    EditorGUIUtility.addCursorRect(new Rect(0, 0, view.position.width, view.position.height), MouseCursor.Pan);

  GizmoHud.drawError(view);

  if (input.isActive && e.isMouse && isDragButton(e.button)) e.use();
}

// rawType, like the cancel. The site has no ContextClick: its menu opens on the release.
function isRightClickPart(e: Event) {
  return (e.rawType === EventType.MouseDown || e.rawType === EventType.MouseUp) && e.button === MouseButton.RightMouse;
}

function isDragButton(button: number) {
  return button === st.trackedButton || (st.rightPressIgnored && button === MouseButton.RightMouse);
}

function startOrbitDrag(view: SceneView, e: Event, controlId: number) {
  GUIUtility.hotControl = controlId;
  st.activeControlId = controlId;
  ViewOrbitTween.stop();
  st.initialPivot = view.pivot;
  st.initialRotation = view.rotation;
  st.initialOrthographic = view.orthographic;
  st.initialSize = view.size;

  st.isPanning = view.isRotationLocked;
  if (st.isPanning) {
    input.begin();
    Pan.beginPanSession(view);
    view.repaint();
    e.use();
    return;
  }

  if (QuickRoll.armed && OrbitSelectedSettings.RollEnabled) {
    QuickRoll.begin(e.mousePosition);
    input.begin();
    view.repaint();
    e.use();
    return;
  }

  ctx.capture(view, SelectionCache.transforms);
  input.begin();
  st.snapKeyFromBinding = bindingHolds(OrbitSelectedSettings.SnapModifier);
  st.snapModifierHeld = snapKeyHeld(e);
  // Orbiting always leaves orthographic, unless the axis snap is held to stay there.
  if (view.orthographic && (!OrbitSelectedSettings.AltSnapEnabled || !st.snapModifierHeld))
    exitOrthoToPerspective(view);
  view.repaint();
  e.use();
}

function cancelOrbitDrag(view: SceneView, controlId: number) {
  if (!st.isPanning) {
    view.orthographic = st.initialOrthographic;
    view.rotation = st.initialRotation;
    view.size = st.initialSize;
  }
  view.pivot = st.initialPivot;
  stopOrbitDrag(view, controlId);
}

function executeOrbitDrag(view: SceneView, e: Event) {
  input.update(e.delta, view.cameraViewport.size);
  if (ctx.isValid) {
    const target = TurntableOrbit.rotate(
      ctx.startRotation,
      input.totalDelta,
      OrbitSelectedSettings.HorizontalOrbitDegreesPerPixel,
      OrbitSelectedSettings.VerticalTiltDegreesPerPixel,
    );
    let applied = target;
    let snapHandled = false;
    if (OrbitSelectedSettings.AltSnapEnabled && snapKeyHeld(e)) {
      if (!view.orthographic) {
        const r = tryEnterOrthoSnap(view, target);
        snapHandled = r.ok;
        applied = r.applied;
      } else {
        const snapped = tryGetAxisSnap(target);
        if (snapped) {
          applied = snapped;
          SceneTutorial.report('OrbitAxisSnap');
        } else exitOrthoToPerspective(view);
      }
    }
    if (!snapHandled) {
      let pivot = TurntableOrbit.pivotAround(ctx.center, ctx.startOffset, ctx.startRotation, applied);
      if (view.orthographic) pivot = ViewProjection.pivotAtCenterDepth(pivot, ctx.center, applied);
      view.pivot = pivot;
      view.rotation = applied;
    }
  }
  view.repaint();
  e.use();
}

// A snap key held since the press that started the drag counts only after one release.
function snapKeyHeld(e: Event) {
  const held = ModifierKeys.isHeld(OrbitSelectedSettings.SnapModifier, e);
  if (!held) st.snapKeyFromBinding = false;
  return held && !st.snapKeyFromBinding;
}

function bindingHolds(modifier: ModifierKey) {
  const combination = ShortcutManager.getShortcutBinding(ShortcutId);
  return !!combination && (combination.modifiers & ModifierKeys.toShortcutModifiers(modifier)) !== 0;
}

function handleSnapModifierStateChange(view: SceneView, held: boolean) {
  if (held === st.snapModifierHeld) return;
  st.snapModifierHeld = held;
  if (!ctx.isValid) return;
  if (held && !view.orthographic) {
    tryEnterOrthoSnap(view, view.rotation);
    view.repaint();
  } else if (!held && view.orthographic) {
    exitOrthoToPerspective(view);
    view.repaint();
  }
}

function tryEnterOrthoSnap(view: SceneView, rotation: Quaternion) {
  if (view.orthographic) return { ok: false, applied: rotation };
  const snapped = tryGetAxisSnap(rotation);
  if (!snapped) return { ok: false, applied: rotation };
  let pivot = TurntableOrbit.pivotAround(ctx.center, ctx.startOffset, ctx.startRotation, snapped);
  pivot = ViewProjection.pivotAtCenterDepth(pivot, ctx.center, snapped);
  view.size = ViewProjection.apparentHalfHeight(view, ctx.center);
  // The axis snap is the one view change that never animates: it follows the held key frame for frame.
  view.setOrthographicInstant(true);
  view.pivot = pivot;
  view.rotation = snapped;
  SceneTutorial.report('OrbitAxisSnap');
  return { ok: true, applied: snapped };
}

function exitOrthoToPerspective(view: SceneView) {
  const rotation = view.rotation;
  const targetHalfHeight = view.size;
  if (ctx.isValid) {
    const pivot = clampPivotDepth(
      view,
      TurntableOrbit.pivotAround(ctx.center, ctx.startOffset, ctx.startRotation, rotation),
      rotation,
      targetHalfHeight,
    );
    ctx.reseat(pivot, rotation);
    view.pivot = pivot;
  }
  view.size = ViewProjection.perspectiveSizeForHalfHeight(view, ctx.center, view.pivot, rotation, targetHalfHeight);
  view.setOrthographicInstant(false);
}

/** Keeps a usable pivot behind the orbit centre when leaving ortho zoomed in close. */
function clampPivotDepth(view: SceneView, pivot: Vector3, rotation: Quaternion, halfHeight: number) {
  const forward = rotation.mulV(Vector3.forward);
  const depth = Vector3.dot(ctx.center.sub(pivot), forward);
  const maxDepth = MaxPivotDepthShare * ViewProjection.distanceForHalfHeight(view, halfHeight);
  return depth > maxDepth ? pivot.add(forward.mul(depth - maxDepth)) : pivot;
}

function tryGetAxisSnap(rotation: Quaternion): Quaternion | null {
  const [snapped, angle] = OrbitSelected.nearestAxisRotation(rotation);
  return angle <= OrbitSelectedSettings.SnapThresholdDegrees ? snapped : null;
}

function stopOrbitDrag(view: SceneView, controlId: number) {
  resetDragState(controlId);
  view.repaint();
}

// Only meaningful when the centre is the point raycast under the cursor (nothing selected).
function drawPivotDot() {
  if (SelectionCache.count > 0 || !OrbitSelectedSettings.Depth) return;
  let color = GizmoColors.CenterDot;
  if (EditorRaycastUtility.isOccluded(ctx.center, Camera.current)) color = withFade(color, 0.5);
  Handles.color = color;
  DrawPrimitives.drawCenterDot(ctx.center);
}
