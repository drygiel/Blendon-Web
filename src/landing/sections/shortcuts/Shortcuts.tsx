import { Fragment } from 'react';
import { SHORTCUTS } from '../../data/content.ts';
import { KeyCap, Keys } from '../../ui/KeyCap.tsx';
import { Eyebrow, Lead, Section, SectionTitle } from '../../ui/Section.tsx';
import styles from './Shortcuts.module.scss';

const WHILE_DRAGGING = [
  [['X', 'Y', 'Z'], 'constrain'],
  [['0–9'], 'type a value'],
  [['Enter', 'LMB'], 'confirm'],
  [['Esc', 'RMB'], 'cancel'],
] as const;

export function Shortcuts() {
  return (
    <Section id="shortcuts" plate="keyboard">
      <div className={styles.head}>
        <div className={styles.intro}>
          <Eyebrow>10 / SHORTCUTS</Eyebrow>
          <SectionTitle>
            Every default, <em>on one sheet.</em>
          </SectionTitle>
          <Lead>
            All of them rebindable from Blendon&apos;s settings window or Unity&apos;s Edit → Shortcuts. On macOS, Ctrl
            and Alt read Cmd and Option.
          </Lead>
        </div>
        <span className={styles.preset} data-reveal="rise">
          Blendon keyboard preset
        </span>
      </div>

      <div className={styles.sheet} data-reveal="stagger">
        {SHORTCUTS.map(([action, keys]) => (
          <div key={action} className={styles.row}>
            <span className={styles.action}>{action}</span>
            <Keys tokens={keys} end />
          </div>
        ))}
      </div>

      <div className={styles.dragging} data-reveal="rise">
        <span className={styles.draggingLabel}>WHILE DRAGGING</span>
        {WHILE_DRAGGING.map(([keys, text]) => (
          <Fragment key={text}>
            {keys.map((k) => (
              <KeyCap key={k}>{k}</KeyCap>
            ))}
            <span className={styles.draggingText}>{text}</span>
          </Fragment>
        ))}
      </div>
    </Section>
  );
}
