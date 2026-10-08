import { WORDMARK, wordmarkMask } from '../../../lib/images.ts';
import { MANUAL_URL, NEW_TAB } from '../../../lib/links.ts';
import { RELEASED, STORE_URL, TERMS, VERSION } from '../../../lib/product.ts';
import { PenTitle } from '../../plotter/PenTitle.tsx';
import { plotStore } from '../../plotter/store.ts';
import { ButtonLink } from '../../ui/ButtonLink.tsx';
import styles from './FinalCta.module.scss';

/** The background draws the protractor's rays in and the footer's aurora turns blue while the button is pointed at. */
const hover = (on: boolean) => () => {
  plotStore.cta.hover = on;
  document.documentElement.toggleAttribute('data-cta-hover', on);
};

const PERKS = [
  'Full C# source included',
  'Illustrated PDF manual',
  'Editor-only: nothing in your builds',
  'Frequent updates',
];

export function FinalCta() {
  return (
    <section id="get" className={styles.cta} data-plate="finale" data-hud="13 / GET BLENDON">
      <div className={styles.content}>
        <span className={styles.logo} style={wordmarkMask(281)}>
          <img
            src={WORDMARK.src}
            srcSet={WORDMARK.srcSet}
            sizes="281px"
            alt="Blendon"
            width={602}
            height={120}
            loading="lazy"
          />
        </span>
        <PenTitle className={styles.title}>
          Make the Scene view move the way your hands <em>already do.</em>
        </PenTitle>
        <ul className={styles.perks} data-reveal="stagger">
          {PERKS.map((perk) => (
            <li key={perk}>{perk}</li>
          ))}
        </ul>
        {/* The pen ends its path circling this button; a protractor is drawn under it. */}
        <span
          className={styles.buy}
          data-plot-anchor="cta-button"
          onPointerEnter={hover(true)}
          onPointerLeave={hover(false)}
          onFocus={hover(true)}
          onBlur={hover(false)}
        >
          <ButtonLink href={STORE_URL}>Get Blendon</ButtonLink>
        </span>
        <span className={styles.terms} data-reveal="rise">
          {TERMS}
        </span>
      </div>
      <div className={styles.footline} data-reveal="rise">
        <span>
          Unity Asset Store · v{VERSION} · Released {RELEASED}
        </span>
        <a href={MANUAL_URL} {...NEW_TAB}>
          Read the manual (PDF)
        </a>
      </div>
    </section>
  );
}
