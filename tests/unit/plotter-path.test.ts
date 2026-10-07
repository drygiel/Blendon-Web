import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FINALE,
  GHOST,
  INTRO_END,
  JUMP,
  RAIL,
  RING,
  RING_SCROLL,
  ROUTE_LINE,
  STATION_LINE,
  UP,
  WRITE,
  bAtScroll,
  buildPath,
  introS,
  posAt,
  sAtB,
  sAtY,
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

  it('lands while the station is still low on screen, and leaves the circle to time', () => {
    const st = withPie.stations[0];
    const land = keys.find((k) => k.b === st?.b0);
    expect(land?.sc).toBe(pie.cy - H * STATION_LINE);
    const s = sAtB(withPie, bAtScroll(keys, (land?.sc ?? 0) - 1));
    expect(s).toBeLessThan(st?.s0 ?? 0);
    const closed = keys.find((k) => k.b === st?.b1);
    expect((closed?.sc ?? Infinity) - (land?.sc ?? 0)).toBe(RING_SCROLL);
  });

  it('leaps from higher up the rail when asked to', () => {
    const early = buildPath({
      titles,
      railX: 94,
      origin: { x: 720, y: 700 },
      cta: null,
      detours: [{ ...pie, from: pie.cy - 150 }],
    });
    const st = early.stations[0];
    expect(st?.fromY).toBe(pie.cy - 150);
    const start = posAt(early, st?.sJump ?? 0);
    expect(start.x).toBeCloseTo(94, 0);
    expect(start.y).toBeCloseTo(pie.cy - 150, 0);
    expect(posAt(early, st?.s0 ?? 0).y).toBeCloseTo(pie.cy, 0);
  });
});

describe('plotter title lines and marks', () => {
  it('writes a title along another line when asked, timed by its underline', () => {
    const over = buildPath({
      titles: titles.map((t, i) => (i === 2 ? { ...t, lineY: t.top - 120 } : t)),
      railX: 94,
      origin: { x: 720, y: 700 },
      cta: null,
    });
    const run = over.runs[2];
    expect(run?.uy).toBe((titles[2]?.top ?? 0) - 120);
    expect(run?.ky).toBe((titles[2]?.bottom ?? 0) + 6);
    const keys = scrollKeyframes(over, H, maxScroll);
    const done = keys.find((k) => k.b === run?.b1);
    expect((run?.ky ?? 0) - (done?.sc ?? 0)).toBeGreaterThan(H * 0.3);
  });

  it('leaps straight from the end of the title line, with no stop on the rail', () => {
    const pie = { title: 3, name: 'pie', cx: 900, cy: 3500, r: 190, fromTitle: true };
    const leap = buildPath({ titles, railX: 94, origin: { x: 720, y: 700 }, cta: null, detours: [pie] });
    const st = leap.stations[0];
    const run = leap.runs[3];
    expect(st?.fromTitle).toBe(true);
    expect(st?.iJump).toBe(run?.i1);
    expect(leap.kind[(run?.i1 ?? 0) + 1]).toBe(JUMP);
    const keys = scrollKeyframes(leap, H, maxScroll);
    const after = keys.findIndex((k) => k.b === run?.b1);
    expect(keys[after + 1]?.b).toBe(st?.b0);
  });

  it('hides the pen along legs marked as out of sight', () => {
    const hidden = buildPath({
      titles,
      railX: 94,
      origin: { x: 720, y: 700 },
      cta: null,
      routes: [
        {
          title: 2,
          pts: [
            { x: 900, y: 2900, r: 0, mark: 'in' },
            { x: 900, y: 3100, r: 0, ghost: true, mark: 'out' },
            { x: 900, y: 3200 },
          ],
        },
      ],
    });
    const a = hidden.s.findIndex((v) => v >= (hidden.marks.get('in') ?? 0));
    const b = hidden.s.findIndex((v) => v >= (hidden.marks.get('out') ?? 0));
    for (let i = a + 1; i <= b; i++) expect(hidden.kind[i]).toBe(GHOST);
    expect(hidden.kind[b + 1]).not.toBe(GHOST);
  });

  it('names route points by their arc length', () => {
    const named = buildPath({
      titles,
      railX: 94,
      origin: { x: 720, y: 700 },
      cta: null,
      routes: [
        {
          title: 2,
          startMark: 'in',
          pts: [
            { x: 900, y: 2900, r: 0, mark: 'eye' },
            { x: 900, y: 3000 },
          ],
        },
      ],
    });
    const eye = posAt(named, named.marks.get('eye') ?? 0);
    expect(eye.x).toBeCloseTo(900, 0);
    expect(eye.y).toBeCloseTo(2900, 0);
    expect(named.marks.get('in')).toBe(named.runs[2]?.s1);
  });
});

