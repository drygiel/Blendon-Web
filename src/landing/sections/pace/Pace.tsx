import { cx } from '../../../lib/cx.ts';
import { CONTESTED_KEYS, FEATURE_PRESETS, type ContestedKey } from '../../data/content.ts';
import { Keys } from '../../ui/KeyCap.tsx';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import table from '../../ui/Table.module.scss';
import styles from './Pace.module.scss';

/** One preset's column: what the key does there, and where the other command went. */
function Owner({ does, other, to }: { does: string; other: string; to: ContestedKey['unityTo'] }) {
  return (
    <>
      <span className={styles.does}>{does}</span>
      <span className={styles.moved}>
        {typeof to === 'string' ? (
          to
        ) : (
          <>
            {other} → <Keys tokens={to} size="sm" />
          </>
        )}
      </span>
    </>
  );
}

export function Pace() {
  return (
    <Section id="pace" plate="waves" route="tiles">
      <SectionIntro
        eyebrow="08 / YOUR PACE"
        title={
          <>
            Keep your Unity habits. <em>Pick up Blender&apos;s at your own pace.</em>
          </>
        }
        lead="On first load Blendon asks one question: which keys it may take. Nothing is written until you answer, and the answer can be changed any time on the Overview page of Tools → Blendon."
      />

      <div className={table.panel}>
        <table className={table.table}>
          <caption className={table.caption}>Who keeps a contested key, on each keyboard preset</caption>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Blendon preset</th>
              <th scope="col">Unity preset</th>
            </tr>
          </thead>
          <tbody data-reveal="sweep">
            {CONTESTED_KEYS.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <Keys tokens={row.keys} />
                </th>
                <td data-label="Blendon preset">
                  <Owner does={row.blendon} other={row.unity} to={row.unityTo} />
                </td>
                <td data-label="Unity preset">
                  <Owner does={row.unity} other={row.blendon} to={row.blendonTo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={table.note}>
          Both presets are real Unity shortcut profiles. The command that loses a key moves one modifier aside, and the
          settings window lists every pair.
        </p>
      </div>

      <div className={styles.cards} data-reveal="stagger" data-plot-tiles="">
        {FEATURE_PRESETS.map(([title, text]) => (
          <div key={title} className={styles.card}>
            <span className={styles.label}>Feature preset</span>
            <span className={styles.cardTitle}>{title}</span>
            <span className={styles.cardText}>{text}</span>
          </div>
        ))}
        <div className={cx(styles.card, styles.back)}>
          <span className={styles.label}>The way back</span>
          <span className={styles.cardTitle}>One switch</span>
          <span className={styles.cardText}>
            The master switch parks every Blendon key and hands each Unity command back, your settings kept. Default in
            Edit → Shortcuts undoes every key change at once.
          </span>
        </div>
      </div>
    </Section>
  );
}
