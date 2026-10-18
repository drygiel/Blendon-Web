// The page's one set of Blendon settings: the settings window publishes what it shows, the Scene view
// reads it, so switching a feature off in the window switches it off in the scene too.
import { PlaygroundEvents } from './events.ts';

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
// The window mounts after the Scene view; what the Scene view writes before then waits here for it.
let early: Record<string, SharedValue> = {};

function changed() {
  version++;
  for (const l of listeners) l();
}

// The dock's reset also drops what the window never took over.
PlaygroundEvents.on('reset', () => {
  if (reader || !Object.keys(early).length) return;
  early = {};
  changed();
});

export const SharedSettings = {
  /** The settings window's live values, or null before it has loaded. */
  get reader() {
    return reader;
  },

  /** Bumped on every publish, for holders of text filled from a setting. */
  get version() {
    return version;
  },

  /** The window's value, or before it has loaded what the Scene view wrote; undefined leaves the default. */
  val(key: string): SharedValue | undefined {
    return reader ? reader.val(key) : early[key];
  },

  /** What the Scene view wrote before the window loaded, for the window's first state. */
  get early(): Readonly<Record<string, SharedValue>> {
    return early;
  },

  /** A setting the Scene view changes itself (the badge's close button); the window writes it once loaded. */
  write(key: string, value: SharedValue) {
    if (reader) {
      PlaygroundEvents.emit('setSetting', { key, value });
      return;
    }
    early = { ...early, [key]: value };
    changed();
  },

  publish(r: SettingsReader) {
    reader = r;
    early = {};
    changed();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};
