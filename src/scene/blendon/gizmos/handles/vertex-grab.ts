// VertexGrab: the offset from the pivot to the point a vertex-snapping drag picked up.
import { Vector2, Vector3 } from '../../../unity/math.ts';
import type { Transform } from '../../../unity/scene.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';

// Squared sine of the angle between the plane's directions below which they count as parallel.
const MinPlaneSpread = 1e-6;

export class VertexGrab {
  private held = false;
  private offset = Vector3.zero;

  /** Distance along direction of the axis point nearest the target, so a rotated Local arrow heads for the vertex. */
  static distanceAlongAxis(gap: Vector3, direction: Vector3) {
    const lengthSquared = direction.sqrMagnitude;
    return lengthSquared < 1e-12 ? 0 : Vector3.dot(gap, direction) / lengthSquared;
  }

  /** Distances along dir1 and dir2 of the target's projection onto their plane, by least squares. */
  static distancesAcrossPlane(gap: Vector3, dir1: Vector3, dir2: Vector3): [number, number] {
    const a11 = Vector3.dot(dir1, dir1);
    const a12 = Vector3.dot(dir1, dir2);
    const a22 = Vector3.dot(dir2, dir2);
    const det = a11 * a22 - a12 * a12;
    if (det <= MinPlaneSpread * a11 * a22)
      return [VertexGrab.distanceAlongAxis(gap, dir1), VertexGrab.distanceAlongAxis(gap, dir2)];
    const g1 = Vector3.dot(gap, dir1);
    const g2 = Vector3.dot(gap, dir2);
    return [(g1 * a22 - a12 * g2) / det, (a11 * g2 - a12 * g1) / det];
  }

  track(pivot: Vector3, transforms: Transform[], guiPoint: Vector2, carryVertex: boolean) {
    if (this.held) return this.offset;
    let grabbed: Vector3 | null = pivot;
    if (carryVertex) grabbed = VertexSnappingUtility.tryGetGrabPoint(guiPoint, transforms);
    if (!grabbed) return Vector3.zero;
    this.offset = grabbed.sub(pivot);
    this.held = true;
    return this.offset;
  }

  release() {
    this.held = false;
  }
}
