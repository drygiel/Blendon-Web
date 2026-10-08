import { useRef, type ComponentType } from 'react';
import { useCalmMount } from './calm.ts';
import styles from './SceneSection.module.scss';

let Win: ComponentType | null = null;
// The window's font comes with its chunk, in its Latin and Latin Extended subsets. Loaded before the mount,
// it spares the window a second layout pass.
const loadWindow = async () => {
  const m = await import('../../../window/PlaygroundWindow.tsx');
  await Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 12px Inter`, 'AĀ'))).catch(() => {});
  Win = m.default;
};

/** The Blendon pane: the settings window, which loads (code and data) once the section comes near. */
export function WindowSlot() {
  const ref = useRef<HTMLDivElement>(null);
  // Mounted from a plain state update rather than a Suspense retry: a retry renders time-sliced, and with
  // the Scene view drawing every frame (its idle orbit) the slices never add up to a finished render.
  const ready = useCalmMount(ref, loadWindow);
  return (
    <div ref={ref} className={styles.slot}>
      {ready && Win ? (
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
