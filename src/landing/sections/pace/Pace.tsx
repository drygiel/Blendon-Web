import { CONTESTED_KEYS, FEATURE_PRESETS, type ContestedKey } from '../../content/pace.ts';
import { plotPart } from '../../plotter/contract.ts';
import { CardGrid, InfoCard } from '../../ui/InfoCard.tsx';
import { Keys } from '../../ui/KeyCap.tsx';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import table from '../../ui/Table.module.scss';
import styles from './Pace.module.scss';

/** One preset's column: what the key does there, and where the other command goes. */
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
        lead="On first load Blendon asks which keys it may take. Use Blendon keys, the default, keeps Blender's keys, moves the Editor's commands on them one modifier aside and, while Blendon runs, gives the right-click to Blendon's menu. On Unity's read-only Default profile it first makes an editable copy. Keep Unity keys moves Blendon's contested keys aside instead. Skip, or Esc, changes nothing. Change the keyboard preset any time on the Overview page of Tools → Blendon."
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
          Neither preset is a profile: both work on your current profile, and keys you tune stay put unless a preset
          moves them as contested. One click on a row in the settings window swaps just that pair, so the two never
          share a key.
        </p>
      </div>

      <CardGrid min={250} data-reveal="stagger" {...plotPart('tiles')}>
        {FEATURE_PRESETS.map(([title, text]) => (
          <InfoCard key={title} label="Feature preset" title={title}>
            {text}
          </InfoCard>
        ))}
        <InfoCard label="The way back" title="One switch" accent>
          The master switch turns every Blendon key off and gives each Unity command back, as if Blendon were not
          installed. Your settings and keys stay for when it is back on.
        </InfoCard>
      </CardGrid>
    </Section>
  );
}
