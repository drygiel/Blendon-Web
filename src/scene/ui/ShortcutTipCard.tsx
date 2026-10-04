// Blendon's shortcut tip card: the key just pressed, whose it is now and where the Editor's command went.
// Slides in at the Scene view's bottom right corner, the spot the tutorial card leaves free once done.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ShortcutTipCard as Tips, type TipSide } from '../blendon/shortcut-tips.ts';
import type { SceneHost } from '../engine/host.ts';
import { iconUrl } from '../unity/icons.ts';
import styles from './ShortcutTipCard.module.scss';
import { KeyCaps } from './TutorialCard.tsx';

const Width = 400;
const Height = 44 + 72 * 2 + 24;
const RightMargin = 12;
const BottomMargin = 26;

const base = import.meta.env.BASE_URL;
const BlendonLogo = `${base}plugin/icons/B@2x.png`;
const BulbIcon = `${base}plugin/icons/Notice_TipBulb@2x.png`;

const openKeyboard = (id?: string) =>
  window.dispatchEvent(new CustomEvent('blendon:open-keyboard', { detail: { id } }));

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
  const [view, setView] = useState({ w: host.view.position.width, h: host.view.position.height });

  useEffect(() => {
    const onFrame = () => {
      const p = host.view.position;
      setView((v) => (v.w === p.width && v.h === p.height ? v : { w: p.width, h: p.height }));
    };
    host.frameListeners.add(onFrame);
    return () => void host.frameListeners.delete(onFrame);
  }, [host]);

  const card = Tips.card;
  if (!card || view.w < Width + RightMargin * 2 || view.h < Height + BottomMargin + 8) return null;
  const docked = view.w - Width - RightMargin;
  const x = view.w + (docked - view.w) * Tips.progress;

  return (
    <div
      className={styles.card}
      style={{ left: Math.round(x), top: view.h - Height - BottomMargin, width: Width, height: Height }}
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
          <div className={styles.title}>Blendon owns this shortcut now</div>
          <div className={styles.subtitle}>The Editor&apos;s own command stepped aside for Blendon&apos;s.</div>
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
