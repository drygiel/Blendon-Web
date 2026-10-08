import { partIn } from '../contract.ts';
import type { RouteFn } from './types.ts';

/** Halfway across, down between the two columns of the section's row. */
export const middle: RouteFn = ({ section, index, end, back, rect }) => {
  const row = partIn(section, 'cols');
  const a = row?.children[0];
  const b = row?.children[1];
  if (!a || !b) return null;
  const l = rect(a);
  const r = rect(b);
  if (r.left < l.right || Math.abs(l.top - r.top) > 2) return null;
  const x = (l.right + r.left) / 2;
  return {
    title: index,
    pts: [
      { x, y: end.y },
      { x, y: back },
    ],
  };
};
