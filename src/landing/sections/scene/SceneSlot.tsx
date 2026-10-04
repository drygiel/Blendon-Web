import { lazy, Suspense, useRef } from 'react';
import { useInView, useMediaQuery } from '../../../lib/hooks.ts';
import styles from './SceneSection.module.scss';

const ScenePlayground = lazy(() => import('../../../scene/ScenePlayground.tsx'));

// A device with no mouse to hover with: the view is driven by mouse buttons and keys, so it gets a picture.
const TOUCH_ONLY = '(hover: none) and (pointer: coarse)';

/** Space for the Scene view, which loads (three.js, the engine, the data) once the section comes near. */
export function SceneSlot() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: '1200px', once: true });
  const touchOnly = useMediaQuery(TOUCH_ONLY);
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
  const placeholder = (
    <div className={styles.placeholder} role="status" aria-busy="true" aria-label="Loading the Scene view" />
  );
  return (
    <div ref={ref} className={styles.slot}>
      {near ? <Suspense fallback={placeholder}>{<ScenePlayground />}</Suspense> : placeholder}
    </div>
  );
}
