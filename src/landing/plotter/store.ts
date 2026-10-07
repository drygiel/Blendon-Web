// State the page's widgets share with the background. Plain fields the plotter reads every frame;
// writing them never re-renders anything.

export const plotStore = {
  pie: {
    /** Pointer direction from the pie's centre in radians, GUI space (y down); null in the deadzone. */
    angle: null as number | null,
    /** Direction of the item the pointer picks, same space; null when nothing is picked. */
    hot: null as number | null,
    /** Ring radius on screen, in pixels. */
    radius: 0,
  },
  setup: {
    slide: 0,
  },
};

/** Dispatched on an element when the plotter reveals it. */
export const REVEAL_EVENT = 'plot:reveal';
