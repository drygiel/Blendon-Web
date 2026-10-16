// Messages between the parts of the Playground, which load and mount on their own: the dock, the Scene view
// and the settings window.

interface EventMap {
  /** The dock's reset button: the scene, every setting and the tutorial back to the start. */
  reset: void;
  /** A shortcut tip's "Open in Blendon": the Keyboard page, with that shortcut's row lit. */
  openKeyboard: { id?: string };
  /** The tutorial badge's link: a page of the window, with one row lit. */
  openSettings: { page: string; hl?: string };
  /** A setting the Scene view changes itself (the badge's close button), written by the window. */
  setSetting: { key: string; value: string | number | boolean };
  /** The window's "bring back dismissed tips". */
  tipsReset: void;
}

type EventName = keyof EventMap;
type Payload<K extends EventName> = EventMap[K] extends void ? [] : [EventMap[K]];

const target = new EventTarget();

export const PlaygroundEvents = {
  emit<K extends EventName>(name: K, ...detail: Payload<K>) {
    target.dispatchEvent(new CustomEvent(name, { detail: detail[0] }));
  },

  /** Calls `fn` on every `name` event until the returned function is called. */
  on<K extends EventName>(name: K, fn: (detail: EventMap[K]) => void): () => void {
    const listener = (e: Event) => fn((e as CustomEvent<EventMap[K]>).detail);
    target.addEventListener(name, listener);
    return () => target.removeEventListener(name, listener);
  },
};
