// The idle orbit: until someone touches the playground, the camera turns slowly round the selected cube
// (the demo scene opens centred on it), so the view reads as something live to play with rather than a
// still. The first click, key or wheel in the dock, or opening the Blendon tab, ends it for good and
// brings the whole dock into view.
import { PlaygroundEvents } from '../bridge/events.ts';
import { reducedMotion } from './blendon/navigation/camera.ts';
import type { SceneHost } from './engine/host.ts';
import { EditorApplication } from './unity/editor.ts';
import { Quaternion, Vector3 } from './unity/math.ts';

const DegreesPerSecond = 7;

export function startAttractOrbit(host: SceneHost): () => void {
  const view = host.view;
  const orbit = !reducedMotion();

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
      dock.removeEventListener(type, engage, true);
    offSettings();
  };
  const engage = () => {
    stop();
    alignDock(dock);
  };
  for (const type of ['pointerdown', 'wheel', 'keydown', 'focusin'] as const)
    dock.addEventListener(type, engage, { capture: true, passive: true });
  const offSettings = PlaygroundEvents.on('settingsOpened', engage);
  if (orbit) EditorApplication.update.add(tick);
  return stop;
}

// Centres a dock that hangs off the screen, the way the promo video does on play. A dock taller than the
// window keeps its toolbar in view instead.
function alignDock(dock: Element) {
  const r = dock.getBoundingClientRect();
  const h = window.innerHeight;
  if (r.top >= 0 && r.bottom <= h) return;
  dock.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: r.height > h ? 'start' : 'center' });
}
