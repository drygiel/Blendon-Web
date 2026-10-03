// QuickRoll: Alt + middle-mouse flick snaps the view 90 degrees that way and drops into ortho.
import { ShortcutManager, ShortcutStage, type ShortcutArguments } from '../../unity/editor.ts';
import type { Event } from '../../unity/imgui.ts';
import { Mathf, Quaternion, Vector2, Vector3 } from '../../unity/math.ts';
import type { SceneView } from '../../unity/sceneview.ts';
import { SceneTutorial, ShortcutTips } from '../foundation.ts';
import { TurntableOrbit, ViewOrbitTween, ViewProjection } from './camera.ts';
import { OrbitSelected } from './orbit-selected.ts';

let fired = false;
let downPosition = Vector2.zero;

export const QuickRoll = {
  shortcutHeld: false,
  /** Set only by a fresh press; a modifier pressed mid-orbit leaves that drag an orbit. */
  armed: false,
  isRolling: false,

  install() {
    ShortcutManager.register(OrbitSelected.RollShortcutId, rollShortcut, true, 'Alt+Mouse 2');
  },

  reset() {
    QuickRoll.isRolling = false;
    fired = false;
    QuickRoll.armed = false;
  },

  begin(mouse: Vector2) {
    QuickRoll.isRolling = true;
    fired = false;
    downPosition = mouse;
  },

  executeDrag(view: SceneView, e: Event) {
    if (!fired) {
      const delta = e.mousePosition.sub(downPosition);
      if (delta.magnitude >= OrbitSelected.Settings.RollThresholdPixels) {
        performRoll(view, delta);
        fired = true;
      }
    }
    e.use();
  },
};

function rollShortcut(args: ShortcutArguments) {
  if (args.stage === ShortcutStage.End) {
    QuickRoll.shortcutHeld = false;
    QuickRoll.armed = false;
    ShortcutTips.note(OrbitSelected.RollShortcutId);
  } else {
    QuickRoll.shortcutHeld = true;
    QuickRoll.armed = !OrbitSelected.isOrbiting;
  }
  OrbitSelected.repaintLastSceneView();
}

function performRoll(view: SceneView, drag: Vector2) {
  const horizontal = Math.abs(drag.x) >= Math.abs(drag.y);
  const sign = horizontal ? Mathf.Sign(drag.x) : Mathf.Sign(drag.y);
  const heading = horizontal ? turntableYaw(view.rotation) : turntablePitch(view.rotation);
  const amount = stepToNextAxis(heading, sign);
  const step = horizontal ? new Vector2(amount, 0) : new Vector2(0, amount);
  const [fromRotation] = OrbitSelected.nearestAxisRotation(view.rotation);
  const rough = TurntableOrbit.rotate(view.rotation, step, 1, 1);
  let [rotation] = OrbitSelected.nearestAxisRotation(rough);
  // Tipping past a pole would snap back onto the pole just left; carry on to the opposite one.
  if (!horizontal && Math.abs(heading + amount) > 90.5) rotation = oppositeAxisRotation(fromRotation, rough);
  const center = OrbitSelected.resolveOrbitCenter(view);
  let pivot = TurntableOrbit.pivotAround(center, view.pivot.sub(center), view.rotation, rotation);
  const size = ViewProjection.apparentHalfHeight(view, center);
  pivot = ViewProjection.pivotAtCenterDepth(pivot, center, rotation);
  ViewOrbitTween.to(view, pivot, rotation, size, true, OrbitSelected.Settings.AnimationEnabled);
  SceneTutorial.reportShortcut(OrbitSelected.RollShortcutId);
}

function turntablePitch(r: Quaternion) {
  return Math.asin(Mathf.Clamp(-r.mulV(Vector3.forward).y, -1, 1)) * Mathf.Rad2Deg;
}

function turntableYaw(r: Quaternion) {
  const f = r.mulV(Vector3.forward);
  if (f.x * f.x + f.z * f.z > 1e-6) return Math.atan2(f.x, f.z) * Mathf.Rad2Deg;
  const up = r.mulV(Vector3.up);
  const yaw = Math.atan2(up.x, up.z) * Mathf.Rad2Deg;
  return f.y > 0 ? yaw + 180 : yaw;
}

function stepToNextAxis(heading: number, sign: number) {
  const eps = 0.5;
  const index = sign > 0 ? Math.floor((heading + eps) / 90) + 1 : Math.ceil((heading - eps) / 90) - 1;
  return index * 90 - heading;
}

function oppositeAxisRotation(view: Quaternion, reference: Quaternion) {
  const wanted = view.mulV(Vector3.forward).neg();
  let best = view,
    bestAngle = Infinity;
  for (const c of OrbitSelected.AxisViewRotations) {
    if (Vector3.dot(c.mulV(Vector3.forward), wanted) < 0.99) continue;
    const a = Quaternion.angle(reference, c);
    if (a < bestAngle) {
      bestAngle = a;
      best = c;
    }
  }
  return best;
}
