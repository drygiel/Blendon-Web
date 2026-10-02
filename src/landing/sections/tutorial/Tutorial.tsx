import tutorialCard from '../../../assets/landing/tutorial-card.png';
import { Eyebrow, Lead, Section, SectionTitle } from '../../ui/Section.tsx';
import styles from './Tutorial.module.scss';

const CHAPTERS = [
  'Navigating the View',
  'Grab, Rotate, Scale',
  'Handles & Snapping',
  'Precision',
  'Scene Tools',
  'Pie Menus & Setup',
];

export function Tutorial() {
  return (
    <Section id="tutorial">
      <div className={styles.split}>
        <div className={styles.intro}>
          <Eyebrow>06 / TUTORIAL</Eyebrow>
          <SectionTitle>Never touched Blender? The Scene view teaches you.</SectionTitle>
          <Lead>
            A checklist card walks through the gestures right in the Scene view. A task ticks off only when you actually
            perform it, not when you read about it. Progress follows you across projects.
          </Lead>
          <div className={styles.stats}>
            <span className={styles.stat}>
              <span className={styles.statValue}>{CHAPTERS.length}</span>
              <span className={styles.statLabel}>CHAPTERS</span>
            </span>
            <span className={styles.stat}>
              <span className={styles.statValue}>33</span>
              <span className={styles.statLabel}>TASKS</span>
            </span>
          </div>
        </div>
        <div className={styles.media}>
          <div className={styles.card}>
            <img
              src={tutorialCard}
              width={619}
              height={433}
              alt="Tutorial card in the Scene view, chapter one with two of seven tasks done"
              loading="lazy"
            />
          </div>
          <ol className={styles.chapters}>
            {CHAPTERS.map((c, i) => (
              <li key={c}>
                <span className={styles.chapterNum}>{String(i + 1).padStart(2, '0')}</span>
                {c}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}
