// TurntableOrbit, ViewProjection, ViewOrbitPath and ViewOrbitTween: the camera math every
// navigation feature shares, and the one flight every animated view change takes.
import { EditorApplication } from '../../unity/editor.ts';
import { Mathf, Quaternion, Vector2, Vector3 } from '../../unity/math.ts';
import type { SceneView } from '../../unity/sceneview.ts';
import { GeneralSettings } from '../settings.ts';

export const TurntableOrbit = {
  /** Yaw about world up, pitch about the yawed camera's right; for a total delta from the drag start. */
  rotate(start: Quaternion, totalDelta: Vector2, hDegPerPx: number, vDegPerPx: number) {
    const horizontal = Quaternion.angleAxis(totalDelta.x * hDegPerPx, Vector3.up);
    const pitchAxis = horizontal.mul(start).mulV(Vector3.right);
    const vertical = Quaternion.angleAxis(totalDelta.y * vDegPerPx, pitchAxis);
    return vertical.mul(horizontal).mul(start);
  },

  /** New pivot keeping the orbit centre fixed on screen as the view turns. */
  pivotAround(center: Vector3, startOffset: Vector3, startRotation: Quaternion, newRotation: Quaternion) {
    const delta = newRotation.mul(Quaternion.inverse(startRotation));
    return center.add(delta.mulV(startOffset));
  },
};

const halfFov = (v: SceneView) => v.cameraSettings.fieldOfView * 0.5 * Mathf.Deg2Rad;

export const ViewProjection = {
  apparentHalfHeight(v: SceneView, worldPoint: Vector3) {
    if (v.orthographic) return v.size;
    const depth = Vector3.dot(worldPoint.sub(v.camera.position), v.rotation.mulV(Vector3.forward));
    return Math.max(depth, 0.0001) * Math.tan(halfFov(v));
  },

  perspectiveSizeForHalfHeight(
    v: SceneView,
    worldPoint: Vector3,
    pivot: Vector3,
    rotation: Quaternion,
    target: number,
  ) {
    const h = halfFov(v);
    const depthOffset = Vector3.dot(worldPoint.sub(pivot), rotation.mulV(Vector3.forward));
    return Math.max((target - depthOffset * Math.tan(h)) * Math.cos(h), 0.0001);
  },

  pivotHalfHeight(v: SceneView, size: number, orthographic: boolean) {
    return orthographic ? size : size / Math.cos(halfFov(v));
  },

  pivotSizeForHalfHeight(v: SceneView, halfHeight: number, orthographic: boolean) {
    return Math.max(orthographic ? halfHeight : halfHeight * Math.cos(halfFov(v)), 0.0001);
  },

  distanceForHalfHeight(v: SceneView, halfHeight: number) {
    return halfHeight / Math.tan(halfFov(v));
  },

  pivotSizeForDistance(v: SceneView, distance: number, orthographic: boolean) {
    return orthographic ? distance : distance * Math.sin(halfFov(v));
  },

  /** Slides a pivot along the view axis onto the centre's depth (the ortho near clip needs it). */
  pivotAtCenterDepth(pivot: Vector3, center: Vector3, rotation: Quaternion) {
    const f = rotation.mulV(Vector3.forward);
    return pivot.sub(f.mul(Vector3.dot(pivot.sub(center), f)));
  },
};

/** A swing about one axis plus a slide along it, joining two poses the way an orbit would. */
export class ViewOrbitPath {
  private readonly fromPivot: Vector3;
  private readonly toPivot: Vector3;
  private readonly fromRotation: Quaternion;
  private readonly toRotation: Quaternion;
  private readonly isArc: boolean;
  private readonly center: Vector3;
  private readonly startOffset: Vector3;
  private readonly axisSlide: Vector3;

  private constructor(
    fromPivot: Vector3,
    fromRotation: Quaternion,
    toPivot: Vector3,
    toRotation: Quaternion,
    isArc: boolean,
    center: Vector3,
    axisSlide: Vector3,
  ) {
    this.fromPivot = fromPivot;
    this.toPivot = toPivot;
    this.fromRotation = fromRotation;
    this.toRotation = toRotation;
    this.isArc = isArc;
    this.center = center;
    this.startOffset = fromPivot.sub(center);
    this.axisSlide = axisSlide;
  }

  static between(fromPivot: Vector3, fromRotation: Quaternion, toPivot: Vector3, toRotation: Quaternion) {
    let [angle, axis] = toRotation.mul(Quaternion.inverse(fromRotation)).toAngleAxis();
    // Slerp takes the short way round; the swing must wind the same way.
    if (angle > 180) {
      angle = 360 - angle;
      axis = axis.neg();
    }
    const straight = new ViewOrbitPath(fromPivot, fromRotation, toPivot, toRotation, false, fromPivot, Vector3.zero);
    if (angle < 1 || !Number.isFinite(axis.sqrMagnitude) || axis.sqrMagnitude < 0.0001) return straight;
    axis = axis.normalized;
    const move = toPivot.sub(fromPivot);
    const slide = axis.mul(Vector3.dot(move, axis));
    const chord = move.sub(slide);
    const center = fromPivot
      .add(chord.mul(0.5))
      .add(Vector3.cross(axis, chord).div(2 * Math.tan(angle * 0.5 * Mathf.Deg2Rad)));
    return Number.isFinite(center.sqrMagnitude)
      ? new ViewOrbitPath(fromPivot, fromRotation, toPivot, toRotation, true, center, slide)
      : straight;
  }

