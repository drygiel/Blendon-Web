import { useState } from 'react';
import { cx } from '../../../lib/cx.ts';
import { PIES } from '../../data/content.ts';
import { Keys } from '../../ui/KeyCap.tsx';
import { PickButton } from '../../ui/PickButton.tsx';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './PieMenus.module.scss';

// Blender's pie order: left, up, right, down, then upper-right, lower-right, lower-left, upper-left.
const DIRS = [180, 90, 0, 270, 45, 315, 225, 135];

const CARDS = [
  ['Build your own', 'A visual editor makes new pies from Editor actions or any menu command, on any key.'],
  ['Numbered items', 'While a pie is open, the top-row or keypad number runs its item directly.'],
  [
    'State at a glance',
    "The active tool, draw mode or snap toggle is tinted blue. Items that can't run are greyed in place, so the ring never shifts.",
  ],
] as const;

export function PieMenus() {
  const [pieId, setPieId] = useState('draw');
  const [hot, setHot] = useState(-1);
  const pie = PIES.find((p) => p.id === pieId) ?? PIES[0];
  if (!pie) return null;

  const disabled = new Set(pie.disabled);
  const hotDir = hot >= 0 && hot < pie.items.length && !disabled.has(hot) ? DIRS[hot] : undefined;

  return (
    <Section id="pies">
      <SectionIntro
        eyebrow="03 / PIE MENUS"
        title="Eight pies. One key each."
        lead="Hold the key, flick toward an item and let go. Or tap it and the menu stays open for a click. Selection is by angle alone, so a flick far past an item still picks it. Hover the items below."
      />

      <div className={styles.explorer}>
        <div className={styles.list}>
          {PIES.map((p) => (
            <PickButton
              key={p.id}
              compact
              accent="blue"
              selected={p.id === pie.id}
              onPick={() => {
                setPieId(p.id);
                setHot(-1);
              }}
              title={p.title}
              aside={<Keys tokens={['~hold', ...p.keys]} size="sm" />}
            />
          ))}
        </div>

        <div className={styles.stage}>
          <div className={styles.pie}>
            <div className={styles.ring} />
            <div
              className={styles.dir}
              style={{ transform: `rotate(${180 - (hotDir ?? 180)}deg)`, opacity: hotDir === undefined ? 0 : 1 }}
            />
            <div className={styles.title}>{pie.title}</div>
            {pie.items.map((label, i) => {
              const a = ((DIRS[i] ?? 0) * Math.PI) / 180;
              const off = disabled.has(i);
              return (
                <button
                  key={label}
                  type="button"
                  aria-disabled={off}
                  className={cx(
                    styles.item,
                    off ? styles.disabled : i === hot ? styles.hot : i === pie.active && styles.active,
                  )}
                  style={{
                    left: `${(50 + 36 * Math.cos(a)).toFixed(2)}%`,
                    top: `${(50 - 38 * Math.sin(a)).toFixed(2)}%`,
                  }}
                  onMouseEnter={() => setHot(i)}
                  onMouseLeave={() => setHot(-1)}
                  onFocus={() => setHot(i)}
                  onBlur={() => setHot(-1)}
                >
                  <span>{label}</span>
                  <span className={styles.num}>{i + 1}</span>
                </button>
              );
            })}
          </div>
          <p className={styles.note}>{pie.note}</p>
        </div>
      </div>

      <div className={styles.cards}>
        {CARDS.map(([title, text]) => (
          <div key={title} className={styles.card}>
            <span className={styles.cardTitle}>{title}</span>
            <span className={styles.cardText}>{text}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
