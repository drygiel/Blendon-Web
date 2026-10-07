import { SETTINGS_SLIDES } from '../../data/content.ts';
import { AMBER, MONO_S, NEUTRAL, SERIF_S } from '../draw.ts';
import type { Plate } from './types.ts';

// The lifted page eases toward the carousel's current slide.
let lift = 0;

/** The settings window as a fanned stack of pages; the carousel's current page lifts out in amber. */
export const pages: Plate = {
  draw({ ink, sy, W, title, content, store, reduce }) {
    if (!title || W < 1000) return;
    const n = SETTINGS_SLIDES.length;
    const cur = store.setup.slide;
    lift = Math.abs(cur - lift) < 0.002 ? cur : lift + (cur - lift) * (reduce ? 1 : 0.2);
    const hw = 92;
    const hh = 28;
    const gap = 11;
    const cx = content.right - hw - 30;
    const top = title.top - sy - 20;
    for (let i = 0; i < n; i++) {
      const near = Math.max(0, 1 - Math.abs(i - lift));
      const cy = top + hh + i * gap - near * 16;
      const a = 0.04 + i * 0.035;
      const on = i === cur;
      ink.poly(
        [
          [cx, cy - hh],
          [cx + hw, cy],
          [cx, cy + hh],
          [cx - hw, cy],
          [cx, cy - hh],
        ],
        a,
        a + 0.22,
        { c: on ? AMBER : NEUTRAL, hm: on ? 0 : 0.9, a: on ? 0.55 : 0.14 + near * 0.1, noTip: i !== n - 1 },
      );
    }
    const slide = SETTINGS_SLIDES[cur];
    const y = top + hh + cur * gap - 16;
    ink.poly(
      [
        [cx - hw, y],
        [cx - hw - 28, y],
      ],
      0.55,
      0.62,
      { c: AMBER, hm: 0, a: 0.4, noTip: true },
    );
    if (slide) {
      const label = `PAGE ${String(cur + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
      ink.label(label, cx - hw - 36, y - 3, 0.58, 0.7, { align: 'right', a: 0.5, font: MONO_S, c: AMBER });
      ink.label(slide.title, cx - hw - 36, y + 14, 0.62, 0.76, { align: 'right', font: SERIF_S, a: 0.55 });
    }
    ink.label('fig. 7 — ten pages, one window', cx + hw, top + hh * 2 + n * gap + 30, 0.7, 0.9, {
      font: SERIF_S,
      align: 'right',
      a: 0.5,
    });
    return lift !== cur;
  },
};
