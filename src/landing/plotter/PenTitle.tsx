import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

interface PenTitleProps {
  as?: 'h1' | 'h2';
  className?: string;
  children: ReactNode;
}

/**
 * A title the plotter's pen writes: the ink copy is uncovered left to right over an outline ghost. The ghost is
 * hidden from assistive tech, so the heading reads once.
 */
export function PenTitle({ as: Tag = 'h2', className, children }: PenTitleProps) {
  return (
    <Tag className={cx('plot-title', className)} data-pen="">
      <span className="plot-ink">{children}</span>
      <span className="plot-ghost" aria-hidden="true">
        {children}
      </span>
    </Tag>
  );
}
