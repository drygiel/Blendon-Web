import { anchorIn, partIn } from '../contract.ts';
import { rulerOrigin } from '../plates/ruler.ts';
import type { LaidPoint, RouteFn } from './types.ts';

/**
 * Taps the point the ruler starts from, then runs along the ruler, down past the panel's right side, under it
 * and down between the two columns below.
 */
export const touch: RouteFn = ({ section, index, back, railX, H, rect }) => {
  const spot = anchorIn(section, 'ruler-space');
  if (!spot) return null;
  const [ox, oy] = rulerOrigin(rect(spot));
  const keys = partIn(section, 'keys');
  const panel = partIn(section, 'panel');
  const mods = partIn(section, 'cols');
  const cols = mods ? Array.from(mods.children).map((c) => rect(c)) : [];
  // Taps the ruler's zero while the keys above it are still a third of the screen from the bottom.
  const ky = keys ? rect(keys).cy : oy;
  const tap: LaidPoint[] = [
    { x: railX, y: oy },
    { x: ox, y: oy, r: 0, key: 0.66 + (oy - ky) / H, mark: 'ruler' },
  ];
  const [m0, m1] = cols;
  if (!panel || !m0 || !m1 || Math.abs(m0.top - m1.top) > 2 || m1.left < m0.right)
    return { title: index, fromRail: true, pts: tap };
  const p = rect(panel);
  const x = p.right + 28;
  const y = (p.bottom + m0.top) / 2;
  const gap = (m0.right + m1.left) / 2;
  return {
    title: index,
    fromRail: true,
    pts: [...tap, { x, y: oy }, { x, y }, { x: gap, y }, { x: gap, y: back }],
  };
};
