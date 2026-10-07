import { AMBER, MONO_S, NEUTRAL, SANS, SERIF_S, clamp, lerp, mix, rgba, type Pt } from '../draw.ts';
import type { Plate } from './types.ts';

const RIDER = 'at your own pace';

/**
 * Two habits on an oscilloscope: Unity's wave in grey, Blender's in amber, drifting into phase as the page
 * scrolls through the section, with a phrase riding the amber wave.
 */
export const waves: Plate = {
  draw({ ink, ctx, sy, W, title, content, scrub }) {
    if (!title || W < 1000) return;
    const w = Math.min(420, content.w * 0.36);
    const x0 = content.right - w;
    const x1 = content.right;
    const mid = title.top - sy + 70;
    const amp = 26;
    const k = (Math.PI * 2 * 2.5) / w;
    const phi = (1 - clamp(scrub * 1.6)) * Math.PI * 0.9;
    const wave = (shift: number): Pt[] => {
      const pts: Pt[] = [];
      for (let x = x0; x <= x1; x += 4) pts.push([x, mid - Math.sin((x - x0) * k + shift) * amp]);
      return pts;
    };

    // Screen frame and graticule, like the scope in the film.
    ink.poly(
      [
        [x0, mid],
        [x1, mid],
      ],
      0.02,
      0.2,
      { a: 0.14, dash: [2, 4], noTip: true, linear: true },
    );
    for (let i = 0; i <= 10; i++) {
      const x = lerp(x0, x1, i / 10);
      ink.poly(
        [
          [x, mid - 4],
          [x, mid + 4],
        ],
        0.1 + i * 0.01,
        0.14 + i * 0.01,
        { a: 0.2, noTip: true, linear: true },
      );
    }
    ink.poly(wave(0), 0.15, 0.55, { a: 0.3, linear: true });
    const amber = wave(phi);
    ink.poly(amber, 0.3, 0.75, { c: AMBER, hm: 0, a: 0.55, hb: 0.6, w: 1.4, linear: true });

    // The phrase rides the amber wave, spaced by distance along the curve so steep stretches don't crowd it.
    const q = ink.seg(0.3, 0.75);
    if (q > 0) {
      const ls = new Float64Array(amber.length);
      for (let i = 1; i < amber.length; i++) {
        ls[i] = ls[i - 1] + Math.hypot(amber[i][0] - amber[i - 1][0], amber[i][1] - amber[i - 1][1]);
      }
      const reach = ls[amber.length - 1] * q;
      ctx.font = SANS;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      let d = ls[amber.length - 1] * 0.2;
      let i = 1;
      for (const ch of RIDER) {
        const cw = ctx.measureText(ch).width * 1.08;
        const at = d + cw / 2;
        if (at > reach) break;
        while (i < amber.length - 1 && ls[i] < at) i++;
        const p0 = amber[i - 1];
        const p1 = amber[i];
        const f = (at - ls[i - 1]) / (ls[i] - ls[i - 1] || 1);
        const fresh = clamp(1 - (reach - at) / 120);
        ctx.save();
        ctx.translate(lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f));
        ctx.rotate(Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));
        ctx.fillStyle = rgba(mix(NEUTRAL, AMBER, 0.35 + 0.65 * fresh), (0.5 + 0.4 * fresh) * ink.I);
        ctx.fillText(ch, 0, -9);
        ctx.restore();
        d += cw;
      }
    }
    ink.label('UNITY', x0, mid + amp + 22, 0.5, 0.6, { a: 0.45, font: MONO_S });
    ink.label('BLENDER', x0 + 58, mid + amp + 22, 0.55, 0.65, { a: 0.55, font: MONO_S, c: AMBER });
    ink.label(`φ = ${phi.toFixed(2)} rad`, x1, mid + amp + 22, 0.6, 0.7, { align: 'right', a: 0.45, font: MONO_S });
    ink.label('fig. 8 — habits, drifting into phase', x1, mid - amp - 22, 0.7, 0.9, {
      font: SERIF_S,
      align: 'right',
      a: 0.5,
    });
  },
};
