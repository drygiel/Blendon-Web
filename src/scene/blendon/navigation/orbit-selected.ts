// OrbitSelected: middle-mouse orbit around the selection, with the Alt axis snap into ortho.
import { EditorApplication, ShortcutManager, ShortcutStage, type ShortcutArguments } from '../../unity/editor.ts';
import { EditorGUIUtility, HandleUtility, Handles, MouseCursor } from '../../unity/handles.ts';
import { Event, EventType, FocusType, GUIUtility, KeyCode, MouseButton } from '../../unity/imgui.ts';
import { Quaternion, Rect, Vector3 } from '../../unity/math.ts';
import type { Transform } from '../../unity/scene.ts';
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
  ShortcutTips,
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
const RollShortcutId = 'Blendon/Quick Roll';
const MaxPivotDepthShare = 0.75;
const RotationLockNoticeSeconds = 2;

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
  if (args.stage === ShortcutStage.End) {
    ShortcutTips.note(ShortcutId);
    SceneTutorial.reportShortcut(ShortcutId);
  }
  st.lastView?.repaint();
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
  if (st.isPanning) Pan.endPanSession();
  st.isPanning = false;
  QuickRoll.reset();
  input.end();
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

  if (e.type === EventType.Layout && (clutchHeld || input.isActive)) HandleUtility.addDefaultControl(controlId);

  if (input.isActive && OrbitSelectedSettings.AltSnapEnabled && !st.isPanning && !QuickRoll.isRolling)
    handleSnapModifierStateChange(view, ModifierKeys.isHeld(OrbitSelectedSettings.SnapModifier, e));

  if (view.isRotationLocked) {
    if (clutchHeld) {
      const pos = e.mousePosition.withX(e.mousePosition.x - 100);
      if (!st.lockNoticeShown) {
        st.lockNoticeShown = true;
        GizmoHud.showError(view, 'Scene View rotation is locked', pos, RotationLockNoticeSeconds);
      } else GizmoHud.updateErrorPosition(view, pos);
    }
  } else st.lockNoticeShown = false;

  const cancel =
    (e.type === EventType.KeyDown && e.keyCode === KeyCode.Escape) ||
    (e.type === EventType.MouseDown && e.button === 1);
  if (input.isActive && cancel) {
    cancelOrbitDrag(view, controlId);
    e.use();
    return;
  }

  const starting = (st.shortcutHeld || QuickRoll.armed) && !input.isActive && e.button === MouseButton.MiddleMouse;
  switch (e.type) {
    case EventType.MouseDown:
    case EventType.MouseDrag:
      if (starting) {
        st.trackedButton = e.button;
        startOrbitDrag(view, e, controlId);
      } else if (
        e.type === EventType.MouseDrag &&
        input.isActive &&
        GUIUtility.hotControl === controlId &&
        e.button === st.trackedButton
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

  if (input.isActive && e.isMouse && e.button === st.trackedButton) e.use();
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
  st.snapModifierHeld = ModifierKeys.isHeld(OrbitSelectedSettings.SnapModifier, e);
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
    if (OrbitSelectedSettings.AltSnapEnabled && ModifierKeys.isHeld(OrbitSelectedSettings.SnapModifier, e)) {
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
  view.orthographic = true;
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
  view.orthographic = false;
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
