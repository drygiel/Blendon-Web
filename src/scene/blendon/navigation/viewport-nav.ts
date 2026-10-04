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

const P = 'Blendon/Viewport Nav/';
export const ViewportNavIds = {
  Front: P + 'View Front',
  Back: P + 'View Back',
  Right: P + 'View Right',
  Left: P + 'View Left',
  Top: P + 'View Top',
  Bottom: P + 'View Bottom',
  Projection: P + 'Toggle Projection',
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
const canMove = (v: SceneView | null): v is SceneView => !!v && !v.isRotationLocked;

let prior: { pivot: Vector3; rotation: Quaternion; size: number } | null = null;

export const ViewportNavActions = {
  snapToView(axisIndex: number, isPositive: boolean) {
    const v = target();
    if (!canMove(v)) return;
    // A second press onto the axis view already showing goes back to the perspective view it left.
    if (ViewOrbitTween.pendingOrthographic(v) && ViewAlignment.isExactlyAligned(v, axisIndex, isPositive)) {
      if (!prior) return;
      ViewOrbitTween.to(v, prior.pivot, prior.rotation, prior.size, false, ViewportNavSettings.AnimationEnabled);
      prior = null;
      SceneTutorial.report('AxisView');
      return;
    }
    prior = ViewOrbitTween.pendingOrthographic(v)
      ? null
      : { pivot: v.pivot, rotation: v.rotation, size: ViewOrbitTween.pendingSize(v) };
    ViewSnap.to(v, axisIndex, isPositive, ViewportNavSettings.AnimationEnabled);
    SceneTutorial.report('AxisView');
  },

  toggleProjection() {
    ViewSnap.toggleProjection(target(), ViewportNavSettings.AnimationEnabled);
  },

  /** The signs are the drag deltas the turntable expects, opposite to where the viewpoint goes. */
  orbitStep(yawSign: number, pitchSign: number) {
    const v = target();
    if (!canMove(v)) return;
    const step = ViewportNavSettings.OrbitStepDegrees;
    const rotation = TurntableOrbit.rotate(v.rotation, new Vector2(yawSign * step, pitchSign * step), 1, 1);
    ViewOrbitTween.to(
      v,
      resolvePivot(v, rotation),
      rotation,
      v.size,
      v.orthographic,
      ViewportNavSettings.AnimationEnabled,
    );
  },

  reverseView() {
    const v = target();
    if (!canMove(v)) return;
    const rotation = Quaternion.angleAxis(180, v.rotation.mulV(Vector3.up)).mul(v.rotation);
    ViewOrbitTween.to(
      v,
      resolvePivot(v, rotation),
      rotation,
      v.size,
      v.orthographic,
      ViewportNavSettings.AnimationEnabled,
    );
  },

  alignToCamera() {
    const v = target();
    if (!canMove(v)) return;
    // The demo scene has no Camera component to land on.
    v.showNotification('No camera to align to');
  },
};

/** With Orbit Selected on, key steps swing the rig about the orbit centre, as a drag would. */
function resolvePivot(v: SceneView, rotation: Quaternion) {
  if (!OrbitSelected.Settings.Enabled) return v.pivot;
  const center = OrbitSelected.resolveOrbitCenter(v);
  return TurntableOrbit.pivotAround(center, v.pivot.sub(center), v.rotation, rotation);
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
      [I.Projection, 'Num 5', () => grabTook(I.Projection) || pieTook(5) || (ready() && A.toggleProjection())],
      [I.OrbitUp, 'Num 8', () => grabTook(I.OrbitUp) || pieTook(8) || (ready() && A.orbitStep(0, 1))],
      [I.OrbitDown, 'Num 2', () => grabTook(I.OrbitDown) || pieTook(2) || (ready() && A.orbitStep(0, -1))],
      [I.OrbitLeft, 'Num 4', () => grabTook(I.OrbitLeft) || pieTook(4) || (ready() && A.orbitStep(1, 0))],
      [I.OrbitRight, 'Num 6', () => grabTook(I.OrbitRight) || pieTook(6) || (ready() && A.orbitStep(-1, 0))],
      [I.Reverse, 'Num 9', () => grabTook(I.Reverse) || pieTook(9) || (ready() && A.reverseView())],
      [I.Camera, 'Num 0', () => grabTook(I.Camera) || pieTookAny() || (ready() && A.alignToCamera())],
    ];
    for (const [id, fallback, run] of bindings) ShortcutManager.register(id, () => void run(), false, fallback);
  },
};
