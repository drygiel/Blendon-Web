import type { ReactNode } from 'react';
import styles from './Section.module.scss';

interface SectionProps {
  id: string;
  children: ReactNode;
  className?: string;
}

/** A page-width landing section. */
export function Section({ id, children, className }: SectionProps) {
  return (
    <section id={id} className={[styles.section, className].filter(Boolean).join(' ')}>
      {children}
    </section>
  );
}

interface IntroProps {
  /** "01 / FEATURES" style label. */
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
}

/** The numbered label, heading and lead paragraph every section opens with. */
export function SectionIntro({ eyebrow, title, lead, className }: IntroProps) {
  return (
    <div className={[styles.intro, className].filter(Boolean).join(' ')}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className={styles.title}>{title}</h2>
      {lead && <p className={styles.lead}>{lead}</p>}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className={styles.eyebrow}>{children}</span>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={styles.title}>{children}</h2>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className={styles.lead}>{children}</p>;
}
