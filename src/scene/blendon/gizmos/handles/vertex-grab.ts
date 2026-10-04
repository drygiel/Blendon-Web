// VertexGrab: the offset from the pivot to the point a vertex-snapping drag picked up.
import { Vector2, Vector3 } from '../../../unity/math.ts';
import type { Transform } from '../../../unity/scene.ts';
import { SceneTutorial } from '../../foundation.ts';
import type { GizmoAxis } from '../axis.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';

// Below this share of its own world axis a drag direction counts as perpendicular to it.
const MinAxisAlignment = 0.001;

export class VertexGrab {
  private held = false;
  private offset = Vector3.zero;

  /** How far along direction it takes to close gap on axis's world coordinate. */
  static distanceAlongAxis(gap: Vector3, direction: Vector3, axis: GizmoAxis) {
    const along = axis.component(direction);
    return Math.abs(along) < MinAxisAlignment ? Vector3.dot(gap, direction) : axis.component(gap) / along;
  }

  static distancesAcrossPlane(
    gap: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    axis1: GizmoAxis,
    axis2: GizmoAxis,
  ): [number, number] {
    const m11 = axis1.component(dir1);
    const m12 = axis1.component(dir2);
    const m21 = axis2.component(dir1);
    const m22 = axis2.component(dir2);
    const det = m11 * m22 - m12 * m21;
    if (Math.abs(det) < MinAxisAlignment) return [Vector3.dot(gap, dir1), Vector3.dot(gap, dir2)];
    const g1 = axis1.component(gap);
    const g2 = axis2.component(gap);
    return [(g1 * m22 - m12 * g2) / det, (m11 * g2 - g1 * m21) / det];
  }

  track(pivot: Vector3, transforms: Transform[], guiPoint: Vector2, carryVertex: boolean) {
    if (this.held) return this.offset;
    let grabbed: Vector3 | null = pivot;
    if (carryVertex) grabbed = VertexSnappingUtility.tryGetGrabPoint(guiPoint, transforms);
    if (!grabbed) return Vector3.zero;
    this.offset = grabbed.sub(pivot);
    this.held = true;
    SceneTutorial.report('VertexSnap');
    return this.offset;
  }

  release() {
    this.held = false;
  }
}
