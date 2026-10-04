// PlaneGeometry: the outline a plane handle is drawn and picked with (square or triangle).
import { HandleUtility } from '../../../unity/handles.ts';
import { Event } from '../../../unity/imgui.ts';
import { Mathf, Quaternion, Vector2, Vector3 } from '../../../unity/math.ts';
import { PlaneHandleShape } from '../common/gizmo-settings.ts';

// The near edge is the one the offset came from; a zero offset keeps the classic -half corner.
const inwardSign = (pivot: Vector3, center: Vector3, dir: Vector3) =>
  Vector3.dot(center.sub(pivot), dir) >= 0 ? -1 : 1;

function distanceToSegment(p: Vector2, a: Vector2, b: Vector2) {
  const ab = b.sub(a);
  const l2 = ab.sqrMagnitude;
  if (l2 < 1e-6) return Vector2.distance(p, a);
  const t = Mathf.Clamp01(Vector2.dot(p.sub(a), ab) / l2);
  return Vector2.distance(p, a.add(ab.mul(t)));
}

function distanceToPolygon(corners: Vector3[]) {
  const mouse = Event.current.mousePosition;
  let previous = HandleUtility.worldToGUIPoint(corners[corners.length - 1]);
  let nearest = Infinity;
  let positive = false,
    negative = false;
  for (const c of corners) {
    const current = HandleUtility.worldToGUIPoint(c);
    const edge = current.sub(previous);
    const cross = edge.x * (mouse.y - previous.y) - edge.y * (mouse.x - previous.x);
    if (cross > 0) positive = true;
    else if (cross < 0) negative = true;
    nearest = Math.min(nearest, distanceToSegment(mouse, previous, current));
    previous = current;
  }
  // Mixed signs mean the cursor is outside at least one edge.
  return positive && negative ? nearest : 0;
}

export const PlaneGeometry = {
  MaxCorners: 4,

  corners(
    shape: PlaneHandleShape,
    pivot: Vector3,
    center: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    halfSize: number,
  ): Vector3[] {
    const leg1 = dir1.mul(halfSize);
    const leg2 = dir2.mul(halfSize);
    if (shape !== PlaneHandleShape.Triangle)
      return [
        center.sub(leg1).sub(leg2),
        center.add(leg1).sub(leg2),
        center.add(leg1).add(leg2),
        center.sub(leg1).add(leg2),
      ];
    const inner1 = leg1.mul(inwardSign(pivot, center, dir1));
    const inner2 = leg2.mul(inwardSign(pivot, center, dir2));
    // The right angle first, nearest the pivot.
    return [center.add(inner1).add(inner2), center.sub(inner1).add(inner2), center.add(inner1).sub(inner2)];
  },

  distance(
    shape: PlaneHandleShape,
    pivot: Vector3,
    center: Vector3,
    dir1: Vector3,
    dir2: Vector3,
    normal: Vector3,
    halfSize: number,
  ) {
    if (shape !== PlaneHandleShape.Triangle)
      return HandleUtility.distanceToRectangle(center, Quaternion.lookRotation(normal, dir2), halfSize);
    return distanceToPolygon(PlaneGeometry.corners(shape, pivot, center, dir1, dir2, halfSize));
  },
};
