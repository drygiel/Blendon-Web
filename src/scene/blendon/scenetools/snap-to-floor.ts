// SnapToFloor: End drops each selected object onto the rendered surface below it (or up to the one
// above), with a bounce. The destination is recorded before the bounce plays, so one Ctrl+Z undoes it.
import { EditorApplication, Selection, SelectionMode, ShortcutManager, Undo } from '../../unity/editor.ts';
import { Mathf, Quaternion, Ray, Vector2, Vector3 } from '../../unity/math.ts';
import type { Transform } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { EditorRaycastUtility, SceneTutorial } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { reducedMotion } from '../navigation/camera.ts';
import { SnapDirection, SnapToFloorSettings } from './settings.ts';

const ShortcutId = 'Blendon/Snap to Floor';

interface Bounce {
  target: Transform;
  from: Vector3;
  to: Vector3;
  elapsed: number;
}

let bounces: Bounce[] = [];
let lastTick = 0;

function easeOutBounce(t: number) {
  const n1 = 6.25,
    d1 = 2.5;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  return n1 * (t -= 2.25 / d1) * t + 0.9375;
}

function tick() {
  const now = EditorApplication.timeSinceStartup;
  const dt = now - lastTick;
  lastTick = now;
  const duration = Math.max(1e-4, SnapToFloorSettings.AnimationDuration);
  bounces = bounces.filter((b) => {
    b.elapsed += dt;
    const p = Mathf.Clamp01(b.elapsed / duration);
    b.target.position = p < 1 ? Vector3.lerpUnclamped(b.from, b.to, easeOutBounce(p)) : b.to;
    return p < 1;
  });
  SceneView.repaintAll();
  if (bounces.length === 0) stop();
}

// An undo lands on the transform the bounce is still writing every frame, so the bounce gives way.
function stop() {
  bounces = [];
  EditorApplication.update.remove(tick);
  Undo.undoRedoPerformed.remove(stop);
}

function animate(target: Transform, from: Vector3, to: Vector3) {
  bounces = bounces.filter((b) => b.target !== target);
  bounces.push({ target, from, to, elapsed: 0 });
  if (bounces.length !== 1) return;
  lastTick = EditorApplication.timeSinceStartup;
  EditorApplication.update.add(tick);
  Undo.undoRedoPerformed.add(stop);
}

// A surface this steep stays level, tilting onto it would slide the object far along the cast.
const MinAlignCosine = 0.1;
// Start a bit behind the pivot so a surface level with it still hits.
const RayBackoff = 0.1;
// Share of the footprint, per side.
const CornerInset = 0.02;

// Corners of every drawn mesh box in the hierarchy, as offsets from the pivot, turned with their objects.
function collectOffsets(root: Transform) {
  const offsets: Vector3[] = [];
  const pivot = root.position;
  for (const t of root.walk()) {
    const go = t.gameObject;
    if (!go.mesh || !go.activeInHierarchy) continue;
    const box = go.mesh.bounds;
    const m = t.localToWorldMatrix;
    for (let i = 0; i < 8; i++) {
      const corner = new Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      );
      offsets.push(m.multiplyPoint3x4(corner).sub(pivot));
    }
  }
  return offsets;
}

// The middle and the four corners of the footprint, in the plane the cast crosses, along the object's heading.
function buildSamples(root: Transform, dir: Vector3, offsets: Vector3[]) {
  if (!offsets.length) return [Vector3.zero];
  let u = Vector3.projectOnPlane(root.forward, dir);
  if (u.sqrMagnitude < 1e-4) u = Vector3.projectOnPlane(root.right, dir);
  u = u.normalized;
  const v = Vector3.cross(dir, u);
  let min = new Vector2(Infinity, Infinity);
  let max = new Vector2(-Infinity, -Infinity);
  for (const o of offsets) {
    const along = new Vector2(Vector3.dot(o, u), Vector3.dot(o, v));
    min = Vector2.min(min, along);
    max = Vector2.max(max, along);
  }
  // A neighbour touching the edge must not count as something to stand on.
  const low = Vector2.lerp(min, max, CornerInset);
  const high = Vector2.lerp(min, max, 1 - CornerInset);
  const samples: Vector3[] = [];
  // A thin object repeats the same spot, no need to cast it twice.
  const add = (p: Vector3) => {
    if (!samples.some((e) => e.sub(p).sqrMagnitude < 1e-6)) samples.push(p);
  };
  add(u.mul((min.x + max.x) * 0.5).add(v.mul((min.y + max.y) * 0.5)));
  add(u.mul(low.x).add(v.mul(low.y)));
  add(u.mul(low.x).add(v.mul(high.y)));
  add(u.mul(high.x).add(v.mul(low.y)));
  add(u.mul(high.x).add(v.mul(high.y)));
  return samples;
}

