import { CONTESTED_KEYS, FEATURE_PRESETS, type ContestedKey } from '../../content/pace.ts';
import { plotPart } from '../../plotter/contract.ts';
import { CardGrid, InfoCard } from '../../ui/InfoCard.tsx';
import { Keys } from '../../ui/KeyCap.tsx';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import table from '../../ui/Table.module.scss';
import styles from './Pace.module.scss';

/** One preset's column: what the key does there, and where the other command goes. */
function Owner({
  does,
  other,
  to,
  after,
}: {
  does: string;
  other: string;
  to: ContestedKey['unityTo'];
  after?: string;
}) {
  return (
    <>
      <span className={styles.does}>{does}</span>
      <span className={styles.moved}>
        {typeof to === 'string' ? (
          to
        ) : (
          <>
            {other} → <Keys tokens={to} size="sm" />
            {after}
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
        lead="On first load Blendon asks one question: which keys it may take. Use Blendon keys, or just Esc, writes nothing, and Keep Unity keys moves Blendon's contested keys one modifier aside. Pick a preset any time on the Overview page of Tools → Blendon."
      />

      <div className={table.panel} {...plotPart('above')}>
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
                  <Owner does={row.blendon} other={row.unity} to={row.unityTo} after="in one click" />
                </td>
                <td data-label="Unity preset">
                  <Owner does={row.unity} other={row.blendon} to={row.blendonTo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={table.note}>
          Neither preset is a profile of its own: both work on whatever profile you are on, and keys you tune stay put,
          apart from the contested ones a preset moves. In the Scene view a covered Editor command waits, the settings
          window lists each one, and one click there moves it one modifier aside.
        </p>
      </div>

      <CardGrid min={250} data-reveal="stagger" {...plotPart('tiles')}>
        {FEATURE_PRESETS.map(([title, text]) => (
          <InfoCard key={title} label="Feature preset" title={title}>
            {text}
          </InfoCard>
        ))}
        <InfoCard label="The way back" title="One switch" accent>
          The master switch turns every Blendon key off and hands each Unity command back, your settings and keys kept
          for when it comes back on. The Editor then behaves as if Blendon were not installed.
        </InfoCard>
      </CardGrid>
    </Section>
  );
}
