import { anchorIn } from '../contract.ts';
import type { RouteFn } from './types.ts';

/**
 * Takes over the route running on from the section before: comes down beside the title, uncovering it, and
 * flashes where the network grows from. Then gone into the network and out of sight behind the playground,
 * until it comes out underneath.
 */
export const net: RouteFn = ({ section, title, index, next, box, H, W, from, rect }) => {
  if (!from) return null;
  const dock = anchorIn(section, 'try-dock');
  if (!dock) return null;
  const d = rect(dock);
  const mid = (title.top + title.bottom) / 2;
  // Out from under the playground in the middle, clear of the next title's words.
  const cx = Math.max(W / 2, (next?.right ?? 0) + 48);
  return {
    title: index,
    continues: true,
    // The title is uncovered as the pen comes down beside it, whole by the time it flashes.
    along: ['try-0', 'net'],
    pts: [
      { x: from.x, y: title.top - 60, r: 0, key: null, mark: 'try-0' },
      // Flashes while the section's top is still in the middle of the screen.
      { x: from.x, y: mid, r: 0, key: 0.5 + (mid - box.top) / H, mark: 'net' },
      { x: from.x, y: d.top + 60, ghost: true },
      { x: cx, y: d.top + 200, ghost: true },
      { x: cx, y: d.bottom + 24, key: 0.55, ghost: true },
    ],
  };
};
