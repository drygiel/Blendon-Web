import { Fragment } from 'react';
import { KeyCap, Keys } from '../../ui/KeyCap.tsx';
import { Eyebrow, Lead, Section, SectionTitle } from '../../ui/Section.tsx';
import type { KeyTokens } from '../../data/content.ts';
import styles from './Precision.module.scss';

const SEQUENCE = [
  ['G', 'GRAB'],
  ['X', 'AXIS'],
  ['2', 'TYPE'],
  ['Enter', 'CONFIRM'],
] as const;

const WHILE_DRAGGING: [KeyTokens, string][] = [
  [['X', 'Y', 'Z'], 'Constrain to an axis. Press again for the other orientation.'],
  [['Shift', '~+', 'X'], 'Lock the plane of the other two axes.'],
  [['0–9', '.'], 'Type the value. The mouse stops driving the transform.'],
  [['−'], 'Toggle the sign.'],
  [['Backspace'], 'Delete a digit. On an empty field, hand control back to the mouse.'],
  [['Enter', 'LMB'], 'Confirm.'],
  [['Esc', 'RMB'], 'Cancel and restore the pre-drag transform.'],
];

const MODIFIERS: [KeyTokens, string, string][] = [
  [['Shift'], 'Precision drag', 'Slows any drag down for fine placement.'],
  [['Ctrl'], 'Snap ticks', "Steps from tick to tick with Unity's grid, rotation and scale snapping."],
  [['Alt'], 'Surface snap & look-at', 'Move drops onto the surface under the cursor. Rotate aims at it.'],
  [
    ['V', '~·', 'Shift', '~+', 'V'],
    'Vertex snapping',
    'Vertex to vertex, or any vertex as a virtual pivot. Skinned meshes included.',
  ],
];

export function Precision() {
  return (
    <Section id="precision">
      <div className={styles.split}>
        <div className={styles.intro}>
          <Eyebrow>04 / PRECISION</Eyebrow>
          <SectionTitle>No handle to hunt for. Just type the number.</SectionTitle>
          <Lead>
            Press G, R or S anywhere in the Scene view and the selection follows the cursor. Constrain with X, Y or Z,
            type an exact value, confirm with Enter. Typing works mid-drag on any gizmo handle too, and right-click puts
            everything back.
          </Lead>
          <div className={styles.sequence}>
            {SEQUENCE.map(([key, label], i) => (
              <Fragment key={key}>
                {i > 0 && <span className={styles.arrow}>→</span>}
                <div className={styles.step}>
                  <KeyCap size="xl" wide={key.length > 1}>
                    {key}
                  </KeyCap>
                  <span className={styles.stepLabel}>{label}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span>WHILE DRAGGING</span>
            <span className={styles.readout}>Δx: 2.000 m Global</span>
          </div>
          <div className={styles.rows}>
            {WHILE_DRAGGING.map(([keys, text]) => (
              <div key={text} className={styles.row}>
                <Keys tokens={keys} className={styles.rowKeys} />
                <span className={styles.rowText}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.cards}>
        {MODIFIERS.map(([keys, title, text]) => (
          <div key={title} className={styles.card}>
            <Keys tokens={keys} className={styles.cardKeys} />
            <span className={styles.cardTitle}>{title}</span>
            <span className={styles.cardText}>{text}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
