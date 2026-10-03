import { lazy, Suspense, useRef } from 'react';
import { useInView } from '../../../lib/hooks.ts';
import styles from './SceneSection.module.scss';

const ScenePlayground = lazy(() => import('../../../scene/ScenePlayground.tsx'));

/** Space for the Scene view, which loads (three.js, the engine, the data) once the section comes near. */
export function SceneSlot() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: '1200px', once: true });
  const placeholder = <div className={styles.placeholder} role="status" aria-busy="true" aria-label="Loading the Scene view" />;
  return (
    <div ref={ref} className={styles.slot}>
      {near ? <Suspense fallback={placeholder}>{<ScenePlayground />}</Suspense> : placeholder}
    </div>
  );
}
