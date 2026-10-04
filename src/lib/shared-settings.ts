// The page's one set of Blendon settings: the settings window publishes what it shows, the Scene view
// reads it, so switching a feature off in the window switches it off in the scene too.
export type SharedValue = string | number | boolean;

export interface SettingsReader {
  val(key: string): SharedValue | undefined;
  shortcut(id: string): string;
}

let reader: SettingsReader | null = null;
const listeners = new Set<() => void>();

export const SharedSettings = {
  /** The settings window's live values, or null before it has loaded. */
  get reader() {
    return reader;
  },

  publish(r: SettingsReader) {
    reader = r;
    for (const l of listeners) l();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};
