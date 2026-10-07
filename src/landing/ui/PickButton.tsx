import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './PickButton.module.scss';

interface PickButtonProps {
  selected: boolean;
  onPick: () => void;
  title: string;
  /** Right-hand side, usually the keys. */
  aside: ReactNode;
  accent?: 'orange' | 'blue';
  compact?: boolean;
  /** The background plotter's pen follows the pointer to this row. */
  hold?: boolean;
}

/** A row of a feature or pie list: dot, title and keys, highlighted while selected. */
export function PickButton({
  selected,
  onPick,
  title,
  aside,
  accent = 'orange',
  compact = false,
  hold = false,
}: PickButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-plot-hold={hold ? '' : undefined}
      onClick={onPick}
      className={cx(styles.row, compact && styles.compact, selected && styles.on, accent === 'blue' && styles.blue)}
    >
      <span className={styles.title}>
        <span className={styles.dot} />
        <span>{title}</span>
      </span>
      {aside}
    </button>
  );
}
