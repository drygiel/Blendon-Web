// The page's one set of Blendon settings: the settings window publishes what it shows, the Scene view
// reads it, so switching a feature off in the window switches it off in the scene too.
export type SharedValue = string | number | boolean;

export interface SettingsReader {
  val(key: string): SharedValue | undefined;
  /** A shortcut's live binding, the same as Keymap.binding. */
  shortcut(id: string): string;
  pieOn(pieId: string): boolean;
}

let reader: SettingsReader | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const SharedSettings = {
  /** The settings window's live values, or null before it has loaded. */
  get reader() {
    return reader;
  },

  /** Bumped on every publish, for holders of text filled from a setting. */
  get version() {
    return version;
  },

  publish(r: SettingsReader) {
    reader = r;
    version++;
    for (const l of listeners) l();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};
