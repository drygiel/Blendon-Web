import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useInView } from '../../../lib/hooks.ts';
import styles from './SceneSection.module.scss';

const loadWindow = () => import('../../../window/PlaygroundWindow.tsx').then((m) => m.default);

/** The Blendon pane: the settings window, which loads (code and data) once the section comes near. */
export function WindowSlot() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: '1200px', once: true });
  // Mounted from a plain state update rather than a Suspense retry: a retry renders time-sliced, and with
  // the Scene view drawing every frame (its idle orbit) the slices never add up to a finished render.
  const [Win, setWin] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!near) return;
    let live = true;
    void loadWindow().then((c) => live && setWin(() => c));
    return () => void (live = false);
  }, [near]);
  return (
    <div ref={ref} className={styles.slot}>
      {Win ? (
        <Win />
      ) : (
        <div
          className={styles.windowPlaceholder}
          role="status"
          aria-busy="true"
          aria-label="Loading the settings window"
        />
      )}
    </div>
  );
}
