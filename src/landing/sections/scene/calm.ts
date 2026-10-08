// The Try It dock's heavy parts (the Scene view, the settings window) stall the page for a moment as they mount.
// They load as soon as they come near, then mount one at a time while the visitor is not scrolling, so the stall
// never shows mid-scroll.
import { useEffect, useState, type RefObject } from 'react';

/** Scroll that has stood still this long counts as calm; by then the plotter's pen has settled as well. */
const QUIET_MS = 400;
/** Within this of the viewport a part loads, and mounts at the next calm moment. */
const NEAR = '400% 0px';
/** Within this it mounts at once, calm or not, so nobody scrolls onto an empty pane. */
const CLOSE = '50% 0px';

interface Job {
  run: () => Promise<void>;
  urgent: boolean;
}

const queue: Job[] = [];
let busy = false;
let lastScroll = -Infinity;
let timer = 0;
let listening = false;

const onScroll = () => void (lastScroll = performance.now());

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

function listen() {
  if (listening) return;
  listening = true;
  // A part usually comes near because the visitor is scrolling, so the quiet starts counting now.
  lastScroll = performance.now();
  for (const type of ['scroll', 'wheel', 'touchmove'] as const)
    window.addEventListener(type, onScroll, { passive: true });
}

function pump() {
  window.clearTimeout(timer);
  if (busy || !queue.length) return;
  const wait = QUIET_MS - (performance.now() - lastScroll);
  const urgent = queue.findIndex((j) => j.urgent);
  const k = urgent >= 0 ? urgent : wait <= 0 ? 0 : -1;
  if (k < 0) {
    timer = window.setTimeout(pump, wait + 20);
    return;
  }
  const [job] = queue.splice(k, 1);
  busy = true;
  // A frame between parts, so one stall never runs straight into the next.
  const next = () => void frames(1).then(() => ((busy = false), pump()));
  job.run().then(next, next);
}

/**
 * A heavy part of the dock: once `ref` comes near, `load` runs and the part may mount at the next calm moment, or
 * at once when it comes close. True once the part may render.
 */
export function useCalmMount(ref: RefObject<Element | null>, load: () => Promise<unknown>, enabled = true): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let live = true;
    let started = false;
    let urgent = false;
    let job: Job | null = null;
    const start = () => {
      if (started) return;
      started = true;
      listen();
      void load().then(() => {
        if (!live) return;
        job = {
          run: async () => {
            if (live) setReady(true);
            // Its first frames are part of the stall.
            await frames(2);
          },
          urgent,
        };
        queue.push(job);
        pump();
      });
    };
    const hurry = () => {
      urgent = true;
      if (job) job.urgent = true;
      pump();
    };
    const near = new IntersectionObserver(([e]) => e?.isIntersecting && start(), { rootMargin: NEAR });
    const close = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        start();
        hurry();
      },
      { rootMargin: CLOSE },
    );
    near.observe(el);
    close.observe(el);
    return () => {
      live = false;
      near.disconnect();
      close.disconnect();
    };
  }, [ref, load, enabled]);
  return ready;
}
