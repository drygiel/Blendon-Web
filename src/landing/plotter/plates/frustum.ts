import { AMBER, SERIF, TAU, circlePts, lerp, type Pt } from '../draw.ts';
import type { Plate, Rect } from './types.ts';

/** The camera's eye above the player, in page coordinates, on a page wide enough to put it there. */
export function frustumEye(player: Rect, title: Rect | null, W: number): Pt | null {
  if (W < 1000 || !title) return null;
  return [lerp(player.left, player.right, 0.76), Math.min(player.top - 110, title.bottom - 48)];
}

/**
 * The camera that sees the video: rays from an eye to the player's corners, near plane and fov. On a wide
 * page the eye sits above the player, right of the title, leaving the gap below for the pen's way back;
 * a narrow page keeps it in the gap below the player, looking up.
 */
export const frustum: Plate = {
  at: 'video-player',
  // The pen sets it off as it touches the eye; a narrow page draws it by scroll.
  station: 'camera',
  draw({ ink, sy, W, anchor, mobile, title }) {
    const v = anchor('video-player');
    if (!v) return;
    const L = v.left;
    const T = v.top - sy;
    const R = v.right;
    const B = v.bottom - sy;
    const top = frustumEye(v, title, W);
    const above = top !== null;
    const eye: Pt = top ? [top[0], top[1] - sy] : [lerp(L, R, 0.24), B + Math.min(118, v.h * 0.22)];
    const edge = above ? T : B;
    const corners: Pt[] = [
      [L, T],
      [R, T],
      [R, B],
      [L, B],
    ];
    const [ex, ey] = eye;
    ink.poly(circlePts(ex, ey, 5, 0, TAU, 20), 0, 0.08, { a: 0.5, noTip: true });
    ink.poly(
      [
        [ex - 12, ey],
        [ex + 12, ey],
      ],
      0.02,
      0.1,
      { a: 0.4, noTip: true },
    );
    ink.poly(
      [
        [ex, ey - 12],
        [ex, ey + 12],
      ],
      0.02,
      0.1,
      { a: 0.4, noTip: true },
    );
    corners.forEach((c, k) => ink.poly([eye, c], 0.06 + k * 0.05, 0.36 + k * 0.05, { a: 0.15 }));
    // Near plane: where the rays to the facing edge cross a line a third of the way there.
    const nl: Pt = [lerp(ex, L, 0.34), lerp(ey, edge, 0.34)];
    const nr: Pt = [lerp(ex, R, 0.34), lerp(ey, edge, 0.34)];
    ink.poly([nl, nr], 0.42, 0.6, { c: AMBER, hm: 0, a: 0.36, hb: 0.8, dash: [3, 4] });
    const a1 = Math.atan2(edge - ey, L - ex);
    const a2 = Math.atan2(edge - ey, R - ex);
    const fov = above ? 40 : 46;
    ink.poly(circlePts(ex, ey, fov, a2, a1 - a2, 24), 0.5, 0.62, { c: AMBER, hm: 0, a: 0.45 });
    if (above) {
      ink.label('fov 60°', ex + fov + 10, ey - 6, 0.56, 0.7, { a: 0.5 });
      ink.label('near 0.3', nr[0] + 8, nr[1] - 6, 0.58, 0.72, { a: 0.42 });
      ink.label('far 1000', R, T - 12, 0.62, 0.78, { align: 'right', a: 0.42 });
      ink.label('fig. 1 — what the camera sees', R, ey - 34, 0.68, 0.88, { font: SERIF, align: 'right', a: 0.55 });
      return;
    }
    ink.label('fov 60°', ex + 54, ey + 4, 0.56, 0.7, { a: 0.5 });
    // A phone has no room for these beside the caption.
    if (!mobile) {
      ink.label('near 0.3', nr[0] + 8, nr[1] + 4, 0.58, 0.72, { a: 0.42 });
      ink.label('far 1000', L, B + 20, 0.62, 0.78, { a: 0.42 });
    }
    ink.label('fig. 1 — what the camera sees', R, B + 26, 0.68, 0.88, { font: SERIF, align: 'right', a: 0.55 });
  },
};
