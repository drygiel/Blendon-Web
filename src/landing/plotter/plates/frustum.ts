import { AMBER, SERIF, TAU, circlePts, lerp, type Pt } from '../draw.ts';
import type { Plate } from './types.ts';

/** The camera that sees the video: rays from an eye below the player to its corners, near plane and fov. */
export const frustum: Plate = {
  at: 'video-player',
  draw({ ink, sy, anchor, mobile }) {
    const v = anchor('video-player');
    if (!v) return;
    const L = v.left;
    const T = v.top - sy;
    const R = v.right;
    const B = v.bottom - sy;
    // The player spans the column, so the eye sits in the gap below it and looks up.
    const eye: Pt = [lerp(L, R, 0.24), B + Math.min(118, v.h * 0.22)];
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
    // Near plane: where the bottom rays cross a line a third of the way up.
    const nl: Pt = [lerp(ex, L, 0.34), lerp(ey, B, 0.34)];
    const nr: Pt = [lerp(ex, R, 0.34), lerp(ey, B, 0.34)];
    ink.poly([nl, nr], 0.42, 0.6, { c: AMBER, hm: 0, a: 0.36, hb: 0.8, dash: [3, 4] });
    const a1 = Math.atan2(B - ey, L - ex);
    const a2 = Math.atan2(B - ey, R - ex);
    ink.poly(circlePts(ex, ey, 46, a2, a1 - a2, 24), 0.5, 0.62, { c: AMBER, hm: 0, a: 0.45 });
    ink.label('fov 60°', ex + 54, ey + 4, 0.56, 0.7, { a: 0.5 });
    // A phone has no room for these beside the caption.
    if (!mobile) {
      ink.label('near 0.3', nr[0] + 8, nr[1] + 4, 0.58, 0.72, { a: 0.42 });
      ink.label('far 1000', L, B + 20, 0.62, 0.78, { a: 0.42 });
    }
    ink.label('fig. 1 — what the camera sees', R, B + 26, 0.68, 0.88, { font: SERIF, align: 'right', a: 0.55 });
  },
};
