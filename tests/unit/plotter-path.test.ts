import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FINALE,
  INTRO_END,
  JUMP,
  RING,
  STATION_LINE,
  UP,
  WRITE,
  bAtScroll,
  buildPath,
  introS,
  posAt,
  sAtB,
  scrollKeyframes,
  type TitleBox,
} from '../../src/landing/plotter/path.ts';
import { PenTitle } from '../../src/landing/plotter/PenTitle.tsx';
import { TypeText } from '../../src/landing/plotter/TypeText.tsx';

// A page like the landing: a centred hero title, then left-aligned section titles every ~900 px.
const titles: TitleBox[] = [
  { left: 300, right: 1100, top: 200, bottom: 420 },
  ...Array.from({ length: 6 }, (_, i) => {
    const top = 1200 + i * 900;
    return { left: 128, right: 128 + 400 + i * 60, top, bottom: top + 120 };
  }),
];
const path = buildPath({
  titles,
  railX: 94,
  origin: { x: 720, y: 700 },
  cta: { cx: 720, cy: 6900, w: 230, h: 60 },
});
const H = 900;
const maxScroll = 6800;
const kf = scrollKeyframes(path, H, maxScroll);

describe('plotter path', () => {
  it('writes one run per title, each left to right along its underline', () => {
    expect(path.runs).toHaveLength(titles.length);
    path.runs.forEach((r, i) => {
      expect(r.s1).toBeGreaterThan(r.s0);
      expect(r.ex).toBeGreaterThan(r.sx);
      expect(r.uy).toBeGreaterThan(titles[i]?.bottom ?? 0);
      for (let j = r.i0 + 1; j <= r.i1; j++) expect(path.kind[j]).toBe(WRITE);
    });
    // Later runs start where earlier ones end.
    for (let i = 1; i < path.runs.length; i++) {
      expect(path.runs[i]?.s0).toBeGreaterThan(path.runs[i - 1]?.s1 ?? Infinity);
    }
  });

  it('starts with a pen-up flight from the origin and ends circling the button', () => {
    expect(path.kind[1]).toBe(UP);
    expect(path.kind[path.n - 1]).toBe(FINALE);
    const end = posAt(path, path.total);
    expect(Math.hypot(end.x - 720, end.y - 6900)).toBeLessThan(200);
  });

  it('keeps scroll keyframes ascending and inside the scroll range', () => {
    expect(kf[0]).toEqual({ sc: 0, b: path.runs[0]?.b1 });
    for (let j = 1; j < kf.length; j++) {
      expect(kf[j]?.sc).toBeGreaterThan(kf[j - 1]?.sc ?? Infinity);
      expect(kf[j]?.b).toBeGreaterThanOrEqual(kf[j - 1]?.b ?? Infinity);
    }
    expect(kf[kf.length - 1]?.sc).toBe(maxScroll);
    expect(kf[kf.length - 1]?.b).toBe(path.b[path.n - 1]);
  });

  it('moves the pen forward and continuously as the page scrolls', () => {
    let prev = sAtB(path, bAtScroll(kf, 0));
    for (let sc = 10; sc <= maxScroll; sc += 10) {
      const s = sAtB(path, bAtScroll(kf, sc));
      expect(s).toBeGreaterThanOrEqual(prev);
      // A few pixels of scroll never jump the pen across the page.
      expect(s - prev).toBeLessThan(400);
      prev = s;
    }
    expect(prev).toBeCloseTo(path.total, 3);
  });

  it('finishes each title while it is in the reading zone', () => {
    path.runs.slice(1).forEach((r) => {
      const done = kf.find((k) => k.b === r.b1);
      expect(done).toBeDefined();
      const onScreen = r.uy - (done?.sc ?? 0);
      expect(onScreen).toBeGreaterThan(H * 0.3);
      expect(onScreen).toBeLessThan(H * 0.75);
    });
  });

  it('writes the hero title during the opening and stops at its end', () => {
    const r = path.runs[0];
    expect(introS(path, 0)).toBe(0);
    expect(introS(path, INTRO_END)).toBe(r?.s1);
    expect(introS(path, INTRO_END + 5)).toBe(r?.s1);
  });
});

describe('plotter markup', () => {
  it('renders a pen title whose outline copy is hidden from assistive tech', () => {
    const html = renderToString(createElement(PenTitle, { as: 'h1', children: 'Rewired' }));
    expect(html).toContain('data-pen=""');
    expect(html).toMatch(/<span class="plot-ink">Rewired<\/span>/);
    expect(html).toMatch(/<span class="plot-ghost" aria-hidden="true">Rewired<\/span>/);
  });

  it('types text as one span per character, accent first', () => {
    const html = renderToString(createElement(TypeText, { text: '01 / X', accent: 2 }));
    expect(html).toContain('data-reveal="type"');
    expect(html.match(/class="plot-ch plot-ch-accent"/g)).toHaveLength(2);
    expect(html.match(/class="plot-ch"/g)).toHaveLength(4);
  });
});

describe('plotter station', () => {
  // The fourth title's section holds a pie whose centre sits 500 px under the title.
  const pie = { title: 3, name: 'pie', cx: 900, cy: 3300, r: 190 };
  const withPie = buildPath({ titles, railX: 94, origin: { x: 720, y: 700 }, cta: null, detours: [pie] });
  const keys = scrollKeyframes(withPie, H, maxScroll);

  it('leaps from the rail into the station after its title, then circles it', () => {
    const st = withPie.stations[0];
    expect(st?.name).toBe('pie');
    const run = withPie.runs[3];
    expect(st?.sJump).toBeGreaterThan(run?.s1 ?? Infinity);
    const landing = posAt(withPie, st?.s0 ?? 0);
    expect(landing.x).toBeCloseTo(pie.cx, 0);
    expect(landing.y).toBeCloseTo(pie.cy, 0);
    for (let i = (st?.iJump ?? 0) + 1; i <= (st?.i0 ?? 0); i++) expect(withPie.kind[i]).toBe(JUMP);
    for (let i = (st?.i0 ?? 0) + 1; i <= (st?.i1 ?? 0); i++) expect(withPie.kind[i]).toBe(RING);
  });

  it('lands as the station reaches the middle of the screen', () => {
    const st = withPie.stations[0];
    const land = keys.find((k) => k.b === st?.b0);
    expect(land?.sc).toBe(pie.cy - H * STATION_LINE);
    const s = sAtB(withPie, bAtScroll(keys, (land?.sc ?? 0) - 1));
    expect(s).toBeLessThan(st?.s0 ?? 0);
  });
});
