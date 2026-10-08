// What the plotter changes on the page: titles uncovered as the pen writes them, elements revealed once their
// title is written, the plot readout and the final button's pulse.
import { clamp } from '../draw.ts';
import { GHOST, JUMP, RING, UP, WRITE } from '../path.ts';
import { REVEAL_EVENT } from '../store.ts';
import { sectionLabel } from './page.ts';
import type { PlotState, TitleState } from './state.ts';

export interface HudParts {
  state: HTMLElement;
  section: HTMLElement;
  progress: HTMLElement;
}

/** How far a title has been written, its furthest; a page without one counts as written. */
export const titleP = (s: TitleState | null) => (s ? Number(s.el.dataset.penP ?? 0) : 1);

// Titles keep the furthest reveal they reached, so text never disappears again.
export function updateTitles(st: PlotState) {
  for (const s of st.titles) {
    const run = s.run;
    if (!run) continue;
    const p = clamp((st.pen.s - run.s0) / (run.s1 - run.s0 || 1));
    const maxP = Math.max(Number(s.el.dataset.penP ?? 0), p);
    if (maxP > Number(s.el.dataset.penP ?? 0)) s.el.dataset.penP = maxP >= 1 ? '1' : maxP.toFixed(3);
    const rv = maxP >= 1 ? s.blockW + 60 : Math.max(0, run.sx + maxP * (run.ex - run.sx) - s.blockLeft);
    if (Math.abs(rv - s.rv) > 0.4) {
      s.el.style.setProperty('--rv', `${rv.toFixed(1)}px`);
      s.rv = rv;
    }
    const edge = maxP > 0.002 && maxP < 0.995 ? 1 : 0;
    if (edge !== s.edge) {
      s.el.style.setProperty('--edge', String(edge));
      s.edge = edge;
    }
  }
}

export function reveal(el: HTMLElement, delay: number) {
  el.style.setProperty('--d', `${delay.toFixed(2)}s`);
  el.setAttribute('data-in', '');
  el.dispatchEvent(new CustomEvent(REVEAL_EVENT));
}

/** Uncovers what has come on screen once its title is written; true if anything was. */
export function updateReveals(st: PlotState): boolean {
  let order = 0;
  let fired = false;
  st.reveals = st.reveals.filter((r) => {
    if (r.top - st.sy > st.H * 0.9) return true;
    if (titleP(r.title) < (r.kind === 'type' ? 0.01 : 0.55)) return true;
    if (r.at) {
      const s = st.stations.find((x) => x.name === r.at);
      if (s && st.pen.s < s.s0) return true;
    }
    reveal(r.el, order++ * 0.09);
    fired = true;
    return false;
  });
  return fired;
}

/** The final button pulses once as the pen closes its ellipse, and again after the pen has left and come back. */
export function updateCta(st: PlotState) {
  const { ctaEl, path } = st;
  if (!ctaEl || !path || st.reduce) return;
  const done = st.ctaDone ? st.pen.s > path.total - 60 : st.pen.s >= path.total - 8;
  if (done !== st.ctaDone) ctaEl.toggleAttribute('data-plot-done', (st.ctaDone = done));
}

/** The plot readout in the corner: the pen's state, the section it is in and how far along it is. */
export function hudUpdater(hud: HudParts) {
  let at = 0;
  let text = '';
  return (st: PlotState, now: number) => {
    const { path, pen, titles } = st;
    if (st.reduce || now - at < 120 || !path) return;
    at = now;
    let cur: TitleState | undefined = titles[0];
    for (const s of titles) if (s.run && pen.s >= s.run.s0 - 1) cur = s;
    const [num, name] = sectionLabel(cur?.section);
    const state =
      pen.kind === WRITE
        ? 'writing'
        : pen.kind === JUMP
          ? 'leap'
          : pen.kind === RING
            ? 'circling'
            : pen.kind === UP || pen.kind === GHOST
              ? 'pen up'
              : 'pen down';
    const progress = `s ${Math.round(pen.s).toLocaleString('en-US')} px · ${Math.round((pen.s / (path.total || 1)) * 100)} %`;
    const next = `${state}|${num}|${name}|${progress}`;
    if (next === text) return;
    text = next;
    hud.state.textContent = `Plot · ${state}`;
    hud.section.textContent = `§ ${num || '--'} · ${name}`;
    hud.progress.textContent = progress;
  };
}
