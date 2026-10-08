import { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../../lib/hooks.ts';
import type { TutorialTask } from '../../../plugin/tutorial.ts';
import styles from './Tutorial.module.scss';

const GAP = 12;
const MARGIN = 16;
const WIDTH = 360;

const publicUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

interface TaskTipProps {
  id: string;
  task: TutorialTask;
  /** The hovered row, in viewport coordinates. */
  anchor: DOMRect;
}

/**
 * The hover card of a tutorial row, the same one the Scene View shows: title, hint and the feature's
 * picture, with its clip looping over it where it has one. Beside the row when there is room, else
 * under or over it.
 */
export function TaskTip({ id, task, anchor }: TaskTipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Placed after layout, once the card's own height is known.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const clampY = (y: number) => Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - MARGIN - h));

    let left = anchor.left - GAP - w;
    let top = clampY(anchor.top + anchor.height / 2 - h / 2);
    if (left < MARGIN) {
      left = Math.min(Math.max(anchor.left, MARGIN), Math.max(MARGIN, vw - MARGIN - w));
      const below = anchor.bottom + GAP;
      top = below + h <= vh - MARGIN || anchor.top < vh - anchor.bottom ? below : anchor.top - GAP - h;
    }
    setPos({ left, top });
  }, [anchor, task]);

  const picture = publicUrl(task.picture);
  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className={styles.tip}
      style={{
        width: `min(${WIDTH}px, calc(100vw - ${MARGIN * 2}px))`,
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <p className={styles.tipTitle}>{task.title}</p>
      <p className={styles.tipHint}>{task.hint}</p>
      {task.clip && !reduced ? (
        <video
          key={task.clip}
          className={styles.tipMedia}
          src={publicUrl(task.clip)}
          poster={picture}
          width={640}
          height={360}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      ) : (
        <img key={picture} className={styles.tipMedia} src={picture} width={640} height={360} alt="" />
      )}
    </div>
  );
}
