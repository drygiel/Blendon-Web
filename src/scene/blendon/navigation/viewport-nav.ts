// ViewportNav: Blender's numpad views - axis views, projection, stepped orbit, reverse, camera.
import { ShortcutManager } from '../../unity/editor.ts';
import { Quaternion, Vector2, Vector3 } from '../../unity/math.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { SceneTutorial, ShortcutTips } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { PieRegistry } from '../piemenus/registry.ts';
import { GeneralSettings, sBool, sNum } from '../settings.ts';
import { TurntableOrbit, ViewOrbitTween } from './camera.ts';
import { OrbitSelected } from './orbit-selected.ts';
import { ViewAlignment, ViewSnap } from './view-snap.ts';

const K = 'ViewportNavSettings.';
export const ViewportNavSettings = {
  get Enabled() {
    return GeneralSettings.Enabled && sBool(K + 'Enabled', true);
  },
  get AnimationEnabled() {
    return sBool(K + 'AnimationEnabled', GeneralSettings.AnimationEnabled);
  },
  get OrbitStepDegrees() {
    return sNum(K + 'OrbitStepDegrees', 15);
  },
};

const P = 'Blendon/Numpad Views/';
export const ViewportNavIds = {
  Front: P + 'Front',
  Back: P + 'Back',
  Right: P + 'Right',
  Left: P + 'Left',
  Top: P + 'Top',
  Bottom: P + 'Bottom',
  Projection: P + 'Toggle Perspective',
  OrbitUp: P + 'Orbit Up',
  OrbitDown: P + 'Orbit Down',
  OrbitLeft: P + 'Orbit Left',
  OrbitRight: P + 'Orbit Right',
  Reverse: P + 'Reverse View',
  Camera: P + 'Align To Camera',
};

const ready = () => ViewportNavSettings.Enabled && !ViewportGesture.busy;
const grabTook = (id: string) => ViewportGesture.claimed(id);
const pieTook = (digit: number) => PieRegistry.tryAccelerator(digit);
const pieTookAny = () => PieRegistry.isOpen() && PieRegistry.tryAccelerator(0);
const target = () => SceneView.lastActiveSceneView;
// Ran: the tutorial hears the key that ran it.
const ticked = (id: string, run: () => unknown) => {
  if (run() !== false) SceneTutorial.reportShortcut(id);
};
const canMove = (v: SceneView | null): v is SceneView => !!v && !v.isRotationLocked;

// The axis view the press went to is kept with it: leaving that view drops the way back.
let prior: { pivot: Vector3; rotation: Quaternion; size: number; axis: number; isPositive: boolean } | null = null;

/**
 * Forgets the way back once the view left its axis view another way (orbit, gizmo, Alt snap). On every pass, not a
 * tick: leaving the view repaints it, and an idle page draws no frames.
 */
function dropLeftPrior(v: SceneView) {
  // Pending, so the flight onto the axis is not mistaken for leaving it.
  if (
    prior &&
    !(
      ViewOrbitTween.pendingOrthographic(v) &&
      ViewAlignment.isRotationExactlyAligned(ViewOrbitTween.pendingRotation(v), prior.axis, prior.isPositive)
    )
  )
    prior = null;
}

export const ViewportNavActions = {
  snapToView(axisIndex: number, isPositive: boolean) {
    const v = target();
    if (!canMove(v)) return;
    // A second press onto the axis view already showing goes back to the perspective view it left. Judged where
    // the view is heading, mid-flight the live pose is a lerp frame.
    const headedOrthographic = ViewOrbitTween.pendingOrthographic(v);
    const headedRotation = ViewOrbitTween.pendingRotation(v);
    if (headedOrthographic && ViewAlignment.isRotationExactlyAligned(headedRotation, axisIndex, isPositive)) {
      if (!prior) return;
      ViewOrbitTween.to(v, prior.pivot, prior.rotation, prior.size, false, ViewportNavSettings.AnimationEnabled);
      prior = null;
      SceneTutorial.report('AxisView');
      return;
    }
    // The flight's target, else a press on the way back would remember a lerp frame.
    prior = headedOrthographic
      ? null
      : {
          pivot: ViewOrbitTween.pendingPivot(v),
          rotation: headedRotation,
          size: ViewOrbitTween.pendingSize(v),
          axis: axisIndex,
          isPositive,
        };
    ViewSnap.to(v, axisIndex, isPositive, ViewportNavSettings.AnimationEnabled);
    SceneTutorial.report('AxisView');
  },

  toggleProjection() {
    ViewSnap.toggleProjection(target(), ViewportNavSettings.AnimationEnabled);
  },

  /**
   * The signs are the drag deltas the turntable expects, opposite to where the viewpoint goes. From where a running
   * flight is heading: its current frame would knock quick taps off the step grid.
   */
  orbitStep(yawSign: number, pitchSign: number) {
    const v = target();
    if (!canMove(v)) return;
    const step = ViewportNavSettings.OrbitStepDegrees;
    const from = ViewOrbitTween.pendingRotation(v);
    turnTo(v, TurntableOrbit.rotate(from, new Vector2(yawSign * step, pitchSign * step), 1, 1));
  },

  reverseView() {
    const v = target();
    if (!canMove(v)) return;
    const from = ViewOrbitTween.pendingRotation(v);
    turnTo(v, Quaternion.angleAxis(180, from.mulV(Vector3.up)).mul(from));
  },

  /** False when there was no camera to look through. */
  alignToCamera() {
    const v = target();
    if (!canMove(v)) return false;
    // The demo scene has no Camera component to land on.
    v.showNotification('No camera to align to');
    return false;
  },
};

