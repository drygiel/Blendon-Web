import { useEffect, useRef } from 'react';

const px = (n: number) => (Math.round(n * 1000) / 1000).toString();

/**
 * A readout of the viewport sizes the plotter depends on, shown with `?viewport` in the address, in production
 * too. It checks a real phone or tablet, whose URL bar desktop emulation does not have. `stretch` is the bitmap's
 * pixels per CSS pixel across and down, and the two must match.
 */
export function ViewportReadout() {
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || !new URLSearchParams(window.location.search).has('viewport')) return;
    el.hidden = false;
    const root = document.documentElement;
    const update = () => {
      const c = document.querySelector<HTMLCanvasElement>('.plot-canvas');
      const r = c?.getBoundingClientRect();
      const vv = window.visualViewport;
      const lines = [
        `window  ${innerWidth} x ${innerHeight}`,
        `root    ${root.clientWidth} x ${root.clientHeight}`,
        `visual  ${vv ? `${px(vv.width)} x ${px(vv.height)} @${px(vv.scale)}` : '-'}`,
        `canvas  ${r ? `${px(r.width)} x ${px(r.height)}` : '-'}`,
        `bitmap  ${c ? `${c.width} x ${c.height}` : '-'}`,
        `stretch ${c && r?.width && r.height ? `${(c.width / r.width).toFixed(3)} / ${(c.height / r.height).toFixed(3)}` : '-'}`,
        `dpr     ${px(window.devicePixelRatio)}`,
        `scroll  ${Math.round(window.scrollY)} / ${root.scrollHeight - innerHeight}`,
      ];
      el.textContent = lines.join('\n');
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, []);

  return <pre ref={box} className="plot-readout" aria-hidden="true" hidden />;
}
