import { lazy, Suspense, useRef } from 'react';
import { useInView } from '../../../lib/hooks.ts';
import styles from './SceneSection.module.scss';

const PlaygroundWindow = lazy(() => import('../../../window/PlaygroundWindow.tsx'));

/** The Blendon pane: the settings window, which loads (code and data) once the section comes near. */
export function WindowSlot() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: '1200px', once: true });
  const placeholder = (
    <div className={styles.windowPlaceholder} role="status" aria-busy="true" aria-label="Loading the settings window" />
  );
  return (
    <div ref={ref} className={styles.slot}>
      {near ? <Suspense fallback={placeholder}>{<PlaygroundWindow />}</Suspense> : placeholder}
    </div>
  );
}