// Pose, size and projection all from where a running flight is heading, so a key mid-fade keeps ortho.
function turnTo(v: SceneView, rotation: Quaternion) {
  const orthographic = ViewOrbitTween.pendingOrthographic(v);
  const pivot = resolvePivot(v, rotation, orthographic);
  ViewOrbitTween.to(
    v,
    pivot,
    rotation,
    ViewOrbitTween.pendingSize(v),
    orthographic,
    ViewportNavSettings.AnimationEnabled,
  );
}

/** While Orbit Selected answers, key steps swing the rig about the orbit centre, as a drag would. */
function resolvePivot(v: SceneView, rotation: Quaternion, orthographic: boolean) {
  const pivot = ViewOrbitTween.pendingPivot(v);
  const center = OrbitSelected.turnCenter(v, pivot);
  return OrbitSelected.orbitPivot(center, pivot.sub(center), ViewOrbitTween.pendingRotation(v), rotation, orthographic);
}

type Binding = [id: string, fallback: string, run: () => void];

export const ViewportNav = {
  Settings: ViewportNavSettings,

  install() {
    const A = ViewportNavActions;
    const I = ViewportNavIds;
    const bindings: Binding[] = [
      [I.Front, 'Num 1', () => grabTook(I.Front) || pieTook(1) || (ready() && A.snapToView(2, true))],
      [
        I.Back,
        'Ctrl+Num 1',
        () => grabTook(I.Back) || pieTookAny() || (ready() && (A.snapToView(2, false), ShortcutTips.note(I.Back))),
      ],
      [I.Right, 'Num 3', () => grabTook(I.Right) || pieTook(3) || (ready() && A.snapToView(0, true))],
      [
        I.Left,
        'Ctrl+Num 3',
        () => grabTook(I.Left) || pieTookAny() || (ready() && (A.snapToView(0, false), ShortcutTips.note(I.Left))),
      ],
      [I.Top, 'Num 7', () => grabTook(I.Top) || pieTook(7) || (ready() && A.snapToView(1, true))],
      [I.Bottom, 'Ctrl+Num 7', () => grabTook(I.Bottom) || pieTookAny() || (ready() && A.snapToView(1, false))],
      [
        I.Projection,
        'Num 5',
        () => grabTook(I.Projection) || pieTook(5) || (ready() && ticked(I.Projection, () => A.toggleProjection())),
      ],
      [
        I.OrbitUp,
        'Num 8',
        () => grabTook(I.OrbitUp) || pieTook(8) || (ready() && ticked(I.OrbitUp, () => A.orbitStep(0, 1))),
      ],
      [
        I.OrbitDown,
        'Num 2',
        () => grabTook(I.OrbitDown) || pieTook(2) || (ready() && ticked(I.OrbitDown, () => A.orbitStep(0, -1))),
      ],
      [
        I.OrbitLeft,
        'Num 4',
        () => grabTook(I.OrbitLeft) || pieTook(4) || (ready() && ticked(I.OrbitLeft, () => A.orbitStep(1, 0))),
      ],
      [
        I.OrbitRight,
        'Num 6',
        () => grabTook(I.OrbitRight) || pieTook(6) || (ready() && ticked(I.OrbitRight, () => A.orbitStep(-1, 0))),
      ],
      [I.Reverse, 'Num 9', () => grabTook(I.Reverse) || pieTook(9) || (ready() && A.reverseView())],
      [
        I.Camera,
        'Num 0',
        () => grabTook(I.Camera) || pieTookAny() || (ready() && ticked(I.Camera, () => A.alignToCamera())),
      ],
    ];
    for (const [id, fallback, run] of bindings) ShortcutManager.register(id, () => void run(), false, fallback);
    SceneView.duringSceneGui.add(dropLeftPrior);
  },
};