  evaluate(t: number): [Vector3, Quaternion] {
    const rotation = Quaternion.slerp(this.fromRotation, this.toRotation, t);
    const pivot = this.isArc
      ? TurntableOrbit.pivotAround(this.center, this.startOffset, this.fromRotation, rotation).add(
          this.axisSlide.mul(t),
        )
      : Vector3.lerp(this.fromPivot, this.toPivot, t);
    return [pivot, rotation];
  }
}

const DriftDegrees = 0.01;
const DriftFraction = 0.0001;
const ProjectionFadeSeconds = 0.6;

/** One flight at a time: history, the orientation gizmo, numpad views, Quick Roll, Frame Selected. */
export const ViewOrbitTween = {
  view: null as SceneView | null,
  path: null as ViewOrbitPath | null,
  fromSize: 0,
  toSize: 0,
  start: 0,
  duration: 0,
  applied: { pivot: Vector3.zero, rotation: Quaternion.identity, size: 0 },
  projection: null as { view: SceneView; target: boolean; start: number } | null,

  get isPlaying() {
    return ViewOrbitTween.view !== null;
  },

  pendingSize(v: SceneView) {
    return ViewOrbitTween.view === v ? ViewOrbitTween.toSize : v.size;
  },

  pendingOrthographic(v: SceneView) {
    const p = ViewOrbitTween.projection;
    if (!p || p.view !== v) return v.orthographic;
    if (v.orthographic === p.target || EditorApplication.timeSinceStartup - p.start > ProjectionFadeSeconds) {
      ViewOrbitTween.projection = null;
      return v.orthographic;
    }
    return p.target;
  },

  to(
    v: SceneView | null,
    pivot: Vector3,
    rotation: Quaternion,
    size: number,
    orthographic: boolean,
    animated: boolean,
    duration = GeneralSettings.AnimationDuration,
  ) {
    if (!v) return;
    if (animated && !reducedMotion()) play(v, pivot, rotation, size, orthographic, duration);
    else {
      ViewOrbitTween.stop();
      v.lookAt(pivot, rotation, size, orthographic, true);
      ViewOrbitTween.projection = null;
    }
    v.repaint();
  },

  stop() {
    EditorApplication.update.remove(step);
    ViewOrbitTween.view = null;
  },
};

/** The page's reduced-motion preference turns every flight into a cut. */
export function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function play(
  v: SceneView,
  pivot: Vector3,
  rotation: Quaternion,
  size: number,
  orthographic: boolean,
  duration: number,
) {
  const T = ViewOrbitTween;
  T.path = ViewOrbitPath.between(v.pivot, v.rotation, pivot, rotation);
  T.fromSize = v.size;
  T.toSize = size;
  T.view = v;
  T.start = EditorApplication.timeSinceStartup;
  T.duration = Math.max(0.0001, duration);
  // The projection cross-fade only starts through Unity's own LookAt; handed the current pose it
  // has nothing else to move, and the steps below overwrite the pose anyway.
  if (T.pendingOrthographic(v) !== orthographic) {
    v.lookAt(v.pivot, v.rotation, v.size, orthographic, false);
    T.projection = { view: v, target: orthographic, start: EditorApplication.timeSinceStartup };
  }
  recordApplied(v);
  EditorApplication.update.remove(step);
  EditorApplication.update.add(step);
}

function step() {
  const T = ViewOrbitTween;
  const v = T.view;
  if (!v || !T.path) {
    T.stop();
    return;
  }
  if (hasDrifted(v)) {
    T.stop();
    return;
  }
  const t = Mathf.Clamp01((EditorApplication.timeSinceStartup - T.start) / T.duration);
  // Ease-out only: leaves at full speed and coasts into the target.
  const r = 1 - t;
  const eased = 1 - r * r * r;
  const [pivot, rotation] = T.path.evaluate(eased);
  v.lookAtDirect(pivot, rotation, Mathf.Lerp(T.fromSize, T.toSize, eased));
  recordApplied(v);
  v.repaint();
  if (t >= 1) T.stop();
}

function recordApplied(v: SceneView) {
  ViewOrbitTween.applied = { pivot: v.pivot, rotation: v.rotation.normalized, size: v.size };
}

function hasDrifted(v: SceneView) {
  const a = ViewOrbitTween.applied;
  const tol = DriftFraction * Math.max(1, a.size);
  return (
    v.pivot.sub(a.pivot).sqrMagnitude > tol * tol ||
    Math.abs(v.size - a.size) > tol ||
    Quaternion.angle(v.rotation.normalized, a.rotation) > DriftDegrees
  );
}
