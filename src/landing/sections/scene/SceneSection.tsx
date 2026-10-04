import { SectionIntro } from '../../ui/Section.tsx';
import { Dock } from './Dock.tsx';
import styles from './SceneSection.module.scss';

/** Section 05: a Scene view running Blendon and Blendon's settings window, side by side or as tabs. */
export function SceneSection() {
  return (
    <section id="try" className={styles.section}>
      <div className={styles.intro}>
        <SectionIntro eyebrow="05 / TRY IT" title="Feel it in your hands, right here." />
        <p className={styles.lead}>
          A Unity Scene view with Blendon installed and Blendon&apos;s settings window, simulated in the browser. Click
          into the Scene view, then orbit with the middle mouse button, press G to grab, type a distance, hold Z for a
          pie menu. Flip a switch or rebind a key in the Blendon tab and the Scene view follows. Changes live only on
          this page.
        </p>
        <p className={styles.warn} role="note">
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
      <Dock />
    </section>
  );
}
