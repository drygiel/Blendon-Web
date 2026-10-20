// Blendon's shortcut tip card: one line per command, the key just pressed first. Each name is a link to where its
// key changes, and a ring round the close button counts the card's time down. Slides in at the Scene view's bottom
// right corner, or just above the tutorial badge when the badge sits there.
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PlaygroundEvents } from '../../bridge/events.ts';
import { publicUrl } from '../../lib/links.ts';
import { ShortcutTipCard as Tips, type TipSide } from '../blendon/shortcut-tips.ts';
import { TutorialBadgeSpot, type BadgeRect } from '../blendon/tutorial/badge-spot.ts';
import type { SceneHost } from '../engine/host.ts';
import { iconUrl } from '../unity/icons.ts';
import { useViewSize } from './view-size.ts';
import styles from './ShortcutTipCard.module.scss';
import { KeyCaps } from './KeyCaps.tsx';

/** The card hugs its lines; never narrower than this (ShortcutTips.MinWidth). */
const MinWidth = 300;
const Height = 9 * 2 + 20 * 2 + 4;
const RightMargin = 12;
const BottomMargin = 26;
/** Same gap as the tutorial's hover card above its badge. */
const AvoidGap = 6;
/** Where a lifted card stops in a short view. */
const TopMargin = 6;

// The countdown band sits just inside the 24 px close button.
const RingRadius = 10.75;
const RingLength = 2 * Math.PI * RingRadius;

const BlendonLogo = publicUrl('plugin/icons/B@2x.png');

const openKeyboard = (id?: string) => PlaygroundEvents.emit('openKeyboard', { id });

// Where each command answers (ShortcutTips' asides).
const InToolContext = "in Blendon's tool context";
const EverywhereElse = 'everywhere else';
const where = (context: string) => (context === 'Global' ? 'everywhere' : `in the ${context}`);

const crowds = (x: number, w: number, y: number, badge: BadgeRect) =>
  x < badge.x + badge.w + AvoidGap &&
  x + w > badge.x - AvoidGap &&
  y < badge.y + badge.h + AvoidGap &&
  y + Height > badge.y - AvoidGap;

/** Keys, logo, then the name and where it answers. Three grid cells, so every line's logo lines up. */
function Line({ side, aside, was }: { side: TipSide; aside: string; was?: string }) {
  return (
    <>
      <KeyCaps binding={side.binding} color="#fff" dim={false} joined className={styles.keys} />
      <img className={styles.logo} src={side.blendon ? BlendonLogo : iconUrl('UnityLogo')} alt="" />
      <span className={styles.text}>
        {side.blendon ? (
          <button
            type="button"
            className={styles.name + ' ' + styles.blendon}
            title={`Open Blendon's Keyboard page at "${side.label}"`}
            onClick={() => {
              Tips.dismiss();
              openKeyboard(side.id);
            }}
          >
            {side.label}
          </button>
        ) : (
          <span
            className={styles.name + ' ' + styles.unity}
            title={`In Unity this opens the Shortcuts window at "${side.label}"; it isn't part of the browser demo`}
          >
            {side.label}
          </span>
        )}
        <span className={styles.aside} title={was ? 'Its key before it moved' : 'Where this key is heard'}>
          {aside}
          {was && <KeyCaps binding={was} color="rgba(255, 255, 255, 0.52)" dim joined className={styles.was} />}
        </span>
      </span>
    </>
  );
}

export function ShortcutTipCard({ host }: { host: SceneHost }) {
  useSyncExternalStore(Tips.subscribe, () => Tips.version);
  // Dragged or closed, the badge moves a lifted card with it.
  useSyncExternalStore(TutorialBadgeSpot.subscribe, () => TutorialBadgeSpot.version);
  const view = useViewSize(host);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MinWidth);

  const card = Tips.card;

  // The width comes from the lines, read back once the card is laid out. It never changes while it shows.
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth;
    if (w) setWidth((old) => (old === w ? old : w));
  }, [card]);

  if (!card || view.w < width + RightMargin * 2 || view.h < Height + BottomMargin + 8) return null;
  const docked = view.w - width - RightMargin;
  const x = view.w + (docked - view.w) * Tips.progress;
  let y = view.h - Height - BottomMargin;
  // Tested at the docked spot, so the card doesn't hop while it slides in. Never moved sideways: the right edge is
  // where it slides in from.
  const badge = TutorialBadgeSpot.bounds;
  if (badge && crowds(docked, width, y, badge)) y = Math.max(TopMargin, badge.y - AvoidGap - Height);

  const ours = card.contextual ? InToolContext : where(card.ours.context);
  const theirs = card.story === 'Moved' ? 'was' : EverywhereElse;
  const left = Tips.remaining;

  return (
    <div
      ref={ref}
      className={styles.card}
      style={{ left: Math.round(x), top: Math.round(y), height: Height }}
      role="status"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => Tips.setHovered(true)}
      onPointerLeave={() => Tips.setHovered(false)}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={styles.lines}>
        <Line side={card.ours} aside={ours} />
        <Line side={card.theirs} aside={theirs} was={card.story === 'Moved' ? card.ours.binding : undefined} />
      </div>
      <button type="button" className={styles.close} title="Dismiss" onClick={() => Tips.dismiss()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle className={styles.track} cx="12" cy="12" r={RingRadius} />
          {left > 0 && (
            <circle
              className={styles.ring}
              cx="12"
              cy="12"
              r={RingRadius}
              strokeDasharray={RingLength}
              strokeDashoffset={-(1 - left) * RingLength}
              transform="rotate(-90 12 12)"
            />
          )}
          <path className={styles.cross} d="M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5" />
        </svg>
      </button>
    </div>
  );
}
