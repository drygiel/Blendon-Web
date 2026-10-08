// TutorialTip: the hover card of a tutorial row - title and hint over the feature's own picture, with its
// header clip looping over it where it has one. Drawn beside the tutorial card, level with the row.
import { useLayoutEffect, useRef } from 'react';
import type { TutorialTask as TipTask } from '../../plugin/tutorial.ts';
import { useReducedMotion } from '../../lib/hooks.ts';
import styles from './TutorialCard.module.scss';

/** Seconds the cursor has to rest on a row, the same wait as the settings window's cards. */
export const TipShowDelayMs = 500;

const ContentWidth = 320;
const Padding = 10;
const CardGap = 6;
const Margin = 6;
const TopMargin = 30;

const publicUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

interface TutorialTipProps {
  tip: TipTask;
  row: HTMLElement;
  /** The tutorial card, in view coordinates. */
  card: { x: number; y: number; w: number };
  view: { w: number; h: number };
}

export function TutorialTip({ tip, row, card, view }: TutorialTipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const width = Math.min(ContentWidth, Math.max(0, view.w - Margin * 2 - Padding * 2));

  // Placed after layout on every render, since the row slides while the card scrolls its window.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !parent) return;
    const r = row.getBoundingClientRect();
    const anchorY = r.top + r.height / 2 - parent.getBoundingClientRect().top;
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    // Beside the card on whichever side has room.
    let x = card.x - CardGap - w;
    if (x < Margin && card.x + card.w + CardGap + w <= view.w - Margin) x = card.x + card.w + CardGap;
    x = Math.min(Math.max(x, Margin), Math.max(Margin, view.w - Margin - w));
    const y = Math.min(Math.max(anchorY - h / 2, TopMargin), Math.max(TopMargin, view.h - Margin - h));

    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.visibility = 'visible';
  });

  const picture = publicUrl(tip.picture);
  return (
    <div ref={ref} className={styles.tip} role="tooltip" style={{ width: width + Padding * 2 }}>
      <div className={styles.tipTitle}>{tip.title}</div>
      <div className={styles.tipHint}>{tip.hint}</div>
      {/* The picture is the clip's poster while it loads. */}
      {tip.clip && !reduced ? (
        <video
          key={tip.clip}
          className={styles.tipMedia}
          src={publicUrl(tip.clip)}
          poster={picture}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      ) : (
        <img key={picture} className={styles.tipMedia} src={picture} alt="" />
      )}
    </div>
  );
}
