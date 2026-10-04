// AimMode (the held Alt that aims a drag at the surface under the cursor), SurfaceProbe and SurfaceSnapping.
import { type Event, EventType } from '../../../unity/imgui.ts';
import { Ray, Vector2, Vector3 } from '../../../unity/math.ts';
import type { Transform } from '../../../unity/scene.ts';
import type { SceneView } from '../../../unity/sceneview.ts';
import { EditorRaycastUtility, ModifierKeys, type ModifierKey } from '../../foundation.ts';
import { OrbitSelected } from '../../navigation/orbit-selected.ts';

// Contacts this close to either end of the line are its own start and end, not crossings.
const ContactEndGap = 0.02;

export const SurfaceProbe = {
  tryGetTarget(guiPoint: Vector2, ignore: Transform[]) {
    return EditorRaycastUtility.tryGetHitPoint(guiPoint, ignore);
  },

  collectContacts(from: Vector3, to: Vector3, ignore: Transform[]) {
    const results: { point: Vector3; normal: Vector3 }[] = [];
    const delta = to.sub(from);
    const length = delta.magnitude;
    if (length < 1e-4) return results;
    const dir = delta.div(length);
    const add = (ray: Ray) => {
      for (const h of EditorRaycastUtility.raycastAll(ray, ignore, length)) {
        const t = Vector3.distance(h.point, from) / length;
        if (t < ContactEndGap || t > 1 - ContactEndGap) continue;
        results.push(h);
      }
    };
    add(new Ray(from, dir));
    add(new Ray(to, dir.neg()));
    return results;
  },
};

export const SurfaceSnapping = {
  delta: (pivot: Vector3, target: Vector3) => target.sub(pivot),
  projectOnAxis: (delta: Vector3, axisDir: Vector3) => axisDir.mul(Vector3.dot(delta, axisDir)),
  projectOnPlane: (delta: Vector3, dir1: Vector3, dir2: Vector3) =>
    dir1.mul(Vector3.dot(delta, dir1)).add(dir2.mul(Vector3.dot(delta, dir2))),
};

const carriesModifiers = (t: EventType) =>
  t === EventType.KeyDown ||
  t === EventType.KeyUp ||
  t === EventType.MouseDown ||
  t === EventType.MouseUp ||
  t === EventType.MouseDrag ||
  t === EventType.MouseMove;

export class AimMode {
  held = false;
  driving = false;
  hasTarget = false;
  target = Vector3.zero;
  normal = Vector3.up;

  update(
    sceneView: SceneView,
    ev: Event,
    enabled: boolean,
    modifier: ModifierKey,
    canDrive: boolean,
    apply: () => void,
    onRelease?: () => void,
    onDriveStart?: () => void,
  ) {
    if (carriesModifiers(ev.type)) {
      // Orbiting reads the same modifier for axis-view snapping.
      const held = enabled && ModifierKeys.isHeld(modifier, ev) && !OrbitSelected.isOrbiting;
      if (held !== this.held) {
        this.held = held;
        sceneView.repaint();
      }
    }
    if (this.held && canDrive) {
      const starting = !this.driving;
      this.driving = true;
      if (starting) onDriveStart?.();
      if (ev.type === EventType.MouseDrag || ev.type === EventType.MouseMove || ev.type === EventType.KeyDown) apply();
    } else {
      if (this.driving) onRelease?.();
      this.reset();
    }
  }

  probe(guiPoint: Vector2, ignore: Transform[]) {
    const hit = SurfaceProbe.tryGetTarget(guiPoint, ignore);
    if (!hit) return false;
    this.target = hit.point;
    this.normal = hit.normal;
    this.hasTarget = true;
    return true;
  }

  reset() {
    this.driving = false;
    this.hasTarget = false;
  }
}
