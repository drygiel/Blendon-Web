// The pure geometry behind the Editor's transform handles, kept apart from the event code so it can be tested.
import { Mathf, Quaternion, Vector3 } from '../../unity/math.ts';

// An axis fades out between 25 and 15 deg from the line of sight pointing away, 170 and 175 pointing at the
// camera. Mirrors Unity's kCameraViewLerpStart1..End2.
const LerpStart1 = Math.cos(25 * Mathf.Deg2Rad);
const LerpEnd1 = Math.cos(15 * Mathf.Deg2Rad);
const LerpStart2 = Math.cos(170 * Mathf.Deg2Rad);
const LerpEnd2 = Math.cos(175 * Mathf.Deg2Rad);

/** Past this fade an axis or a plane is hidden and cannot be grabbed (Handles.kCameraViewThreshold). */
export const CameraViewThreshold = 0.6;

/** Mirrors Unity's Handles.GetCameraViewLerpForWorldAxis: 0 broadside, 1 along the line of sight. */
export function cameraViewLerp(viewVector: Vector3, axis: Vector3) {
  const dot = Vector3.dot(viewVector, axis);
  return Math.max(Mathf.InverseLerp(LerpStart1, LerpEnd1, dot), Mathf.InverseLerp(LerpStart2, LerpEnd2, dot));
}

/** Mirrors Unity's Handles.CalcDrawOrder: axis indices back to front for a view direction in handle space. */
export function calcDrawOrder(viewDir: Vector3): [number, number, number] {
  const v = [viewDir.x, viewDir.y, viewDir.z];
  const order: [number, number, number] = [0, 1, 2];
  const swap = (a: number, b: number) => {
    [v[a], v[b]] = [v[b], v[a]];
    [order[a], order[b]] = [order[b], order[a]];
  };
  if (v[1] > v[0]) swap(1, 0);
  if (v[2] > v[1]) swap(2, 1);
  if (v[1] > v[0]) swap(1, 0);
  return order;
}

const Alignments = [
  Quaternion.lookRotation(Vector3.right, Vector3.up),
  Quaternion.lookRotation(Vector3.right, Vector3.forward),
  Quaternion.lookRotation(Vector3.up, Vector3.forward),
  Quaternion.lookRotation(Vector3.up, Vector3.right),
  Quaternion.lookRotation(Vector3.forward, Vector3.right),
  Quaternion.lookRotation(Vector3.forward, Vector3.up),
];

/**
 * Mirrors Unity's TransformManipulator SetScaleDelta: a scale in the handle's axes lands on whichever of the
 * object's own axes lines up with each.
 */
export function alignedScaleDelta(scaleDelta: Vector3, handleRotation: Quaternion, ownRotation: Quaternion) {
  let best = -Infinity;
  let align = Quaternion.identity;
  for (const a of Alignments) {
    const dot = Math.min(
      Math.abs(Vector3.dot(handleRotation.mulV(Vector3.right), ownRotation.mul(a).mulV(Vector3.right))),
      Math.abs(Vector3.dot(handleRotation.mulV(Vector3.up), ownRotation.mul(a).mulV(Vector3.up))),
      Math.abs(Vector3.dot(handleRotation.mulV(Vector3.forward), ownRotation.mul(a).mulV(Vector3.forward))),
    );
    if (dot > best) {
      best = dot;
      align = a;
    }
  }
  return align.mulV(scaleDelta).scale(align.mulV(Vector3.one));
}

/** Mirrors Unity's Handles.SetDiscSectionPoints: count points from `from`, turning by angle degrees. */
export function discSectionPoints(
  center: Vector3,
  normal: Vector3,
  from: Vector3,
  angle: number,
  radius: number,
  count = 60,
) {
  const f = from.normalized.mul(radius);
  const pts: Vector3[] = [];
  for (let i = 0; i < count; i++) pts.push(center.add(Quaternion.angleAxis((angle * i) / (count - 1), normal).mulV(f)));
  return pts;
}

/** Mirrors Unity's Handles.DrawWireDisc tangent: where a full circle about normal starts. */
export function discTangent(normal: Vector3) {
  const t = Vector3.cross(normal, Vector3.up);
  return t.sqrMagnitude < 0.001 ? Vector3.cross(normal, Vector3.right) : t;
}

/** Snapping.Snap: the nearest multiple of step, or the value itself without one. */
export const snapTo = (value: number, step: number) => (step > 0 ? Mathf.Round(value / step) * step : value);

/** Mirrors Unity's Disc: degrees for a drag of `distance` world units along the ring's tangent. */
export const discDegrees = (distance: number, handleSize: number) => (distance / handleSize) * 30;
