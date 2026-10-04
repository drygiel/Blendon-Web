// ScreenDragSolver: where along a drag constraint a point must sit to land on a screen position.
import { HandleUtility } from '../../../unity/handles.ts';
import { Mathf, Plane, Vector2, Vector3 } from '../../../unity/math.ts';
import type { SceneCamera } from '../../../unity/sceneview.ts';
import { MinVisibleFade } from '../colors.ts';
import { GizmoRenderer } from '../rendering.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';

const MinGrazingDegrees = 2;
const ClampBisectionSteps = 24;
const MaxIterations = 8;
const BacktrackSteps = 16;
const ResidualPixels = 0.05;
const MaxForeshortening = 30;
const MinFrontDepth = 1e-3;

export const ScreenDragSolver = {
  /** The plane point under targetScreen, with the target pulled back from the plane's vanishing line. */
  tryCursorOnPlane(plane: Plane, referenceScreen: Vector2, targetScreen: Vector2): Vector3 | null {
    const camera = GizmoRenderer.currentCamera();
    if (!camera) return null;
    if (!camera.orthographic) {
      const hSign = Mathf.Sign(plane.getDistanceToPoint(camera.position));
      targetScreen = clampToReachable(referenceScreen, targetScreen, plane.normal, hSign);
    }
    const ray = HandleUtility.guiPointToWorldRay(targetScreen);
    const [hit, enter] = plane.raycast(ray);
    return hit ? ray.getPoint(enter) : null;
  },

  trySolvePlane(origin: Vector3, dir1: Vector3, dir2: Vector3, referenceScreen: Vector2, targetScreen: Vector2) {
    const normal = Vector3.cross(dir1, dir2);
    if (normal.sqrMagnitude < 1e-8) return null;
    const point = ScreenDragSolver.tryCursorOnPlane(
      new Plane(normal.normalized, origin),
      referenceScreen,
      targetScreen,
    );
    if (!point) return null;
    const offset = point.sub(origin);
    return [Vector3.dot(offset, dir1), Vector3.dot(offset, dir2)] as [number, number];
  },

  /** Newton steps along the axis toward the target's projection, kept within the reachable interval. */
  trySolveAxis(origin: Vector3, direction: Vector3, targetScreen: Vector2, along: number): number | null {
    const camera = GizmoRenderer.currentCamera();
    if (!camera) return null;
    const toCamera = camera.position.sub(origin);
    const centre = Vector3.dot(toCamera, direction);
    const perpSq = Math.max(0, toCamera.sqrMagnitude - centre * centre);
    const halfRange = camera.orthographic ? Infinity : reachableHalfRange(perpSq);
    let d = clamp(along, centre, halfRange);
    let point = origin.add(direction.mul(d));
    let m = measure(camera, point, direction, targetScreen);
    if (!m) return null;
    for (let i = 0; i < MaxIterations && m.errorLen > ResidualPixels; i++) {
      const floor = screenRateFloor(camera, point, m.screen);
      const step = Vector2.dot(targetScreen.sub(m.screen), m.screenDir) / m.sigma / Math.max(m.sigma, floor);
      let advanced = false;
      let scale = 1;
      for (let t = 0; t < BacktrackSteps; t++, scale *= 0.5) {
        const tryD = clamp(d + step * scale, centre, halfRange);
        const tryPoint = origin.add(direction.mul(tryD));
        const tm = measure(camera, tryPoint, direction, targetScreen);
        if (!tm || !(tm.errorLen < m.errorLen)) continue;
        d = tryD;
        point = tryPoint;
        m = tm;
        advanced = true;
        break;
      }
      if (!advanced) break;
    }
    return d;
  },
};

function measure(camera: SceneCamera, point: Vector3, direction: Vector3, target: Vector2) {
  if (!isProjectable(camera, point) || !isProjectable(camera, point.add(direction))) return null;
  const screen = HandleUtility.worldToGUIPoint(point);
  const screenDir = HandleUtility.worldToGUIPoint(point.add(direction)).sub(screen);
  const sigma = screenDir.magnitude;
  if (sigma < 1e-9) return null;
  const errorLen = Math.abs(Vector2.dot(target.sub(screen), screenDir) / sigma);
  return { screen, screenDir, sigma, errorLen };
}

function reachAt(screen: Vector2, normal: Vector3, hSign: number) {
  const ray = HandleUtility.guiPointToWorldRay(screen);
  return -hSign * Vector3.dot(ray.direction, normal);
}

function clampToReachable(reference: Vector2, target: Vector2, normal: Vector3, hSign: number) {
  const floor = minGrazingSin();
  const reach = reachAt(target, normal, hSign);
  if (reach >= floor) return target;
  const wanted = floor / (1 + (floor - reach) / floor);
  if (reachAt(reference, normal, hSign) < wanted) return reference;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < ClampBisectionSteps; i++) {
    const mid = 0.5 * (lo + hi);
    if (reachAt(Vector2.lerp(reference, target, mid), normal, hSign) >= wanted) lo = mid;
    else hi = mid;
  }
  return Vector2.lerp(reference, target, lo);
}

function minGrazingSin() {
  const visibleFloor = MinVisibleFade * SharedGizmoSettings.ThresholdDegrees;
  return Math.sin(Mathf.Deg2Rad * Math.min(MinGrazingDegrees, visibleFloor));
}

function reachableHalfRange(perpSq: number) {
  const sin = minGrazingSin();
  if (sin <= 0) return Infinity;
  return Math.sqrt(Math.max(0, perpSq * (1 / (sin * sin) - 1)));
}

const clamp = (v: number, c: number, half: number) => (half === Infinity ? v : Mathf.Clamp(v, c - half, c + half));

function screenRateFloor(camera: SceneCamera, point: Vector3, screen: Vector2) {
  const r = point.add(camera.right);
  if (!isProjectable(camera, r)) return 0;
  return HandleUtility.worldToGUIPoint(r).sub(screen).magnitude / MaxForeshortening;
}

function isProjectable(camera: SceneCamera, point: Vector3) {
  return camera.orthographic || Vector3.dot(point.sub(camera.position), camera.forward) > MinFrontDepth;
}
