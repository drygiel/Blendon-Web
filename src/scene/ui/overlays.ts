// Which of the Scene view's overlays are shown, as the Overlay Menu toolbar toggles them.
import { useSyncExternalStore } from 'react';

/** The top toolbar strip's height in points (44 px of the 175 % reference capture). */
export const TopStripHeight = 44 / 1.75;

export type OverlayId = 'tools' | 'toolSettings' | 'gridAndSnap' | 'drawModes' | 'viewOptions' | 'orientation';

const Defaults: Record<OverlayId, boolean> = {
  tools: true,
  toolSettings: true,
  gridAndSnap: true,
  drawModes: true,
  viewOptions: true,
  orientation: true,
};

let shown = { ...Defaults };
let version = 0;
const listeners = new Set<() => void>();

const changed = () => {
  version++;
  for (const l of listeners) l();
};

export const SceneOverlays = {
  isShown: (id: OverlayId) => shown[id],

  toggle(id: OverlayId) {
    shown = { ...shown, [id]: !shown[id] };
    changed();
  },

  reset() {
    shown = { ...Defaults };
    changed();
  },

  /** The top toolbar strip is there while any of its overlays is. */
  get topStrip() {
    return shown.gridAndSnap || shown.drawModes || shown.viewOptions;
  },

  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  version: () => version,
};

/** Re-renders on any overlay change. */
export function useOverlays() {
  useSyncExternalStore(SceneOverlays.subscribe, SceneOverlays.version, SceneOverlays.version);
  return SceneOverlays;
}
