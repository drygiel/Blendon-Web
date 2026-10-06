import type { ReactNode } from 'react';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './UnderTheHood.module.scss';

const SPECS = [
  ['EDITOR-ONLY', 'Adds nothing to player builds. No runtime components, Editor assemblies only.'],
  ['PRIVATE', 'No network requests, no analytics, no extra packages installed.'],
  ['OPTIONAL', "Every feature switches off on its own. Each gizmo falls back to Unity's."],
  ['OPEN', 'Full C# source included, plus an illustrated PDF manual.'],
] as const;

const Code = ({ children }: { children: ReactNode }) => <span className={styles.code}>{children}</span>;

const COLUMNS: [string, ReactNode[]][] = [
  [
    'REQUIRES',
    [
      'Unity 6000.0 or newer',
      'Built-in Render Pipeline, URP or HDRP',
      'Windows, macOS or Linux',
      'A middle mouse button for orbit and pan. On a trackpad, rebind both in Tools → Blendon',
      'A numeric keypad, only for Numpad Views. Without one, the View pie and the Orientation Gizmo reach the same views',
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
];

export function UnderTheHood() {
  return (
    <Section id="hood">
      <SectionIntro eyebrow="11 / UNDER THE HOOD" title="Built to stay out of your project." />
      <div className={styles.specs}>
        {SPECS.map(([label, text]) => (
          <div key={label} className={styles.spec}>
            <span className={styles.specLabel}>{label}</span>
            <span className={styles.specText}>{text}</span>
          </div>
        ))}
      </div>
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
