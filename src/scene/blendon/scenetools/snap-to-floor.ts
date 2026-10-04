// SnapToFloor: End drops each selected object onto the rendered surface below it (or up to the one
// above), with a bounce. The destination is recorded before the bounce plays, so one Ctrl+Z undoes it.
import { EditorApplication, Selection, ShortcutManager, Undo } from '../../unity/editor.ts';
import { Mathf, Quaternion, Ray, Vector3 } from '../../unity/math.ts';
import type { Transform } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { EditorRaycastUtility, SceneTutorial } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { SnapDirection, SnapToFloorSettings } from './settings.ts';

const ShortcutId = 'Blendon/Snap To Floor';

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
    const up = s.Direction === SnapDirection.Up;
    const dir = up ? Vector3.up : Vector3.down;
    const pending: [Transform, Vector3, Vector3][] = [];
    Undo.incrementCurrentGroup();
    for (const go of Selection.gameObjects) {
      const t = go.transform;
      // From slightly behind the pivot, so a surface level with it still registers; never itself.
      const hit = EditorRaycastUtility.raycast(new Ray(t.position.sub(dir.mul(0.1)), dir), [t]);
      if (!hit) continue;
      const start = t.position;
      Undo.recordObject(t, 'Snap to Floor');
      // Tilted first, so the contact offset is read from the rotated bounds.
      if (s.AlignToSurface) t.rotation = Quaternion.fromToRotation(t.up, hit.normal).mul(t.rotation);
      const b = go.bounds;
      const contact = b ? (up ? b.max.y - t.position.y : t.position.y - b.min.y) : 0;
      const end = hit.point.sub(dir.mul(contact + s.SurfaceOffset));
      t.position = end;
      SceneTutorial.reportShortcut(ShortcutId);
      if (s.AnimationEnabled) pending.push([t, start, end]);
    }
    // The undo entry already holds the destination; only now may the bounce rewind the transform.
    for (const [t, from, to] of pending) {
      t.position = from;
      animate(t, from, to);
    }
    SceneView.repaintAll();
  },
};
