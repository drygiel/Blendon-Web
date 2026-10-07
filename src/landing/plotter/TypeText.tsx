import type { CSSProperties } from 'react';
import { cx } from '../../lib/cx.ts';

interface TypeTextProps {
  text: string;
  /** How many leading characters take the accent colour. */
  accent?: number;
  className?: string;
}

/**
 * Text the plotter types out with a block cursor once revealed. Every character is its own span, rendered on
 * the server too, so the typing is pure CSS and React's DOM is never touched from outside.
 */
export function TypeText({ text, accent = 0, className }: TypeTextProps) {
  return (
    <span className={cx('plot-type', className)} data-reveal="type">
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className={i < accent ? 'plot-ch plot-ch-accent' : 'plot-ch'}
          style={{ '--i': i } as CSSProperties}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
