import wordmark from '../../../assets/landing/wordmark.png';
import { MANUAL_URL } from '../../../lib/links.ts';
import { ButtonLink } from '../../ui/ButtonLink.tsx';
import styles from './FinalCta.module.scss';

export function FinalCta() {
  return (
    <section id="get" className={styles.cta}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.content}>
        <img className={styles.logo} src={wordmark} alt="Blendon" width={602} height={120} loading="lazy" />
        <h2 className={styles.title}>Make the Scene view move the way your hands already do.</h2>
        <div className={styles.actions}>
          <ButtonLink href="#get">Get Blendon · [YOUR PRICE]</ButtonLink>
          <ButtonLink href={MANUAL_URL} variant="secondary" newTab>
            Read the manual (PDF)
          </ButtonLink>
        </div>
        <span className={styles.meta}>Unity Asset Store · v1.0.0 · Released 2026-09-04</span>
      </div>
    </section>
  );
}
