import type { ReactNode } from 'react';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './UnderTheHood.module.scss';

const Code = ({ children }: { children: ReactNode }) => <span className={styles.code}>{children}</span>;

const COLUMNS: [string, ReactNode[]][] = [
  [
    'REQUIRES',
    [
      'Unity 6000.0 or newer',
      'Built-in Render Pipeline, URP or HDRP',
      'Windows, macOS or Linux',
      'A numeric keypad, only for Numpad Views',
    ],
  ],
  [
    'WRITES ONLY TO',
    [
      <>
        <Code>EditorPrefs</Code> for settings
      </>,
      'Its own Shortcut Manager profile for keys',
      <>
        <Code>Blendon/PieMenus.json</Code> in your user settings folder
      </>,
    ],
  ],
  [
    'NEVER',
    ['Ships code into a player build', 'Makes a network request', 'Collects analytics', 'Installs other packages'],
  ],
];

export function UnderTheHood() {
  return (
    <Section id="hood">
      <SectionIntro eyebrow="09 / UNDER THE HOOD" title="Built to stay out of your project." />
      <div className={styles.cards}>
        {COLUMNS.map(([label, items]) => (
          <div key={label} className={styles.card}>
            <span className={styles.label}>{label}</span>
            <ul className={styles.list}>
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
