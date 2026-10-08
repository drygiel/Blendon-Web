import { anchorIn } from '../contract.ts';
import { curveGeometry } from '../plates/curve.ts';
import type { RouteFn } from './types.ts';

/** Runs down the rail ahead of the scroll, draws the learning curve and comes back round its right side. */
export const chart: RouteFn = ({ section, index, right, back, railX, rect }) => {
  const plot = anchorIn(section, 'tutorial-plot');
  if (!plot) return null;
  const { pts } = curveGeometry(rect(plot));
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return null;
  return {
    title: index,
    fromRail: true,
    startMark: 'chart-in',
    pts: [
      // Down the rail ahead of the scroll, to reach the curve's start as it comes into view.
      { x: railX, y: first[1], key: 0.88, gap: 160 },
      { x: first[0], y: first[1], r: 0, key: null, mark: 'chart-0' },
      ...pts.slice(1, -1).map(([x, y]) => ({ x, y, r: 0, key: null })),
      { x: last[0], y: last[1], r: 0, key: 0.2, mark: 'chart-1' },
      { x: right, y: last[1], mark: 'chart-out' },
      { x: right, y: back },
    ],
  };
};
