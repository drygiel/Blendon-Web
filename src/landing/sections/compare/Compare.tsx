import type { CSSProperties } from 'react';
import { cx } from '../../../lib/cx.ts';
import { COMPARISON } from '../../data/content.ts';
import { Keys } from '../../ui/KeyCap.tsx';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import table from '../../ui/Table.module.scss';
import styles from './Compare.module.scss';

/** Everyday Scene view tasks, as Unity does them out of the box and with Blendon. */
export function Compare() {
  return (
    <Section id="compare" plate="orbits">
      <SectionIntro
        eyebrow="02 / WHAT CHANGES"
        title={
          <>
            Same Scene view. <em>Fewer detours.</em>
          </>
        }
        lead="Never used Blender? This is what changes in an ordinary working day, next to how Unity does it out of the box."
      />
      <div className={table.panel} data-plot-anchor="compare-table">
        <table className={table.table} style={{ '--first-col': '25%' } as CSSProperties}>
          <caption className={table.caption}>Scene view tasks in Unity and with Blendon</caption>
          <thead>
            <tr>
              <th scope="col">You want to</th>
              <th scope="col">Unity today</th>
              <th scope="col" className={table.lit}>
                With Blendon
              </th>
            </tr>
          </thead>
          <tbody data-reveal="sweep">
            {COMPARISON.map((row) => (
              <tr key={row.task}>
                <th scope="row" className={styles.task}>
                  {row.task}
                </th>
                <td data-label="Unity today" className={styles.unity}>
                  {row.unity}
                </td>
                <td data-label="With Blendon" className={cx(table.lit, styles.blendon)}>
                  <span>{row.blendon}</span>
                  <Keys tokens={row.keys} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
