// WorldAxes, ViewAlignment and ViewSnap: the six named views, shared by the numpad and the gizmo.
import { Quaternion, Vector3 } from '../../unity/math.ts';
import type { SceneView } from '../../unity/sceneview.ts';
import { TurntableOrbit, ViewOrbitTween, ViewProjection } from './camera.ts';
import { OrbitSelected } from './orbit-selected.ts';

const AXES = [Vector3.right, Vector3.up, Vector3.forward];

export interface ViewDirection {
  name: string;
  axisIndex: number;
  isPositive: boolean;
}

export const WorldAxes = {
  Count: 3,
  UpAxis: 1,
  /** The six named views in Unity's gizmo context-menu order. */
  Directions: [
    { name: 'Right', axisIndex: 0, isPositive: true },
    { name: 'Top', axisIndex: 1, isPositive: true },
    { name: 'Front', axisIndex: 2, isPositive: true },
    { name: 'Left', axisIndex: 0, isPositive: false },
    { name: 'Bottom', axisIndex: 1, isPositive: false },
    { name: 'Back', axisIndex: 2, isPositive: false },
  ] as ViewDirection[],
  get: (i: number) => AXES[i],
  signed: (i: number, positive: boolean) => AXES[i].mul(positive ? 1 : -1),
  axisOf: (d: ViewDirection) => WorldAxes.signed(d.axisIndex, d.isPositive),
};

const AlignedDot = 0.9;
const ExactlyAlignedDot = 0.9999;
const dot = (v: SceneView, axis: Vector3) => Vector3.dot(v.rotation.mulV(Vector3.forward), axis.neg());

export const ViewAlignment = {
  isExactlyAligned(v: SceneView | null, axisIndex: number, isPositive: boolean) {
    return !!v && dot(v, WorldAxes.signed(axisIndex, isPositive)) > ExactlyAlignedDot;
  },

  exactDirection(v: SceneView | null) {
    if (!v) return -1;
    return WorldAxes.Directions.findIndex((d) => dot(v, WorldAxes.axisOf(d)) > ExactlyAlignedDot);
  },

  currentDirection(v: SceneView | null) {
    if (!v) return -1;
    let best = -1,
      bestDot = AlignedDot;
    WorldAxes.Directions.forEach((d, i) => {
      const k = dot(v, WorldAxes.axisOf(d));
      if (k > bestDot) {
        bestDot = k;
        best = i;
      }
    });
    return best;
  },
};

const canMove = (v: SceneView | null): v is SceneView => !!v && !v.isRotationLocked;

// World up is degenerate against Y, so Top/Bottom fix screen-up to +Z/-Z (X reads to the right).
const upHint = (axisIndex: number, isPositive: boolean) =>
  axisIndex !== WorldAxes.UpAxis ? Vector3.up : isPositive ? Vector3.forward : Vector3.back;

export const ViewSnap = {
  /** Onto an axis looking back down it, orbiting about the selection at the same apparent scale. */
  to(v: SceneView | null, axisIndex: number, isPositive: boolean, animated: boolean) {
    if (!canMove(v) || axisIndex < 0 || axisIndex >= 3) return;
    const axis = WorldAxes.signed(axisIndex, isPositive);
    const rotation = Quaternion.lookRotation(axis.neg(), upHint(axisIndex, isPositive));
    const center = OrbitSelected.resolveOrbitCenter(v);
    let pivot = TurntableOrbit.pivotAround(center, v.pivot.sub(center), v.rotation, rotation);
    pivot = ViewProjection.pivotAtCenterDepth(pivot, center, rotation);
    const size = ViewProjection.apparentHalfHeight(v, center);
    ViewOrbitTween.to(v, pivot, rotation, size, true, animated);
  },

  /** A second click on the handle the view already looks down flips to the opposite pole. */
  toHandle(v: SceneView | null, axisIndex: number, isPositive: boolean, animated: boolean) {
    if (ViewAlignment.isExactlyAligned(v, axisIndex, isPositive)) isPositive = !isPositive;
    ViewSnap.to(v, axisIndex, isPositive, animated);
  },

  toNiceAngle(v: SceneView | null, animated: boolean) {
    if (!canMove(v)) return;
    const f = v.rotation.mulV(Vector3.forward);
    let heading = new Vector3(f.x, 0, f.z);
    heading = heading.sqrMagnitude >= 1e-6 ? heading.normalized : Vector3.forward;
    heading = heading.withY(-0.5);
    ViewOrbitTween.to(
      v,
      v.pivot,
      Quaternion.lookRotation(heading),
      ViewOrbitTween.pendingSize(v),
      ViewOrbitTween.pendingOrthographic(v),
      animated,
    );
  },

  /** Perspective/ortho in place, converting size so the apparent scale survives. */
  toggleProjection(v: SceneView | null, animated: boolean) {
    if (!v) return;
    const wasOrtho = ViewOrbitTween.pendingOrthographic(v);
    const halfHeight = ViewProjection.pivotHalfHeight(v, ViewOrbitTween.pendingSize(v), wasOrtho);
    const size = ViewProjection.pivotSizeForHalfHeight(v, halfHeight, !wasOrtho);
    ViewOrbitTween.to(v, v.pivot, v.rotation, size, !wasOrtho, animated);
  },
};
