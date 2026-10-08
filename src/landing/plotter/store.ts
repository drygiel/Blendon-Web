// State the page's widgets share with the background. Plain fields the plotter reads every frame;
// writing them never re-renders anything.

export const plotStore = {
  pie: {
    /** Ring radius on screen, in pixels. */
    radius: 0,
    /** The pie's stage; the plotter lights its glow and pointer layers through --glow and --paper. */
    stage: null as HTMLElement | null,
  },
  setup: {
    slide: 0,
  },
  cta: {
    /** The pointer or focus is on the final button. */
    hover: false,
  },
};

/** The pointer or focus on the final button: the plotter reads the store, the footer's aurora `html[data-cta-hover]`. */
export function setCtaHover(on: boolean) {
  plotStore.cta.hover = on;
  document.documentElement.toggleAttribute('data-cta-hover', on);
}

/** Dispatched on an element when the plotter reveals it. */
export const REVEAL_EVENT = 'plot:reveal';
