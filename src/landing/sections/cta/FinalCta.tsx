import wordmark from '../../../assets/landing/wordmark.png';
import { MANUAL_URL } from '../../../lib/links.ts';
import { PRICE, RELEASED, STORE_URL, TERMS, VERSION } from '../../../lib/product.ts';
import { ButtonLink } from '../../ui/ButtonLink.tsx';
import styles from './FinalCta.module.scss';

const PERKS = [
  'Full C# source included',
  'Illustrated PDF manual',
  'Editor-only: nothing in your builds',
  'Frequent updates',
];

export function FinalCta() {
  return (
    <section id="get" className={styles.cta}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.content}>
        <img className={styles.logo} src={wordmark} alt="Blendon" width={602} height={120} loading="lazy" />
        <h2 className={styles.title}>Make the Scene view move the way your hands already do.</h2>
        <ul className={styles.perks}>
          {PERKS.map((perk) => (
            <li key={perk}>{perk}</li>
          ))}
        </ul>
        <div className={styles.actions}>
          <ButtonLink href={STORE_URL}>Get Blendon · {PRICE}</ButtonLink>
          <ButtonLink href={MANUAL_URL} variant="secondary" newTab>
            Read the manual (PDF)
          </ButtonLink>
        </div>
        <span className={styles.terms}>{TERMS}</span>
        <span className={styles.meta}>
          Unity Asset Store · v{VERSION} · Released {RELEASED}
        </span>
      </div>
    </section>
  );
}
