// The idle orbit: until someone touches the playground, the camera turns slowly round the selected cube
// (the demo scene opens centred on it), so the view reads as something live to play with rather than a
// still. The first click, key or wheel in the dock, or opening the Blendon tab, ends it for good.
import { PlaygroundEvents } from '../bridge/events.ts';
import { reducedMotion } from './blendon/navigation/camera.ts';
import type { SceneHost } from './engine/host.ts';
import { EditorApplication } from './unity/editor.ts';
import { Quaternion, Vector3 } from './unity/math.ts';

const DegreesPerSecond = 7;

export function startAttractOrbit(host: SceneHost): () => void {
  const view = host.view;
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
    offSettings();
  };
  for (const type of ['pointerdown', 'wheel', 'keydown', 'focusin'] as const)
    dock.addEventListener(type, stop, { capture: true, passive: true });
  const offSettings = PlaygroundEvents.on('settingsOpened', stop);
  EditorApplication.update.add(tick);
  return stop;
}
