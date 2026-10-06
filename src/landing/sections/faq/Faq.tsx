import { FAQ } from '../../data/content.ts';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './Faq.module.scss';

export function Faq() {
  return (
    <Section id="faq">
      <SectionIntro eyebrow="12 / FAQ" title="Questions before you buy." />
      <div className={styles.list}>
        {FAQ.map(({ q, a, link }) => (
          <details key={q} className={styles.item}>
            <summary className={styles.question}>{q}</summary>
            <p className={styles.answer}>
              {a}
              {link && (
                <>
                  {' '}
                  <a href={link[0]}>{link[1]}</a>
                </>
              )}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
