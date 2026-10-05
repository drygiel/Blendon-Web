// The idle orbit: until someone touches the playground, the camera turns slowly round the selected cube,
// so the view reads as something live to play with rather than a still. The first click, key or wheel in
// the dock, or opening the Blendon tab, ends it for good.
import { reducedMotion } from './blendon/navigation/camera.ts';
import type { SceneHost } from './engine/host.ts';
import { EditorApplication, Selection } from './unity/editor.ts';
import { Mathf, Quaternion, Vector3 } from './unity/math.ts';

const DegreesPerSecond = 7;

export function startAttractOrbit(host: SceneHost): () => void {
  const view = host.view;
  const target = Selection.activeGameObject;
  const center = target?.bounds?.center ?? target?.transform.position;
  // Turned from where the camera already stands to look straight at the cube, at the same distance.
  if (center) {
    const offset = center.sub(view.camera.position);
    const fov = view.cameraSettings.fieldOfView * 0.5 * Mathf.Deg2Rad;
    const size = view.orthographic ? view.size : offset.magnitude * Math.sin(fov);
    view.lookAtDirect(center, Quaternion.lookRotation(offset.normalized, Vector3.up), size);
  }
  if (reducedMotion()) return () => {};

  let last = performance.now();
  let stopped = false;
  const tick = () => {
    const now = performance.now();
    // A tab in the background or the view scrolled away: pick up where it left off, without a jump.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    view.rotation = Quaternion.angleAxis(DegreesPerSecond * dt, Vector3.up).mul(view.rotation);
  };

  const dock = host.focusRoot.closest('[data-playground]') ?? host.focusRoot;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    EditorApplication.update.remove(tick);
    for (const type of ['pointerdown', 'wheel', 'keydown', 'focusin'] as const)
      dock.removeEventListener(type, stop, true);
    window.removeEventListener('blendon:settings-opened', stop);
  };
  for (const type of ['pointerdown', 'wheel', 'keydown', 'focusin'] as const)
    dock.addEventListener(type, stop, { capture: true, passive: true });
  window.addEventListener('blendon:settings-opened', stop);
  EditorApplication.update.add(tick);
  return stop;
}
