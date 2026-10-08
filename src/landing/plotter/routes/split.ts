import { clamp } from '../draw.ts';
import { partIn } from '../contract.ts';
import type { RouteFn } from './types.ts';

/** Right edge of an element's text, which may stop well short of its box. */
function textRight(el: Element | null | undefined): number {
  if (!el) return -Infinity;
  const rg = document.createRange();
  rg.selectNodeContents(el);
  let right = -Infinity;
  for (const q of Array.from(rg.getClientRects())) if (q.width > 1) right = Math.max(right, q.right);
  return right;
}

/**
 * Drops from the underline past the lead's last word, turns left halfway between the two columns and what
 * comes before them, and runs down between the columns.
 */
export const split: RouteFn = ({ section, index, end, back, rect }) => {
  const a = partIn(section, 'left');
  const b = partIn(section, 'right');
  if (!a || !b) return null;
  const l = rect(a);
  const r = rect(b);
  if (r.left < l.right + 8) return null;
  const lead = textRight(section.querySelector('p'));
  const x = clamp(Math.max(end.x, lead + 24), r.left + 40, r.right - 40);
  const before = partIn(section, 'above');
  const top = before ? (rect(before).bottom + Math.min(l.top, r.top)) / 2 : r.top - 12;
  const gap = (l.right + r.left) / 2;
  return {
    title: index,
    pts: [
      { x, y: end.y },
      { x, y: top },
      { x: gap, y: top },
      { x: gap, y: back },
    ],
  };
};
