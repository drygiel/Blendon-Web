import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/hooks.ts';
import { startPlotter } from './engine/index.ts';
import { ViewportReadout } from './ViewportReadout.tsx';

/**
 * The background plotter: canvas, vignette and the plot readout. The page tells it what to use through data
 * attributes: `data-pen` on titles the pen writes, `data-plate` on sections with a drawing, `data-plot-anchor`
 * on elements a drawing measures, and `data-reveal` on elements it uncovers by setting `data-in`.
 */
export function PlotterLayer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<HTMLSpanElement>(null);
  const section = useRef<HTMLSpanElement>(null);
  const progress = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const hud =
      state.current && section.current && progress.current
        ? { state: state.current, section: section.current, progress: progress.current }
        : null;
    const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('plotdebug');
    return startPlotter(c, { reduce: reduced, hud, debug });
  }, [reduced]);

  return (
    <>
      <canvas ref={canvas} className="plot-canvas" aria-hidden="true" />
      <div className="plot-vignette" aria-hidden="true" />
      <div className="plot-hud" aria-hidden="true">
        <span ref={state}>Plot · pen up</span>
        <span ref={section}>§ 00 · Scene view</span>
        <span ref={progress}>s 0 px · 0 %</span>
      </div>
      <ViewportReadout />
    </>
  );
}
