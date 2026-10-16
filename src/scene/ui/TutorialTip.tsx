// TutorialTip: the badge's hover card for the task asked for next - title and keys, hint, and the feature's
// picture with its clip looping over it where it has one. Above the badge, below it near the top of the view,
// beside it only when the view is too short for either.
import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/hooks.ts';
import { publicUrl } from '../../lib/links.ts';
import type { TutorialTask } from '../blendon/tutorial/curriculum.ts';
import { KeyCaps } from './KeyCaps.tsx';
import styles from './TutorialBadge.module.scss';

/** Milliseconds the cursor has to rest on the line, the same wait as the settings window's cards. */
export const TipShowDelayMs = 500;

const ContentWidth = 320;
const Padding = 10;
const CardGap = 6;
const Margin = 6;
/** Keeps clear of the Scene view's top toolbar. */
const TopMargin = 30;

interface TutorialTipProps {
  task: TutorialTask;
  /** The badge, in view coordinates. */
  badge: { x: number; y: number; w: number; h: number };
  view: { w: number; h: number };
}

export function TutorialTip({ task, badge, view }: TutorialTipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const width = Math.min(ContentWidth, Math.max(0, view.w - Margin * 2 - Padding * 2));
  // Read live, a rebind shows at once.
  const keys = task.keys();

  // Placed after layout on every render: the badge can slide or widen while hovered.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const maxX = Math.max(Margin, view.w - Margin - w);
    let x = Math.min(Math.max(badge.x + badge.w - w, Margin), maxX);
    let y = badge.y - CardGap - h;
    if (y < TopMargin) y = badge.y + badge.h + CardGap;
    if (y + h > view.h - Margin) {
      x = badge.x - CardGap - w >= Margin ? badge.x - CardGap - w : badge.x + badge.w + CardGap;
      x = Math.min(Math.max(x, Margin), maxX);
      y = Math.min(Math.max(badge.y + badge.h - h, TopMargin), Math.max(TopMargin, view.h - Margin - h));
    }
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.visibility = 'visible';
  });

  const picture = publicUrl(task.picture);
  return (
    <div ref={ref} className={styles.tip} role="tooltip" style={{ width: width + Padding * 2 }}>
      <div className={styles.tipHead}>
        <div className={styles.tipTitle}>{task.title}</div>
        {keys && <KeyCaps binding={keys} color="#fff" dim={false} joined className={styles.tipKeys} />}
      </div>
      <div className={styles.tipHint}>{task.hint}</div>
      {/* The picture is the clip's poster while it loads, and the whole tip with reduced motion. */}
      {task.clip && !reduced ? (
        <video
          key={task.clip}
          className={styles.tipMedia}
          style={{ aspectRatio: task.aspect || undefined }}
          src={publicUrl(task.clip)}
          poster={picture}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      ) : (
        <img
          key={picture}
          className={styles.tipMedia}
          style={{ aspectRatio: task.aspect || undefined }}
          src={picture}
          alt=""
        />
      )}
    </div>
  );
}
