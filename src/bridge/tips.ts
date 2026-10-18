// ShortcutTips.AnySeen between the parts of the Playground: the Scene view's tips answer it, and the window
// asks, so it offers "Show Again" only when that would do something.
let reader: (() => boolean) | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const TipsSeen = {
  /** Any card shown this visit for the keys as they are now; false before the tips have loaded. */
  any: () => reader?.() ?? false,

  get version() {
    return version;
  },

  /** The tips say how they answer once, then call `changed` whenever the answer may differ. */
  register(r: () => boolean) {
    reader = r;
    TipsSeen.changed();
  },

  changed() {
    version++;
    for (const l of listeners) l();
  },

  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};