// One cast per sample, the nearest hit wins, so the object rests on the first thing any part of it touches.
function findSurface(ignore: Transform[], pivot: Vector3, dir: Vector3, samples: Vector3[]) {
  let best: { point: Vector3; normal: Vector3; distance: number } | null = null;
  for (const sample of samples) {
    const hit = EditorRaycastUtility.raycast(new Ray(pivot.add(sample).sub(dir.mul(RayBackoff)), dir), ignore);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  let point: Vector3;
  let normal: Vector3;
  if (best) [point, normal] = [best.point, best.normal];
  else {
    // The demo's floor is the terrain here. Past it the bare Y = 0 plane counts only along the cast.
    const startHeight = pivot.y - dir.y * RayBackoff;
    if (-startHeight * dir.y < 0) return null;
    [point, normal] = [new Vector3(pivot.x, 0, pivot.z), Vector3.up];
  }
  // The normal faces the cast like a real surface, so an upward cast meets the ground's underside.
  if (Vector3.dot(normal, dir) > 0) normal = normal.neg();
  return { point, normal };
}

export const SnapToFloor = {
  ShortcutId,
  Settings: SnapToFloorSettings,

  install() {
    ShortcutManager.register(
      ShortcutId,
      () => {
        if (ViewportGesture.claimed(ShortcutId) || ViewportGesture.busy) return;
        SnapToFloor.run();
      },
      false,
      'End',
    );
  },

  run() {
    const s = SnapToFloorSettings;
    if (!s.Enabled) return;
    const dir = s.Direction === SnapDirection.Up ? Vector3.up : Vector3.down;
    // Top level only, so a child picked with its parent moves once, and the cast skips the whole set.
    const roots = Selection.getTransforms(SelectionMode.TopLevel);
    const pending: [Transform, Vector3, Vector3][] = [];
    let skipped = 0;
    Undo.incrementCurrentGroup();
    for (const root of roots) {
      const start = root.position;
      const offsets = collectOffsets(root);
      const hit = findSurface(roots, start, dir, buildSamples(root, dir, offsets));
      if (!hit) {
        skipped++;
        continue;
      }
      const align = s.AlignToSurface && Vector3.dot(hit.normal, dir.neg()) > MinAlignCosine;
      const normal = align ? hit.normal : dir.neg();
      const tilt = align ? Quaternion.fromToRotation(root.up, normal) : Quaternion.identity;
      // The tilt is applied to the offsets here, so the contact uses the rotated body.
      const clearance = SnapToFloor.support(offsets, tilt, normal) + s.SurfaceOffset;
      const end = SnapToFloor.landing(start, dir, normal, hit.point, clearance);
      Undo.recordObject(root, 'Snap to Floor');
      if (align) root.rotation = tilt.mul(root.rotation);
      root.position = end;
      SceneTutorial.reportShortcut(ShortcutId);
      if (s.AnimationEnabled && !reducedMotion()) pending.push([root, start, end]);
    }
    // The undo entry already holds the destination; only now may the bounce rewind the transform.
    for (const [t, from, to] of pending) {
      t.position = from;
      animate(t, from, to);
    }
    if (skipped > 0)
      SceneView.lastActiveSceneView?.showNotification(
        s.Direction === SnapDirection.Up ? 'Nothing above to land on' : 'Nothing below to land on',
      );
    SceneView.repaintAll();
  },

  /** How far the body reaches past the pivot towards the surface, along its normal, with the tilt applied. */
  support(offsets: Vector3[], tilt: Quaternion, normal: Vector3) {
    if (!offsets.length) return 0;
    const axis = Quaternion.inverse(tilt).mulV(normal);
    let reach = -Infinity;
    for (const o of offsets) reach = Math.max(reach, -Vector3.dot(o, axis));
    return reach;
  },

  /** Slides the pivot along the cast, so the body ends up the clearance above the plane through the hit. */
  landing(pivot: Vector3, dir: Vector3, normal: Vector3, hitPoint: Vector3, clearance: number) {
    const slide = (clearance - Vector3.dot(pivot.sub(hitPoint), normal)) / Vector3.dot(dir, normal);
    return pivot.add(dir.mul(slide));
  },
};
