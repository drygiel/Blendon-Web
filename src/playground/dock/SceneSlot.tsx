import { useRef, type ComponentType } from 'react';
import { useMediaQuery } from '../../lib/hooks.ts';
import { loadWindowData } from '../../plugin/window-data.ts';
import { useCalmMount } from './calm.ts';
import styles from './Slot.module.scss';

let Scene: ComponentType | null = null;
// The engine reads the window data and lights the scene with the baked sky as it starts, so all three are in
// hand before the mount. The sky comes in its own import, which keeps three.js out of the page's bundle.
const loadScene = () =>
  Promise.all([
    import('../../scene/ScenePlayground.tsx'),
    loadWindowData(),
    import('../../scene/render/sky.ts').then((m) => m.loadSkyEnvironment()),
  ]).then(([m]) => void (Scene = m.default));

// A device with no mouse to hover with: the view is driven by mouse buttons and keys, so it gets a picture.
const TOUCH_ONLY = '(hover: none) and (pointer: coarse)';

/** Space for the Scene view, which loads (three.js, the engine, the data) once the section comes near. */
export function SceneSlot() {
  const ref = useRef<HTMLDivElement>(null);
  const touchOnly = useMediaQuery(TOUCH_ONLY);
  const ready = useCalmMount(ref, loadScene, !touchOnly);
  if (touchOnly)
    return (
      <div className={styles.slot}>
        <img
          className={styles.poster}
          src={`${import.meta.env.BASE_URL}scene/poster.webp`}
          alt="The Scene view with Blendon's Draw Mode pie menu open"
          loading="lazy"
        />
        <p className={styles.desktopOnly}>
          This Scene view runs on a desktop browser: it needs a mouse and a keyboard.{' '}
          <a href="#video">Watch it in the video</a>
        </p>
      </div>
    );
  return (
    <div ref={ref} className={styles.slot}>
      {ready && Scene ? (
        <Scene />
      ) : (
        <div className={styles.placeholder} role="status" aria-busy="true" aria-label="Loading the Scene view" />
      )}
    </div>
  );
}
