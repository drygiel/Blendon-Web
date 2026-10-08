import { FAQ } from '../../content/faq.ts';
import { plotHold } from '../../plotter/contract.ts';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './Faq.module.scss';

export function Faq() {
  return (
    <Section id="faq" plate="bezier">
      <SectionIntro
        eyebrow="12 / FAQ"
        title={
          <>
            Questions <em>before you buy.</em>
          </>
        }
      />
      <div className={styles.list} data-reveal="stagger">
        {FAQ.map(({ q, a, link }) => (
          <details key={q} className={styles.item} {...plotHold}>
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
