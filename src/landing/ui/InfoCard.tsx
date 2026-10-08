import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './InfoCard.module.scss';

interface CardGridProps extends HTMLAttributes<HTMLDivElement> {
  /** The narrowest a card gets before the row wraps, in pixels. */
  min: number;
}

/** A row of cards that wraps onto more rows, and to one column on a phone. */
export function CardGrid({ min, className, style, ...rest }: CardGridProps) {
  return (
    <div
      {...rest}
      className={cx(styles.grid, className)}
      style={{ ...style, '--card-min': `${min}px` } as CSSProperties}
    />
  );
}

interface InfoCardProps {
  label?: string;
  title?: string;
  /** Picked out in the accent colour. */
  accent?: boolean;
  children: ReactNode;
}

/** A card of the landing's grids: an optional label and title over its text or list. */
export function InfoCard({ label, title, accent = false, children }: InfoCardProps) {
  return (
    <div className={cx(styles.card, accent && styles.accent)}>
      {label && <span className={styles.label}>{label}</span>}
      {title && <span className={styles.title}>{title}</span>}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