describe('plotter routes through several sections', () => {
  // The fourth title's route runs on past the fifth title, which it uncovers on the way down.
  const through = buildPath({
    titles: titles.map((t, i) => (i === 4 ? { ...t, along: ['in', 'out'] as [string, string] } : t)),
    railX: 94,
    origin: { x: 720, y: 700 },
    cta: null,
    routes: [
      {
        title: 3,
        continues: true,
        pts: [
          { x: 1300, y: titles[3].bottom + 6 },
          { x: 1300, y: 3800 },
        ],
      },
      {
        title: 4,
        pts: [
          { x: 1300, y: titles[4].top, r: 0, key: null, mark: 'in' },
          { x: 1300, y: titles[4].bottom, r: 0, key: 0.3, mark: 'out' },
          { x: 1300, y: 4300 },
        ],
      },
    ],
  });
  const keys = scrollKeyframes(through, H, maxScroll);

  it('uncovers the title along the route, with no branch of the rail under it', () => {
    const run = through.runs[4];
    expect(run?.along).toBe(true);
    expect(run?.s0).toBe(through.marks.get('in'));
    expect(run?.s1).toBe(through.marks.get('out'));
    expect(posAt(through, run?.s0 ?? 0).x).toBeCloseTo(1300, 0);
    // Nothing on the rail between the fourth title and the route's return under the fifth section.
    for (let i = through.runs[3]?.i1 ?? 0; i < (through.runs[5]?.i0 ?? 0); i++) {
      if (through.y[i] > (titles[3]?.bottom ?? 0) + 40 && through.y[i] < 4260)
        expect(through.x[i]).toBeGreaterThan(1200);
    }
  });

  it('reaches a point at its own screen line, the scroll before it giving way', () => {
    const out = keys.find((k) => k.b === through.b[through.legs.get(4)?.[1]?.i ?? 0]);
    expect(out?.sc).toBe((titles[4]?.bottom ?? 0) - H * 0.3);
    for (let j = 1; j < keys.length; j++) expect(keys[j]?.sc).toBeGreaterThan(keys[j - 1]?.sc ?? Infinity);
  });
});

describe('plotter routes', () => {
  // The second title passes its section down the right margin and crosses back under it.
  const back = 2120;
  const right = buildPath({
    titles,
    railX: 94,
    origin: { x: 720, y: 700 },
    cta: null,
    routes: [
      {
        title: 1,
        pts: [
          { x: 1346, y: titles[1].bottom + 6 },
          { x: 1346, y: back },
        ],
      },
    ],
  });
  const keys = scrollKeyframes(right, H, maxScroll);
  const near = (x: number, y: number) =>
    Array.from({ length: right.n }, (_, i) => Math.hypot(right.x[i] - x, right.y[i] - y)).some((d) => d < 30);

  it('draws on past the underline, down the right and back to the rail', () => {
    const run = right.runs[1];
    expect(right.kind[(run?.i1 ?? 0) + 1]).toBe(RAIL);
    expect(near(1346, 1700)).toBe(true);
    expect(near(700, back)).toBe(true);
    // Nothing of the plain rail beside the section: the pen is on the right meanwhile.
    for (let i = run?.i1 ?? 0; i < (right.runs[2]?.i0 ?? 0); i++) {
      if (right.y[i] > (run?.uy ?? 0) + 40 && right.y[i] < back - 40) expect(right.x[i]).toBeGreaterThan(1300);
    }
    expect(right.legs.get(1)).toHaveLength(3);
  });

  it('keeps the pen on screen down the route and the keyframes ascending', () => {
    for (let j = 1; j < keys.length; j++) expect(keys[j]?.sc).toBeGreaterThan(keys[j - 1]?.sc ?? Infinity);
    for (let sc = 0; sc <= maxScroll; sc += 20) {
      const p = posAt(right, sAtB(right, bAtScroll(keys, sc)));
      if (p.x > 1300) {
        expect(p.y - sc).toBeGreaterThan(0);
        expect(p.y - sc).toBeLessThan(H);
      }
    }
    const down = right.legs.get(1)?.[1];
    const at = keys.find((k) => k.b === right.b[down?.i ?? 0]);
    expect(down?.horizontal).toBe(false);
    expect(at?.sc).toBeLessThanOrEqual((down?.y ?? 0) - H * ROUTE_LINE);
  });

  it('finds the point of a downward stretch level with a row', () => {
    const run = path.runs[2];
    const next = path.runs[3];
    const s = sAtY(path, 2500, run?.i1 ?? 0, next?.i0 ?? 0);
    const p = posAt(path, s ?? 0);
    expect(p.x).toBeCloseTo(94, 0);
    expect(p.y).toBeGreaterThanOrEqual(2500);
    expect(p.y).toBeLessThan(2510);
    expect(path.kind[p.i]).toBe(RAIL);
  });
});
