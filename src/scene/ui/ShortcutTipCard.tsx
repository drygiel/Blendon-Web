// Blendon's shortcut tip card: the key just pressed and the Editor command it covers here, or where the user
// moved that command. Slides in at the Scene view's bottom right corner, or just above the tutorial badge when the
// badge sits there.
import { useSyncExternalStore } from 'react';
import { PlaygroundEvents } from '../../bridge/events.ts';
import { publicUrl } from '../../lib/links.ts';
import { ShortcutTipCard as Tips, type TipSide } from '../blendon/shortcut-tips.ts';
import { TutorialBadgeSpot, type BadgeRect } from '../blendon/tutorial/badge-spot.ts';
import type { SceneHost } from '../engine/host.ts';
import { iconUrl } from '../unity/icons.ts';
import { useViewSize } from './view-size.ts';
import styles from './ShortcutTipCard.module.scss';
import { KeyCaps } from './KeyCaps.tsx';

const Width = 400;
const Height = 44 + 72 * 2 + 24;
const RightMargin = 12;
const BottomMargin = 26;
/** Same gap as the tutorial's hover card above its badge. */
const AvoidGap = 6;
/** Where a lifted card stops in a short view. */
const TopMargin = 6;

const BlendonLogo = publicUrl('plugin/icons/B@2x.png');
const BulbIcon = publicUrl('plugin/icons/Notice_TipBulb@2x.png');

const openKeyboard = (id?: string) => PlaygroundEvents.emit('openKeyboard', { id });

// One headline per situation (ShortcutTips' titles).
const Titles = {
  Covered: ['Blendon answers this key here', "In the Scene View the Editor's command waits while Blendon's is on."],
  Moved: ['Blendon owns this shortcut now', "The Editor's own command moved to another key."],
};
const ContextSubtitle = "Outside Blendon's tool context the Editor's command answers again.";

const crowds = (x: number, y: number, badge: BadgeRect) =>
  x < badge.x + badge.w + AvoidGap &&
  x + Width > badge.x - AvoidGap &&
  y < badge.y + badge.h + AvoidGap &&
  y + Height > badge.y - AvoidGap;

function Side({ side }: { side: TipSide }) {
  const open = () => {
    Tips.dismiss();
    if (side.blendon) openKeyboard(side.id);
  };
  return (
    <div className={styles.side}>
      <span className={styles.tile}>
        <img src={side.blendon ? BlendonLogo : iconUrl('UnityLogo')} alt="" />
      </span>
      <div className={styles.text}>
        <div className={styles.name} title={side.id}>
          {side.label}
        </div>
        <div className={styles.brand + ' ' + (side.blendon ? styles.blendon : styles.unity)}>
          {side.blendon ? 'BLENDON' : 'UNITY'}
        </div>
        <KeyCaps binding={side.binding} color="#fff" dim={false} joined className={styles.caps} />
      </div>
      <div className={styles.right}>
        <button
          type="button"
          className={styles.launch + (side.blendon ? '' : ' ' + styles.primary + ' ' + styles.demoOnly)}
          title={
            side.blendon
              ? `Open Blendon's Keyboard page at "${side.label}"`
              : "In Unity this opens the Shortcuts window; it isn't part of the browser demo"
          }
          onClick={side.blendon ? open : undefined}
        >
          {side.blendon ? 'Open in Blendon' : 'Open in Unity'}
          <span className={styles.chevron}>›</span>
        </button>
        <div className={styles.note} title="Where this key is heard">
          {side.context}
        </div>
      </div>
    </div>
  );
}

export function ShortcutTipCard({ host }: { host: SceneHost }) {
  useSyncExternalStore(Tips.subscribe, () => Tips.version);
  // Dragged or closed, the badge moves a lifted card with it.
  useSyncExternalStore(TutorialBadgeSpot.subscribe, () => TutorialBadgeSpot.version);
  const view = useViewSize(host);

  const card = Tips.card;
  if (!card || view.w < Width + RightMargin * 2 || view.h < Height + BottomMargin + 8) return null;
  const [title, subtitle] = Titles[card.story];
  const docked = view.w - Width - RightMargin;
  const x = view.w + (docked - view.w) * Tips.progress;
  let y = view.h - Height - BottomMargin;
  // Tested at the docked spot, so the card doesn't hop while it slides in. Never moved sideways: the right edge is
  // where it slides in from.
  const badge = TutorialBadgeSpot.bounds;
  if (badge && crowds(docked, y, badge)) y = Math.max(TopMargin, badge.y - AvoidGap - Height);

  return (
    <div
      className={styles.card}
      style={{ left: Math.round(x), top: Math.round(y), width: Width, height: Height }}
      role="status"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => Tips.setHovered(true)}
      onPointerLeave={() => Tips.setHovered(false)}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={styles.header}>
        <span className={styles.badge}>i</span>
        <div className={styles.headText}>
          <div className={styles.title}>{title}</div>
          <div className={styles.subtitle}>{card.contextual ? ContextSubtitle : subtitle}</div>
        </div>
        <button type="button" className={styles.close} title="Dismiss" onClick={() => Tips.dismiss()}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6.5 6.5 13.5 13.5M13.5 6.5 6.5 13.5" />
          </svg>
        </button>
      </div>
      <div className={styles.rule} />
      <Side side={card.ours} />
      <div className={styles.rule + ' ' + styles.inset} />
      <Side side={card.theirs} />
      <div className={styles.rule} />
      <div className={styles.footer}>
        <span className={styles.bulb}>
          <i style={{ maskImage: `url(${BulbIcon})`, WebkitMaskImage: `url(${BulbIcon})` }} />
        </span>
        Tip: Every Blendon key is listed on the&nbsp;
        <button
          type="button"
          className={styles.link}
          title="Open Blendon's Keyboard page"
          onClick={() => {
            Tips.dismiss();
            openKeyboard();
          }}
        >
          Keyboard page
        </button>
      </div>
    </div>
  );
}
