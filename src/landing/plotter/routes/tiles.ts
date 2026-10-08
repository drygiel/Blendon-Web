import { partIn } from '../contract.ts';
import { marginRoute } from './right.ts';
import type { RouteFn } from './types.ts';

/**
 * Comes down the right margin, turns left over the last tile and runs on between the last two into the next
 * section, which takes the route over. While the tiles do not sit in one row it keeps to the right margin.
 */
export const tiles: RouteFn = (c) => {
  const { section, index, end, right, rect } = c;
  const row = partIn(section, 'tiles');
  const boxes = row ? Array.from(row.children).map((t) => rect(t)) : [];
  const a = boxes[boxes.length - 2];
  const b = boxes[boxes.length - 1];
  if (!row || !a || !b || Math.abs(a.top - b.top) >= 2 || b.left <= a.right) return marginRoute(c);
  const above = partIn(section, 'above');
  const y = above ? (rect(above).bottom + b.top) / 2 : b.top - 12;
  return {
    title: index,
    continues: true,
    pts: [
      { x: right, y: end.y },
      { x: right, y },
      { x: (a.right + b.left) / 2, y },
    ],
  };
};
