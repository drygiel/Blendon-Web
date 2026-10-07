import { AMBER, MONO_S, NEUTRAL, circlePts, easeOut, hash, rgba } from '../draw.ts';
import type { Plate } from './types.ts';

/** How far the button's hover has eased in: the rays draw in to half and the protractor grows by a fifth. */
let drawIn = 0;

/** A protractor under the buy button; the pen's path ends circling the button itself. */
export const finale: Plate = {
  at: 'cta-button',
  // The button sits low on the last screen, so the protractor has to finish in a short scroll.
  span: 0.32,
  draw({ ink, ctx, sy, mobile, anchor, store }) {
    const g = anchor('cta-button');
    if (!g) return;
    const cx = g.cx;
    const cy = g.cy - sy;
    const target = store.cta.hover ? 1 : 0;
    drawIn += (target - drawIn) * 0.3;
    if (Math.abs(target - drawIn) < 0.003) drawIn = target;
    const rT = Math.max(g.w * 0.5 + 66, 172) * (mobile ? 0.84 : 1) * (1 + 0.2 * drawIn);
    // Lower half only, so the headline above stays clean.
    ink.poly(circlePts(cx, cy, rT, Math.PI, -Math.PI, 90), 0.05, 0.4, { a: 0.18 });
    ink.poly(
      [
        [cx - rT - 14, cy],
        [cx + rT + 14, cy],
      ],
      0.02,
      0.3,
      { a: 0.12, dash: [2, 4], noTip: true },
    );
    const nT = Math.floor(37 * ink.seg(0.3, 0.6));
    if (nT) {
      const tk = new Path2D();
      for (let i = 0; i < nT; i++) {
        const a = Math.PI - (i * Math.PI) / 36;
        const l = i % 6 === 0 ? 9 : 4;
        tk.moveTo(cx + Math.cos(a) * rT, cy + Math.sin(a) * rT);
        tk.lineTo(cx + Math.cos(a) * (rT - l), cy + Math.sin(a) * (rT - l));
      }
      ctx.strokeStyle = rgba(NEUTRAL, 0.24 * ink.I);
      ctx.lineWidth = 1;
      ctx.stroke(tk);
    }
    for (let i = 0; i <= 6; i++) {
      const deg = 180 + i * 30;
      const a = (-deg * Math.PI) / 180;
      ink.label(
        `${deg % 360}°`,
        cx + Math.cos(a) * (rT + 18),
        cy + Math.sin(a) * (rT + 18) + 4,
        0.45 + i * 0.03,
        0.52 + i * 0.03,
        { align: 'center', a: 0.36, font: MONO_S },
      );
    }
    const qb = easeOut(ink.seg(0.35, 0.95)) * (1 - 0.5 * drawIn);
    if (qb > 0) {
      const pa = new Path2D();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI;
        const l = rT * (0.08 + 0.4 * hash(i + 9)) * qb;
        pa.moveTo(cx + Math.cos(a) * (rT + 36), cy + Math.sin(a) * (rT + 36));
        pa.lineTo(cx + Math.cos(a) * (rT + 36 + l), cy + Math.sin(a) * (rT + 36 + l));
      }
      ctx.strokeStyle = rgba(AMBER, 0.1 * ink.I);
      ctx.stroke(pa);
    }
    // Asks for the next frame while the rays ease.
    return drawIn !== target;
  },
};
