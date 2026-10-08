import { STORE_URL, TERMS } from '../../../lib/product.ts';
import { plotAnchor, plotSection } from '../../plotter/contract.ts';
import { ButtonLink } from '../../ui/ButtonLink.tsx';
import { SectionIntro } from '../../ui/Section.tsx';
import { Dock } from '../../../playground/dock/Dock.tsx';
import styles from './TrySection.module.scss';

/** A Scene view running Blendon and Blendon's settings window, side by side or as tabs. */
export function TrySection() {
  return (
    <section id="try" {...plotSection({ plate: ['frame', 'network'], route: 'net' })}>
      <div className={styles.intro} {...plotAnchor('try-intro')}>
        <SectionIntro
          eyebrow="09 / TRY IT"
          title={
            <>
              Feel it in your hands, <em>right here.</em>
            </>
          }
        />
        <p className={styles.lead} data-reveal="rise">
          A Unity Scene view with Blendon installed and Blendon&apos;s settings window, simulated in the browser. Click
          into the Scene view, then orbit with the middle mouse button, press G to grab, type a distance, hold Z for a
          pie menu. Flip a switch or rebind a key in the Blendon tab and the Scene view follows. Changes live only on
          this page.
        </p>
        <p className={styles.warn} role="note" data-reveal="rise">
          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
            <path d="M8 1.5 15 14H1z" />
            <path d="M8 6v4M8 11.6v.4" />
          </svg>
          <span>
            <strong>Demo only.</strong> This is a browser simulation of Unity and Blendon. Some features may not work
            properly or may be unavailable in the browser.
          </span>
        </p>
      </div>
      <Dock {...plotAnchor('try-dock')} data-reveal="fade" />
      <div className={styles.buyRow}>
        <div className={styles.buy}>
          <div className={styles.buyText}>
            <strong>Like how it feels?</strong>
            <span>The real thing runs in your Unity 6 Editor, in every scene you open.</span>
          </div>
          <div className={styles.buyAction}>
            <ButtonLink href={STORE_URL} newTab>
              Get Blendon
            </ButtonLink>
            <span className={styles.terms}>{TERMS}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
