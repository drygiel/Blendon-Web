import { useEffect, useRef, useState } from 'react';
import { REVEAL_EVENT } from './store.ts';

const DURATION_MS = 750;

/** A number whose digits roll through random values when the plotter reveals the element around it. */
export function Scramble({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const host = ref.current?.closest('[data-reveal]');
    if (!host) return;
    let raf = 0;
    const roll = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = (now - t0) / DURATION_MS;
        if (k >= 1) {
          setShown(value);
          return;
        }
        // Digits settle left to right.
        setShown(value.replace(/\d/g, (d, i: number) => (k > 0.55 + i * 0.06 ? d : String((Math.random() * 10) | 0))));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    host.addEventListener(REVEAL_EVENT, roll);
    return () => {
      host.removeEventListener(REVEAL_EVENT, roll);
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className="plot-scramble">
      {shown}
    </span>
  );
}
