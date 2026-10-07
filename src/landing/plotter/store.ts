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
};

/** Dispatched on an element when the plotter reveals it. */
export const REVEAL_EVENT = 'plot:reveal';
