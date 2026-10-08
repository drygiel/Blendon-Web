import { anchorIn } from '../contract.ts';
import { frustumEye } from '../plates/frustum.ts';
import { marginRoute } from './right.ts';
import type { RouteFn } from './types.ts';

/** How far above a section's eyebrow a route that passes over its title runs. */
const OVER_TITLE = 100;

/**
 * Writes the title from a line above it, drops onto the video camera's eye, follows its ray out to the right
 * margin and goes down there. Without the camera in view it keeps to the right margin.
 */
export const camera: RouteFn = (c) => {
  const { section, title, index, right, back, W, rect } = c;
  const player = anchorIn(section, 'video-player');
  const eyebrow = section.querySelector('[data-eyebrow]');
  const v = player ? rect(player) : null;
  const eye = v ? frustumEye(v, rect(title.el), W) : null;
  if (!v || !eye || !eyebrow || v.right <= eye[0]) return marginRoute(c);
  const [ex, ey] = eye;
  // Out along the ray to the player's top right corner, as far as the margin.
  const yd = ey + ((v.top - ey) * (right - ex)) / (v.right - ex);
  return {
    title: index,
    lineY: rect(eyebrow).top - OVER_TITLE,
    pts: [
      { x: ex, y: rect(eyebrow).top - OVER_TITLE },
      // Reached while the section is only halfway up the screen, so a quick scroll still sees it set off.
      { x: ex, y: ey, r: 0, key: 0.65, mark: 'camera' },
      { x: right, y: yd },
      { x: right, y: back },
    ],
  };
};
