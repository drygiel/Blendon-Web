import type { ReactNode } from 'react';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './Playground.module.scss';

/** Section 05: the settings window, rendered by the caller. */
export function Playground({ children }: { children?: ReactNode }) {
  return (
    <Section id="playground">
      <SectionIntro eyebrow="05 / PLAYGROUND" title="Try every setting before you buy." />
      <p className={styles.lead}>
        This is the settings window as it looks in the Unity Editor, rebuilt for the browser. Flip switches, drag
        sliders, rebind keys, search, and hover any label for its tooltip. Nothing here touches a Scene view, and
        changes live only in this tab.
      </p>
      {children}
    </Section>
  );
}
