import { Fragment, useState } from 'react';
import { cx } from '../../../lib/cx.ts';
import { SHORTCUTS } from '../../content/shortcuts.ts';
import { KeyCap, Keys } from '../../ui/KeyCap.tsx';
import { Eyebrow, Lead, Section, SectionTitle } from '../../ui/Section.tsx';
import styles from './Shortcuts.module.scss';

const WHILE_DRAGGING = [
  [['X', 'Y', 'Z'], 'constrain'],
  [['0–9'], 'type a value'],
  [['Enter', 'Mouse 0'], 'confirm'],
  [['Esc', 'Mouse 1'], 'cancel'],
] as const;

type Preset = 'blendon' | 'unity';

const PRESETS: [Preset, string][] = [
  ['blendon', 'Blendon preset'],
  ['unity', 'Unity preset'],
];

export function Shortcuts() {
  const [preset, setPreset] = useState<Preset>('blendon');
  return (
    <Section id="shortcuts" plate="keyboard" route="right">
      <div className={styles.head}>
        <div className={styles.intro}>
          <Eyebrow>10 / SHORTCUTS</Eyebrow>
          <SectionTitle>
            Every key, <em>on one sheet.</em>
          </SectionTitle>
          <Lead>
            The keys each keyboard preset gives, all but the wheel rebindable from Blendon&apos;s settings window or
            Unity&apos;s Edit → Shortcuts. On the Unity preset the Editor keeps its own and the contested ones move. On
            macOS, Ctrl and Alt read Cmd and Option, apart from the View pie&apos;s Ctrl+`.
          </Lead>
        </div>
        <div className={styles.presets} role="group" aria-label="Keyboard preset" data-reveal="rise">
          {PRESETS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === preset}
              className={cx(styles.preset, id === preset && styles.presetOn)}
              onClick={() => setPreset(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.sheet} data-reveal="stagger">
        {SHORTCUTS.map(([action, blendon, unity]) => {
          const moved = preset === 'unity' && !!unity;
          return (
            <div key={action} className={cx(styles.row, moved && styles.moved)}>
              <span className={styles.action}>{action}</span>
              <Keys tokens={moved ? unity : blendon} end />
            </div>
          );
        })}
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
