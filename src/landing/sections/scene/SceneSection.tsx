import { Section, SectionIntro } from '../../ui/Section.tsx';
import { SceneSlot } from './SceneSlot.tsx';
import styles from './SceneSection.module.scss';

/** Section 05: a Scene view running Blendon in the browser. */
export function SceneSection() {
  return (
    <Section id="try">
      <SectionIntro eyebrow="05 / TRY IT" title="Feel it in your hands, right here." />
      <p className={styles.lead}>
        A Unity Scene view with Blendon installed, simulated in the browser. Click into it, then orbit with the middle
        mouse button, press G to grab, type a distance, hold Z for a pie menu. Same keys, same gizmos, same feel as in
        the Editor.
      </p>
      <SceneSlot />
    </Section>
  );
}
