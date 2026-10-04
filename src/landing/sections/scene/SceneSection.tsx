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
      </div>
      <Dock />
    </section>
  );
}
