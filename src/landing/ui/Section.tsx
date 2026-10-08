import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { plotSection, type PlateName, type RouteKind } from '../plotter/contract.ts';
import { PenTitle } from '../plotter/PenTitle.tsx';
import { TypeText } from '../plotter/TypeText.tsx';
import styles from './Section.module.scss';

interface SectionProps {
  id: string;
  children: ReactNode;
  className?: string;
  /** The background plotter's drawing for this section. */
  plate?: PlateName;
  /** The pen's way past this section. */
  route?: RouteKind;
}

/** A page-width landing section. */
export function Section({ id, children, className, plate, route }: SectionProps) {
  return (
    <section id={id} className={cx(styles.section, className)} {...plotSection({ plate, route })}>
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
    <div className={cx(styles.intro, className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <SectionTitle>{title}</SectionTitle>
      {lead && <Lead>{lead}</Lead>}
    </div>
  );
}

/** Typed out when the pen starts the section's title; the number before " / " takes the accent. */
export function Eyebrow({ children }: { children: string }) {
  const cut = children.indexOf(' / ');
  return (
    <span className={styles.eyebrow} data-eyebrow="">
      <TypeText text={children} accent={Math.max(0, cut)} />
    </span>
  );
}

/** Written by the background plotter's pen. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <PenTitle className={styles.title}>{children}</PenTitle>;
}

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className={styles.lead} data-reveal="rise">
      {children}
    </p>
  );
}
