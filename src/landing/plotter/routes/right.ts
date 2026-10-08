import type { LaidRoute, RouteCtx, RouteFn } from './types.ts';

/** From the underline's end across to the right margin, down it and back to the rail under the section. */
export const marginRoute = ({ index, end, right, back }: RouteCtx): LaidRoute => ({
  title: index,
  pts: [
    { x: right, y: end.y },
    { x: right, y: back },
  ],
});

/**
 * Passes the section down the right margin. When it takes over a route running on from the section before,
 * the pen comes down past the title, uncovering it on the way instead of writing it along an underline.
 */
export const right: RouteFn = (c) => {
  const { from, title, index, end, right: x, back } = c;
  if (!from) return marginRoute(c);
  return {
    title: index,
    along: ['keys-0', 'keys-1'],
    pts: [
      { x: from.x, y: title.top, r: 0, key: null, mark: 'keys-0' },
      { x: from.x, y: end.y, mark: 'keys-1' },
      { x, y: end.y },
      { x, y: back },
    ],
  };
};
